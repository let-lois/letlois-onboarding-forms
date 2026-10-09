/**
 * Shared naming rules for client uploads in the R2 bucket.
 *
 * Every file lives at:  <business-slug>/<question>/<random>-<file name>
 * For example:          acme-roofing/videos/k3f9a1b2-Job site walkthrough.mov
 */

export const UPLOAD_FIELDS = ["before_after_photos", "team_photos", "videos"];

// One file can be up to 5 GB. This stops a runaway or malicious upload.
export const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp", "avif",
  "mp4", "mov", "m4v", "webm", "avi", "mkv", "mts", "m2ts", "3gp"
];

export function slugify(name) {
  const s = String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "unnamed-business";
}

export function safeFileName(name) {
  const cleaned = String(name || "file")
    .replace(/[\\/]+/g, "_")
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-120);
  return cleaned || "file";
}

export function isAllowedFile(fileName, contentType) {
  const ext = String(fileName || "").split(".").pop().toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;
  const t = String(contentType || "").toLowerCase();
  return t.startsWith("image/") || t.startsWith("video/");
}

export function newFileKey(businessName, field, fileName) {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return slugify(businessName) + "/" + field + "/" + rand + "-" + safeFileName(fileName);
}

// A key is only accepted if it sits inside this business's own folder.
export function keyBelongsTo(businessName, key) {
  const prefix = slugify(businessName) + "/";
  return typeof key === "string" && key.startsWith(prefix) && key.indexOf("..") === -1;
}
