/**
 * Private file browser for the LetLois team.
 *
 *   /admin/files/?prefix=<folder>/   lists the client folders, or the files inside one
 *   /admin/download?key=<file key>   opens or downloads one file
 *
 * Protected by a password (env.ADMIN_PASSWORD, a Cloudflare secret). The browser
 * shows a sign-in box; type anything as the username and the password as the
 * password. Without the secret set, these pages stay locked.
 */

export async function handleAdminFiles(request, env, url) {
  const denied = checkPassword(request, env);
  if (denied) return denied;

  if (url.pathname === "/admin/download" && request.method === "GET") return download(request, env, url);
  if ((url.pathname === "/admin/files/" || url.pathname === "/admin/files") && request.method === "GET") return listing(env, url);
  return new Response("Not found", { status: 404 });
}

function checkPassword(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return new Response("File browser is not set up yet (ADMIN_PASSWORD is missing).", { status: 503 });
  }
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (sameText(supplied, env.ADMIN_PASSWORD)) return null;
    } catch (e) { /* fall through to the sign-in box */ }
  }
  return new Response("Sign in to see client files.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LetLois client files", charset="UTF-8"' }
  });
}

function sameText(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function listing(env, url) {
  const prefix = url.searchParams.get("prefix") || "";
  const cursor = url.searchParams.get("cursor") || undefined;
  const res = await env.UPLOADS.list({ prefix, delimiter: "/", cursor, limit: 500 });

  const folders = (res.delimitedPrefixes || []).map(p => {
    const label = p.slice(prefix.length).replace(/\/$/, "");
    return '<li class="folder"><a href="/admin/files/?prefix=' + encodeURIComponent(p) + '">&#128193; ' + esc(label) + "</a></li>";
  });
  const files = (res.objects || []).map(o => {
    const label = o.key.slice(prefix.length);
    const href = "/admin/download?key=" + encodeURIComponent(o.key);
    return '<li><a href="' + href + '" target="_blank" rel="noopener">' + esc(label) + "</a>" +
      '<span class="meta">' + esc(prettySize(o.size)) + ' &middot; <a href="' + href + '&dl=1">download</a></span></li>';
  });

  const parent = prefix.replace(/[^/]+\/$/, "");
  const up = prefix ? '<p><a href="/admin/files/?prefix=' + encodeURIComponent(parent) + '">&larr; Back</a></p>' : "";
  const more = res.truncated
    ? '<p><a href="/admin/files/?prefix=' + encodeURIComponent(prefix) + "&cursor=" + encodeURIComponent(res.cursor) + '">Show more &rarr;</a></p>'
    : "";
  const empty = !folders.length && !files.length ? "<p>Nothing here yet.</p>" : "";

  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<meta name=\"robots\" content=\"noindex\"><title>Client files</title>" +
    "<style>" +
    "body{margin:0;background:#000;color:#e8e8e8;font:16px/1.5 Inter,system-ui,sans-serif;padding:20px}" +
    ".card{max-width:760px;margin:0 auto;background:#161616;border:1px solid #2a2a2a;border-radius:16px;padding:20px}" +
    "h1{margin:0 0 4px;font-size:22px}.path{color:#999;font-size:13px;margin:0 0 16px;word-break:break-all}" +
    "a{color:#47B7E8;text-decoration:none}a:hover{text-decoration:underline}" +
    "ul{list-style:none;margin:0;padding:0}li{padding:12px 0;border-top:1px solid #262626;word-break:break-word}" +
    ".meta{display:block;color:#999;font-size:13px;margin-top:2px}" +
    "</style></head><body><div class=\"card\"><h1>Client files</h1>" +
    '<p class="path">' + esc(prefix || "All clients") + "</p>" + up +
    "<ul>" + folders.join("") + files.join("") + "</ul>" + empty + more +
    "</div></body></html>";

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
}

async function download(request, env, url) {
  const key = url.searchParams.get("key") || "";
  if (!key) return new Response("Missing file", { status: 400 });

  const obj = await env.UPLOADS.get(key, { range: request.headers });
  if (!obj) return new Response("File not found", { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");
  const name = key.split("/").pop().replace(/^[a-z0-9]{8}-/, "");
  headers.set("Content-Disposition", (url.searchParams.get("dl") ? "attachment" : "inline") + "; filename*=UTF-8''" + encodeURIComponent(name));

  let status = 200;
  if (obj.range && request.headers.get("Range")) {
    const r = obj.range;
    const offset = r.offset != null ? r.offset : (r.suffix != null ? obj.size - r.suffix : 0);
    const length = r.length != null ? r.length : (r.suffix != null ? r.suffix : obj.size - offset);
    headers.set("Content-Range", "bytes " + offset + "-" + (offset + length - 1) + "/" + obj.size);
    headers.set("Content-Length", String(length));
    status = 206;
  } else {
    headers.set("Content-Length", String(obj.size));
  }
  return new Response(obj.body, { status, headers });
}

function prettySize(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
