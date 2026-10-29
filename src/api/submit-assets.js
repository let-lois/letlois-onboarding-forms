/**
 * Handles POST /api/submit-assets — called from src/index.js.
 *
 * The files are NOT sent here. The form uploads them first, in pieces, to the
 * private R2 bucket (see src/api/upload.js). This handler then receives a small
 * JSON message with the answers plus the list of files that were uploaded:
 *
 *   business_name, top_3_services, offer_details
 *   before_after_photos_link, team_photos_link, videos_link   (links pasted instead of uploading)
 *   uploaded_files: { before_after_photos: [{key,name,size}], team_photos: [...], videos: [...] }
 *
 * On each request this:
 *   1. Saves any pasted links in the client's R2 folder as a small text file,
 *      so nothing lives only in the Sheet.
 *   2. Finds or creates the client's Drive folder ("<Business Name> — Assets")
 *      and puts one copy job per file on the queue (env.COPY_QUEUE). The
 *      background job in src/api/copy-to-drive.js then copies each file from R2
 *      into that folder, so big videos never slow down this request.
 *   3. Inserts one row into the assets_submissions D1 table (env.DB). The
 *      drive_folder_url column holds the Drive folder link.
 *   4. Pushes a row to Google Sheets (env.SHEETS_WEBHOOK_URL), matched by
 *      business name the same way Parts 1 and 2 are.
 *
 * The D1 table and the Sheet columns are unchanged. If Drive or the queue has a
 * problem, the submission still succeeds and the files stay safe in R2.
 *
 * Required bindings/vars (see wrangler.toml):
 *   env.DB                              — D1 database binding
 *   env.UPLOADS                         — R2 bucket binding
 *   env.COPY_QUEUE                      — queue that copies files to Drive
 *   env.SHEETS_WEBHOOK_URL              — Apps Script Web App URL
 *   env.GOOGLE_DRIVE_PARENT_FOLDER_ID   — the Shared Drive's own ID
 *   env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON — secret: service account JSON key
 */

import { UPLOAD_FIELDS, slugify, keyBelongsTo } from "../lib/upload-paths.js";
import { getGoogleAccessToken, findOrCreateDriveFolder } from "../lib/drive.js";

export async function handleSubmitAssets(request, env) {
  try {
    const data = await request.json();
    const businessName = String(data.business_name || "").trim();
    if (!businessName) return json({ ok: false, error: "Missing business name" }, 400);

    // Only keep uploaded files that sit inside this business's own folder.
    const uploaded = {};
    UPLOAD_FIELDS.forEach(field => {
      const list = data.uploaded_files && Array.isArray(data.uploaded_files[field]) ? data.uploaded_files[field] : [];
      uploaded[field] = list.filter(f => f && keyBelongsTo(businessName, f.key));
    });
    const beforeAfter = uploaded.before_after_photos;
    const team = uploaded.team_photos;
    const videos = uploaded.videos;
    const fileCount = beforeAfter.length + team.length + videos.length;

    const links = {
      beforeAfter: cleanLink(data.before_after_photos_link),
      team: cleanLink(data.team_photos_link),
      videos: cleanLink(data.videos_link)
    };

    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const slug = slugify(businessName);
    const r2Url = fileCount > 0 || hasLinks(links)
      ? new URL(request.url).origin + "/admin/files/?prefix=" + encodeURIComponent(slug + "/")
      : "";

    // One copy job per file, named the way the team is used to seeing them in Drive.
    const jobs = [];
    const addJobs = (list, prefix) => list.forEach(f => jobs.push({ key: f.key, driveName: prefix + displayName(f), businessName }));
    addJobs(beforeAfter, "Before-After - ");
    addJobs(team, "Team - ");
    addJobs(videos, "Video - ");

    const linkLines = [];
    if (links.beforeAfter) linkLines.push("Before and after photos: " + links.beforeAfter);
    if (links.team) linkLines.push("Team photos: " + links.team);
    if (links.videos) linkLines.push("Videos: " + links.videos);
    if (linkLines.length) {
      const note = "Links " + businessName + " sent instead of uploading files (" + submittedAt + ")\n\n" + linkLines.join("\n") + "\n";
      const noteName = "client-links-" + submittedAt.slice(0, 10) + "-" + id.slice(0, 6) + ".txt";
      await env.UPLOADS.put(slug + "/" + noteName, note, { httpMetadata: { contentType: "text/plain; charset=UTF-8" } });
      jobs.push({ key: slug + "/" + noteName, driveName: "Client links - " + submittedAt.slice(0, 10) + " " + id.slice(0, 6) + ".txt", businessName });
    }

    // The client's Drive folder. If Google has a problem the submission still goes through.
    let driveFolderUrl = "";
    let driveFolderId = "";
    if (jobs.length) {
      try {
        const accessToken = await getGoogleAccessToken(env);
        const folder = await findOrCreateDriveFolder(accessToken, env.GOOGLE_DRIVE_PARENT_FOLDER_ID, businessName + " — Assets");
        driveFolderUrl = folder.webViewLink || "";
        driveFolderId = folder.id || "";
      } catch (driveErr) {
        console.error("Drive folder problem (non-blocking, the copy jobs will retry it):", driveErr);
      }
    }

    const topServices = formatServices(data.top_3_services);
    const offerDetails = formatOffers(data.offer_details);

    await env.DB.prepare(
      `INSERT INTO assets_submissions (
        id, submitted_at, plan, part,
        business_name, top_3_services, offer_details,
        drive_folder_url, photos_uploaded_count, videos_uploaded_count
      ) VALUES (?,?,?,?, ?,?,?, ?,?,?)`
    ).bind(
      id, submittedAt, "ads", "assets",
      businessName, topServices, offerDetails,
      driveFolderUrl || r2Url, beforeAfter.length + team.length, videos.length
    ).run();

    // Hand every file to the background job that copies it from R2 into Drive.
    try {
      const messages = jobs.map(j => ({ body: Object.assign({ folderId: driveFolderId }, j) }));
      for (let i = 0; i < messages.length; i += 100) await env.COPY_QUEUE.sendBatch(messages.slice(i, i + 100));
    } catch (queueErr) {
      console.error("Could not queue the Drive copies (files are safe in R2):", queueErr);
    }

    // Best-effort push to Google Sheets — never blocks the actual submission.
    // Matched to the client's existing row by business name.
    try {
      const photoLinks = [];
      if (links.beforeAfter) photoLinks.push("Before and after: " + links.beforeAfter);
      if (links.team) photoLinks.push("Team: " + links.team);
      const videoLinks = links.videos ? ["Videos: " + links.videos] : [];

      const sheetsRes = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "assets",
          business_name: businessName,
          top_3_services: topServices,
          offer_details: offerDetails,
          before_after_photos: withLinks(describeUploads(beforeAfter.length + team.length, "photo", driveFolderUrl, r2Url), photoLinks),
          videos: withLinks(describeUploads(videos.length, "video", driveFolderUrl, r2Url), videoLinks),
          submitted_at: submittedAt
        })
      });
      const sheetsBody = await sheetsRes.text();
      if (!sheetsRes.ok || sheetsBody.indexOf('"ok":true') === -1) {
        console.error("Sheets sync problem:", sheetsRes.status, sheetsBody.slice(0, 300));
      }
    } catch (sheetsErr) {
      console.error("Sheets push failed (non-blocking):", sheetsErr);
    }

    return json({ ok: true, id, driveFolderUrl, r2Url });
  } catch (err) {
    console.error("submit-assets error:", err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

/* ==========================================================================
   Turning the answers into readable text for the database and the Sheet
   ========================================================================== */

const text = v => (v == null ? "" : String(v));
const cleanLink = v => (typeof v === "string" ? v.trim() : "");
const hasLinks = l => !!(l.beforeAfter || l.team || l.videos);

// "12 photos uploaded: Drive: https://drive.google.com/... · Originals: https://.../admin/files/..."
function describeUploads(count, noun, driveUrl, r2Url) {
  const where = [];
  if (driveUrl) where.push("Drive: " + driveUrl);
  if (r2Url) where.push("Originals: " + r2Url);
  if (!where.length) return "";
  return (count > 0 ? count + " " + noun + (count === 1 ? "" : "s") + " uploaded: " : "") + where.join(" · ");
}

// The name to show in Drive: what the client called the file.
const displayName = f => String(f.name || String(f.key).split("/").pop() || "file");

// The upload summary, then any links the client pasted, in one cell.
function withLinks(summary, links) {
  return links.length ? (summary ? summary + " · " : "") + "Client links: " + links.join(" | ") : (summary || "");
}

// ["Roofing", "Gutters", "Siding", "Skylights"] -> "Roofing; Gutters; Siding; Skylights (extra)"
// Older versions of the form sent plain text, so a string is passed through as is.
function formatServices(v) {
  if (Array.isArray(v)) {
    return v.map(x => text(x).trim()).filter(Boolean).map((s, i) => (i >= 3 ? s + " (extra)" : s)).join("; ");
  }
  return text(v).trim();
}

// One block per service, so a cell reads like:
//   1. Roofing
//   Offer: Full roof replacements...
//   Promo: 10% off for new customers
function formatOffers(v) {
  if (Array.isArray(v)) {
    return v.map((r, i) => {
      const lines = [
        (i + 1) + ". " + text(r.item).trim() + (i >= 3 ? " (extra page)" : ""),
        "Offer: " + text(r.offer).trim(),
        "Promo: " + text(r.promo).trim()
      ];
      if (r.why) lines.push("Why this page: " + text(r.why).trim());
      return lines.join("\n");
    }).join("\n\n");
  }
  return text(v).trim();
}
