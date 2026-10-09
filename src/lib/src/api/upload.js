/**
 * Handles the file-upload endpoints used by Part 3 (Assets):
 *
 *   PUT  /api/upload/file      one request for a small file (10 MB or less)
 *   POST /api/upload/start     begin a big file, returns an uploadId
 *   PUT  /api/upload/part      send one 10 MB piece of a big file
 *   POST /api/upload/complete  stitch the pieces into the original file
 *   POST /api/upload/abort     throw away a half-finished big file
 *
 * Files go straight into the private R2 bucket (env.UPLOADS). They are stored
 * byte for byte, so photos and videos keep their full original quality.
 */

import { UPLOAD_FIELDS, MAX_FILE_BYTES, isAllowedFile, newFileKey, keyBelongsTo } from "../lib/upload-paths.js";

export const CHUNK_BYTES = 10 * 1024 * 1024;

export async function handleUpload(request, env, url) {
  try {
    const route = url.pathname.replace("/api/upload/", "");

    if (route === "file" && request.method === "PUT") return putSmallFile(request, env, url);
    if (route === "start" && request.method === "POST") return startMultipart(request, env);
    if (route === "part" && request.method === "PUT") return putPart(request, env, url);
    if (route === "complete" && request.method === "POST") return completeMultipart(request, env);
    if (route === "abort" && request.method === "POST") return abortMultipart(request, env);

    return json({ ok: false, error: "Not found" }, 404);
  } catch (err) {
    console.error("upload error:", err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function checkNewFile(business, field, name, size, type) {
  if (!String(business || "").trim()) return "Missing business name";
  if (!UPLOAD_FIELDS.includes(field)) return "Unknown upload question";
  if (!name) return "Missing file name";
  if (!(size > 0)) return "That file is empty";
  if (size > MAX_FILE_BYTES) return "That file is over the 5 GB limit";
  if (!isAllowedFile(name, type)) return "That file type isn't supported";
  return "";
}

async function putSmallFile(request, env, url) {
  const business = url.searchParams.get("business") || "";
  const field = url.searchParams.get("field") || "";
  const name = url.searchParams.get("name") || "";
  const type = request.headers.get("Content-Type") || "";

  const body = await request.arrayBuffer();
  const problem = checkNewFile(business, field, name, body.byteLength, type);
  if (problem) return json({ ok: false, error: problem }, 400);
  if (body.byteLength > CHUNK_BYTES + 1024) return json({ ok: false, error: "Too big for a single request" }, 413);

  const key = newFileKey(business, field, name);
  await env.UPLOADS.put(key, body, { httpMetadata: { contentType: type || "application/octet-stream" } });
  return json({ ok: true, key, size: body.byteLength });
}

async function startMultipart(request, env) {
  const d = await request.json();
  const problem = checkNewFile(d.business_name, d.field, d.name, d.size, d.type);
  if (problem) return json({ ok: false, error: problem }, 400);

  const key = newFileKey(d.business_name, d.field, d.name);
  const upload = await env.UPLOADS.createMultipartUpload(key, {
    httpMetadata: { contentType: d.type || "application/octet-stream" }
  });
  return json({ ok: true, key, uploadId: upload.uploadId });
}

async function putPart(request, env, url) {
  const key = url.searchParams.get("key") || "";
  const uploadId = url.searchParams.get("uploadId") || "";
  const partNumber = parseInt(url.searchParams.get("partNumber") || "", 10);
  if (!key || !uploadId || !(partNumber >= 1 && partNumber <= 10000)) {
    return json({ ok: false, error: "Bad part request" }, 400);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > CHUNK_BYTES + 1024) {
    return json({ ok: false, error: "Bad part size" }, 400);
  }
  const upload = env.UPLOADS.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, body);
  return json({ ok: true, partNumber: part.partNumber, etag: part.etag });
}

async function completeMultipart(request, env) {
  const d = await request.json();
  if (!d.key || !d.uploadId || !Array.isArray(d.parts) || d.parts.length === 0) {
    return json({ ok: false, error: "Bad complete request" }, 400);
  }
  const parts = d.parts
    .map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }))
    .sort((a, b) => a.partNumber - b.partNumber);
  const upload = env.UPLOADS.resumeMultipartUpload(d.key, d.uploadId);
  const obj = await upload.complete(parts);
  return json({ ok: true, key: d.key, size: obj.size });
}

async function abortMultipart(request, env) {
  const d = await request.json();
  if (!d.key || !d.uploadId) return json({ ok: false, error: "Bad abort request" }, 400);
  try { await env.UPLOADS.resumeMultipartUpload(d.key, d.uploadId).abort(); } catch (e) { /* already gone */ }
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
