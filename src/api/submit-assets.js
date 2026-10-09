/**
 * Handles POST /api/submit-assets — called from src/index.js.
 *
 * Expects multipart/form-data with:
 *   - "data": JSON string of the answers from public/ads/assets/index.html
 *       business_name           text
 *       top_3_services          list of services (the 4th is an optional extra)
 *       offer_details           one { item, offer, promo, why? } per service
 *       before_after_photos_link, team_photos_link, videos_link
 *                               optional links the client pasted instead of uploading
 *   - "before_after_photos": uploaded image files
 *   - "team_photos":         uploaded image files
 *   - "videos":              uploaded video files
 *
 * On each request this:
 *   1. Gets a Google access token for the service account (see src/lib/drive.js).
 *   2. Finds this client's folder in the Shared Drive ("<Business Name> — Assets"),
 *      or creates it, and uploads every file into it. Files are renamed with a
 *      prefix ("Before-After - ", "Team - ", "Video - ") so they sort and read
 *      clearly. A second submission from the same business reuses the folder.
 *      Any links the client pasted instead of uploading are saved in the same
 *      folder as a small text file, so nothing lives only in the Sheet.
 *   3. Inserts one row into the assets_submissions D1 table (env.DB).
 *   4. Pushes a row to Google Sheets (env.SHEETS_WEBHOOK_URL), matched by
 *      business name the same way Parts 1 and 2 are.
 *
 * The D1 table and the Sheet columns are unchanged. Team photos are counted
 * with the before and after photos in photos_uploaded_count.
 *
 * Required bindings/vars (see wrangler.toml):
 *   env.DB                               — D1 database binding
 *   env.SHEETS_WEBHOOK_URL                — Apps Script Web App URL
 *   env.GOOGLE_DRIVE_PARENT_FOLDER_ID     — the Shared Drive's own ID
 *   env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON   — secret: service account JSON key
 */

import { getGoogleAccessToken, findOrCreateDriveFolder, uploadFileToDrive } from "../lib/drive.js";

export async function handleSubmitAssets(request, env) {
  try {
    const form = await request.formData();
    const dataRaw = form.get("data");
    if (!dataRaw) return json({ ok: false, error: "Missing form data" }, 400);
    const data = JSON.parse(dataRaw);
    const businessName = String(data.business_name || "").trim();
    if (!businessName) return json({ ok: false, error: "Missing business name" }, 400);

    const filesOf = name => form.getAll(name).filter(f => f && typeof f === "object" && "arrayBuffer" in f && f.size > 0);
    const beforeAfter = filesOf("before_after_photos");
    const team = filesOf("team_photos");
    const videos = filesOf("videos");

    const links = {
      beforeAfter: cleanLink(data.before_after_photos_link),
      team: cleanLink(data.team_photos_link),
      videos: cleanLink(data.videos_link)
    };

    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    // Reuses this client's folder if one already exists, otherwise creates it.
    const accessToken = await getGoogleAccessToken(env);
    const folder = await findOrCreateDriveFolder(accessToken, env.GOOGLE_DRIVE_PARENT_FOLDER_ID, businessName + " — Assets");
    const driveFolderUrl = folder.webViewLink || "";

    for (const f of beforeAfter) await uploadFileToDrive(accessToken, folder.id, f, "Before-After - " + (f.name || "photo"));
    for (const f of team) await uploadFileToDrive(accessToken, folder.id, f, "Team - " + (f.name || "photo"));
    for (const f of videos) await uploadFileToDrive(accessToken, folder.id, f, "Video - " + (f.name || "video"));

    const linkLines = [];
    if (links.beforeAfter) linkLines.push("Before and after photos: " + links.beforeAfter);
    if (links.team) linkLines.push("Team photos: " + links.team);
    if (links.videos) linkLines.push("Videos: " + links.videos);
    if (linkLines.length) {
      const note = new Blob(["Links " + businessName + " sent instead of uploading files (" + submittedAt + ")\n\n" + linkLines.join("\n") + "\n"], { type: "text/plain" });
      await uploadFileToDrive(accessToken, folder.id, note, "Client links - " + submittedAt.slice(0, 10) + " " + id.slice(0, 6) + ".txt");
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
      driveFolderUrl, beforeAfter.length + team.length, videos.length
    ).run();

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
          before_after_photos: withLinks(driveFolderUrl, photoLinks),
          videos: withLinks(driveFolderUrl, videoLinks)
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
   Turning the answers into readable text for the database and the Sheet
   ========================================================================== */

const text = v => (v == null ? "" : String(v));
const cleanLink = v => (typeof v === "string" ? v.trim() : "");

// The folder link, then any links the client pasted, in one cell.
function withLinks(folderUrl, links) {
  return links.length ? (folderUrl ? folderUrl + " · " : "") + "Client links: " + links.join(" | ") : (folderUrl || "");
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
