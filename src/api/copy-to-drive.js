/**
 * Background job: copies uploaded files from the private R2 bucket into the
 * client's Google Drive folder ("<Business Name> — Assets").
 *
 * src/api/submit-assets.js puts one message per file on the queue
 * (env.COPY_QUEUE). Cloudflare then calls handleDriveCopyBatch() below, one
 * message at a time (see wrangler.toml). A message looks like:
 *
 *   { key, driveName, folderId, businessName, sessionUri? }
 *
 * - Small files (16 MB or less) are copied in one request.
 * - Big files use Google's resumable upload: 16 MB pieces are read from R2 and
 *   sent to Drive. After about 18 pieces the job puts itself back on the queue
 *   with the upload session saved, and carries on in a fresh run. That keeps
 *   every run well inside Cloudflare's per-run limits, so a file of any size works.
 * - If anything fails, Cloudflare retries the message. A retry first asks Drive
 *   how much it already has and carries on from there.
 * - If a file still fails after all retries, a note is saved in the client's R2
 *   folder (_drive-copy-errors) so the team can see it. The file itself is
 *   always safe in R2.
 */

import { getGoogleAccessToken, findOrCreateDriveFolder, uploadFileToDrive } from "../lib/drive.js";

// Settings are in an object so tests can shrink them.
export const LIMITS = {
  chunkBytes: 16 * 1024 * 1024,   // must be a multiple of 256 KiB (Google's rule)
  maxChunksPerRun: 18,            // keeps each run under the free plan's 50-request limit
  maxRetries: 6                   // keep in step with max_retries in wrangler.toml
};

let cachedToken = null;
async function getToken(env) {
  const now = Date.now();
  if (cachedToken && cachedToken.expires > now + 60000) return cachedToken.token;
  const token = await getGoogleAccessToken(env);
  cachedToken = { token, expires: now + 50 * 60 * 1000 };
  return token;
}

export async function handleDriveCopyBatch(batch, env) {
  for (const message of batch.messages) {
    try {
      await copyOne(message.body, env);
      message.ack();
    } catch (err) {
      console.error("Drive copy problem for", message.body && message.body.key, ":", err && err.message ? err.message : err);
      if (message.attempts > LIMITS.maxRetries) {
        await saveFailureNote(env, message.body, err);
        message.ack();
      } else {
        message.retry({ delaySeconds: Math.min(300, 20 * message.attempts) });
      }
    }
  }
}

async function copyOne(job, env) {
  const head = await env.UPLOADS.head(job.key);
  if (!head) throw new Error("File is missing from R2: " + job.key);
  const size = head.size;
  const type = (head.httpMetadata && head.httpMetadata.contentType) || "application/octet-stream";

  const token = await getToken(env);
  let folderId = job.folderId;
  if (!folderId) {
    const folder = await findOrCreateDriveFolder(token, env.GOOGLE_DRIVE_PARENT_FOLDER_ID, job.businessName + " — Assets");
    folderId = folder.id;
  }

  if (size <= LIMITS.chunkBytes) {
    const obj = await env.UPLOADS.get(job.key);
    if (!obj) throw new Error("File is missing from R2: " + job.key);
    const blob = new Blob([await obj.arrayBuffer()], { type });
    await uploadFileToDrive(token, folderId, blob, job.driveName);
    return;
  }

  await copyBigFile(job, env, token, folderId, size, type);
}

async function copyBigFile(job, env, token, folderId, size, type) {
  let sessionUri = job.sessionUri || "";
  let offset = 0;

  if (sessionUri) {
    const status = await askDriveHowMuch(sessionUri, token, size);
    if (status.done) return;
    if (status.expired) sessionUri = "";
    else offset = status.offset;
  }
  if (!sessionUri) sessionUri = await startSession(token, folderId, job.driveName, size, type);

  let pieces = 0;
  while (offset < size) {
    if (pieces >= LIMITS.maxChunksPerRun) {
      // Carry on in a fresh run, so this one stays inside Cloudflare's limits.
      await env.COPY_QUEUE.send({ key: job.key, driveName: job.driveName, folderId, businessName: job.businessName, sessionUri });
      return;
    }
    const end = Math.min(offset + LIMITS.chunkBytes, size);
    const obj = await env.UPLOADS.get(job.key, { range: { offset, length: end - offset } });
    if (!obj) throw new Error("File is missing from R2: " + job.key);
    const bytes = await obj.arrayBuffer();

    const res = await fetch(sessionUri, {
      method: "PUT",
      redirect: "manual",
      headers: { Authorization: "Bearer " + token, "Content-Range": "bytes " + offset + "-" + (end - 1) + "/" + size },
      body: bytes
    });
    if (res.status === 200 || res.status === 201) return;     // finished
    if (res.status === 308) { offset = committedOffset(res); pieces++; continue; }
    throw new Error("Drive piece upload failed (" + res.status + "): " + (await res.text()).slice(0, 300));
  }
}

async function startSession(token, folderId, name, size, type) {
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": type,
      "X-Upload-Content-Length": String(size)
    },
    body: JSON.stringify({ name, parents: [folderId] })
  });
  if (!res.ok) throw new Error("Drive could not start the upload (" + res.status + "): " + (await res.text()).slice(0, 300));
  const location = res.headers.get("Location");
  if (!location) throw new Error("Drive did not return an upload address");
  return location;
}

// Asks Drive how much of this file it already has.
async function askDriveHowMuch(sessionUri, token, size) {
  const res = await fetch(sessionUri, {
    method: "PUT",
    redirect: "manual",
    headers: { Authorization: "Bearer " + token, "Content-Range": "bytes */" + size, "Content-Length": "0" }
  });
  if (res.status === 200 || res.status === 201) return { done: true };
  if (res.status === 308) return { offset: committedOffset(res) };
  if (res.status === 404 || res.status === 410) return { expired: true };
  throw new Error("Drive status check failed (" + res.status + ")");
}

// Drive answers 308 with "Range: bytes=0-N" meaning it has bytes 0..N. No header means nothing yet.
function committedOffset(res) {
  const range = res.headers.get("Range");
  const m = range && /bytes=0-(\d+)/.exec(range);
  return m ? parseInt(m[1], 10) + 1 : 0;
}

async function saveFailureNote(env, job, err) {
  try {
    const slug = String(job && job.key ? job.key : "unknown").split("/")[0];
    const note = "This file could not be copied to Google Drive after several tries.\n\n" +
      "File in R2: " + (job && job.key) + "\nShould be named in Drive: " + (job && job.driveName) + "\n" +
      "Last error: " + (err && err.message ? err.message : String(err)) + "\n\n" +
      "The file itself is safe in R2. Download it from the file browser and add it to the Drive folder by hand.\n";
    await env.UPLOADS.put(slug + "/_drive-copy-errors/" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomUUID().slice(0, 6) + ".txt", note,
      { httpMetadata: { contentType: "text/plain; charset=UTF-8" } });
  } catch (e) {
    console.error("Could not save the Drive copy failure note:", e);
  }
}
