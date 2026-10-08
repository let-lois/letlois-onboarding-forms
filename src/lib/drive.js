/**
 * Shared Google Drive helpers.
 *
 * Auth is a service account (env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON, stored as an
 * encrypted Cloudflare secret) signed with the Workers-native Web Crypto API,
 * so no Node "crypto" module is needed.
 *
 * Client folders live at the top level of the Shared Drive whose ID is
 * env.GOOGLE_DRIVE_PARENT_FOLDER_ID, named "<Business Name> — Assets".
 */

export async function getGoogleAccessToken(env) {
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

/**
 * Finds the folder called `name` at the top level of the Shared Drive, or
 * creates it. parentId is the Shared Drive's own ID, so it doubles as the
 * driveId. Without corpora/driveId a service account's search can come back
 * empty even when the folder exists.
 */
export async function findOrCreateDriveFolder(accessToken, parentId, name) {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = "name = '" + escapedName + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '" + parentId + "' in parents";

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

/**
 * Uploads one file into a folder. Pass fileName to rename it on the way in.
 * Returns { id, webViewLink }.
 */
export async function uploadFileToDrive(accessToken, folderId, file, fileName) {
  const metadata = { name: fileName || file.name || "upload", parents: [folderId] };
  const boundary = "letlois-" + crypto.randomUUID();
  const arrayBuf = await file.arrayBuffer();

  const preamble =
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n" +
    "--" + boundary + "\r\nContent-Type: " + (file.type || "application/octet-stream") + "\r\n\r\n";
  const closing = "\r\n--" + boundary + "--";

  const body = new Blob([preamble, arrayBuf, closing]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
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
