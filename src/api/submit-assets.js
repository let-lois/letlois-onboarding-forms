/**
 * Handles POST /api/submit-assets — called from src/index.js.
 *
 * Expects multipart/form-data with:
 *   - "data": JSON string matching public/ads/assets/index.html's CONFIG.steps
 *   - "before_after_photos": zero or more uploaded files
 *   - "videos": zero or more uploaded files
 *
 * On each request this:
 *   1. Exchanges the Google service-account key (env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON)
 *      for an OAuth access token, signed with the Workers-native Web Crypto API
 *      (no Node "crypto" module needed).
 *   2. Finds this client's folder inside your Shared Drive
 *      (env.GOOGLE_DRIVE_PARENT_FOLDER_ID) by business name, creating it if
 *      it doesn't exist yet, and uploads every photo/video into it. This
 *      runs on every submission, even if no files were attached — and a
 *      second submission from the same business reuses the same folder
 *      rather than making a new one.
 *   3. Inserts one row into the assets_submissions D1 table (env.DB).
 *   4. Pushes a row to Google Sheets (env.SHEETS_WEBHOOK_URL), matched by
 *      business name the same way Parts 1 and 2 are.
 *
 * Required bindings/vars (see wrangler.toml):
 *   env.DB                               — D1 database binding
 *   env.SHEETS_WEBHOOK_URL                — Apps Script Web App URL
 *   env.GOOGLE_DRIVE_PARENT_FOLDER_ID     — the Shared Drive's own ID (client folders live at its top level)
 *   env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON   — secret: full contents of the service account JSON key
 */

export async function handleSubmitAssets(request, env) {
  try {
    const form = await request.formData();
    const dataRaw = form.get("data");
    if (!dataRaw) return json({ ok: false, error: "Missing form data" }, 400);
    const data = JSON.parse(dataRaw);

    const photos = form.getAll("before_after_photos").filter(f => typeof f === "object" && "arrayBuffer" in f);
    const videos = form.getAll("videos").filter(f => typeof f === "object" && "arrayBuffer" in f);
    const allFiles = [...photos, ...videos];

    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    // Reuses this client's folder if one already exists (e.g. a second
    // submission from the same business), otherwise creates it.
    const accessToken = await getGoogleAccessToken(env);
    const folderName = (data.business_name || id) + " — Assets";
    const folder = await findOrCreateDriveFolder(accessToken, env.GOOGLE_DRIVE_PARENT_FOLDER_ID, folderName);
    const driveFolderUrl = folder.webViewLink;
    for (const file of allFiles) {
      await uploadFileToDrive(accessToken, folder.id, file);
    }

    await env.DB.prepare(
      `INSERT INTO assets_submissions (
        id, submitted_at, plan, part,
        business_name, top_3_services, offer_details,
        drive_folder_url, photos_uploaded_count, videos_uploaded_count
      ) VALUES (?,?,?,?, ?,?,?, ?,?,?)`
    ).bind(
      id, submittedAt, "ads", "assets",
      data.business_name,
      data.top_3_services || "",
      data.offer_details || "",
      driveFolderUrl, photos.length, videos.length
    ).run();

    // Best-effort push to Google Sheets — never blocks the actual submission.
    // Matched to the client's existing row by business name.
    try {
      const sheetsRes = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "assets",
          business_name: data.business_name,
          top_3_services: data.top_3_services || "",
          offer_details: data.offer_details || "",
          before_after_photos: driveFolderUrl || "",
          videos: driveFolderUrl || ""
        })
      });
      const sheetsBody = await sheetsRes.text();
      if (!sheetsRes.ok || sheetsBody.indexOf('"ok":true') === -1) {
        console.error("Sheets sync problem:", sheetsRes.status, sheetsBody.slice(0, 300));
      }
    } catch (sheetsErr) {
      console.error("Sheets push failed (non-blocking):", sheetsErr);
    }

    return json({ ok: true, id, driveFolderUrl });
  } catch (err) {
    console.error("submit-assets error:", err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

/* ==========================================================================
   Google Drive — service-account auth via Web Crypto (no Node dependency)
   ========================================================================== */

async function getGoogleAccessToken(env) {
  const keyJson = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: keyJson.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const unsigned = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(claims));
  const key = await importPrivateKey(keyJson.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = unsigned + "." + base64urlFromBuffer(signature);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!res.ok) throw new Error("Google auth failed: " + await res.text());
  const tok = await res.json();
  return tok.access_token;
}

async function importPrivateKey(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(str) { return base64urlFromBuffer(new TextEncoder().encode(str)); }

function base64urlFromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function findOrCreateDriveFolder(accessToken, parentId, name) {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = "name = '" + escapedName + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '" + parentId + "' in parents";

  // Tells Drive to search INSIDE the Shared Drive. Without corpora/driveId,
  // a service account's search can come back empty even when the folder
  // exists, which made every submission create a brand-new folder.
  // parentId is the Shared Drive's own ID, so it doubles as the driveId.
  const listRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({
      q: query,
      fields: "files(id,webViewLink)",
      corpora: "drive",
      driveId: parentId,
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    }),
    { headers: { Authorization: "Bearer " + accessToken } }
  );
  if (!listRes.ok) throw new Error("Drive folder lookup failed: " + await listRes.text());
  const listData = await listRes.json();
  if (listData.files && listData.files.length > 0) {
    return listData.files[0];
  }

  return createDriveFolder(accessToken, parentId, name);
}

async function createDriveFolder(accessToken, parentId, name) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
  });
  if (!res.ok) throw new Error("Drive folder create failed: " + await res.text());
  return res.json();
}

async function uploadFileToDrive(accessToken, folderId, file) {
  const metadata = { name: file.name, parents: [folderId] };
  const boundary = "letlois-" + crypto.randomUUID();
  const arrayBuf = await file.arrayBuffer();

  const preamble =
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n" +
    "--" + boundary + "\r\nContent-Type: " + (file.type || "application/octet-stream") + "\r\n\r\n";
  const closing = "\r\n--" + boundary + "--";

  const body = new Blob([preamble, arrayBuf, closing]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "multipart/related; boundary=" + boundary
    },
    body
  });
  if (!res.ok) throw new Error("Drive file upload failed: " + await res.text());
  return res.json();
}
