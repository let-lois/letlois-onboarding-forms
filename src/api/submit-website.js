/**
 * Handles POST /api/submit-website — called from src/index.js.
 *
 * Expects multipart/form-data with:
 *   - "data": JSON string of the answers from public/ads/website/index.html
 *   - "logo": the client's logo file (optional for older form versions)
 *
 * The form sends structured answers (lists, colors, picked layouts). This
 * handler turns them into short readable text so the database columns and the
 * Google Sheet cells stay exactly as they were. The logo goes into the
 * client's Drive folder ("<Business Name> — Assets", the same folder Part 3
 * uses) and the file link is what gets saved.
 *
 * Required bindings/vars (see wrangler.toml):
 *   env.DB                               — D1 database binding
 *   env.SHEETS_WEBHOOK_URL                — Apps Script Web App URL
 *   env.GOOGLE_DRIVE_PARENT_FOLDER_ID     — the Shared Drive's own ID
 *   env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON   — secret: service account JSON key
 */

import { getGoogleAccessToken, findOrCreateDriveFolder, uploadFileToDrive } from "../lib/drive.js";

export async function handleSubmitWebsite(request, env) {
  try {
    const form = await request.formData();
    const dataRaw = form.get("data");
    if (!dataRaw) return json({ ok: false, error: "Missing form data" }, 400);
    const data = JSON.parse(dataRaw);
    if (!data.business_name || !String(data.business_name).trim()) {
      return json({ ok: false, error: "Missing business name" }, 400);
    }
    const businessName = String(data.business_name).trim();

    // Logo: upload to the client's Drive folder. Older form versions sent a
    // pasted link as text instead of a file, so keep that working too.
    const logoFile = form.getAll("logo").find(f => f && typeof f === "object" && "arrayBuffer" in f && f.size > 0);
    let logo = typeof data.logo === "string" ? data.logo : "";
    if (logoFile) {
      const accessToken = await getGoogleAccessToken(env);
      const folder = await findOrCreateDriveFolder(accessToken, env.GOOGLE_DRIVE_PARENT_FOLDER_ID, businessName + " — Assets");
      const uploaded = await uploadFileToDrive(accessToken, folder.id, logoFile, "Logo - " + (logoFile.name || "logo"));
      logo = uploaded.webViewLink || folder.webViewLink || "";
    }

    const out = {
      existing_website: formatSite(data.existing_website),
      listed_services: formatServices(data.listed_services, data.listed_services_details),
      service_areas: data.service_area ? formatArea(data.service_area) : text(data.service_areas),
      color_scheme: data.brand_colors ? formatColors(data.brand_colors) : text(data.color_scheme),
      design_notes: data.design_template ? formatDesign(data.design_template) : text(data.design_notes),
      pricing_details: data.wants_pricing ? formatPricing(data) : text(data.pricing_details),
      wants_service_area_map: formatMap(data),
      logo
    };

    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    try {
      await env.DB.prepare(
        `INSERT INTO website_submissions (
          id, submitted_at, plan, part,
          business_name, existing_website, listed_services, service_areas, color_scheme,
          design_notes, pricing_details, wants_service_area_map, logo_link
        ) VALUES (?,?,?,?, ?,?,?,?,?, ?,?,?,?)`
      ).bind(
        id, submittedAt, "ads", "website",
        businessName,
        out.existing_website,
        out.listed_services,
        out.service_areas,
        out.color_scheme,
        out.design_notes,
        out.pricing_details,
        out.wants_service_area_map,
        out.logo
      ).run();
    } catch (dbErr) {
      // Safety net: if schema/0004_website_existing_site.sql hasn't been run in D1 yet,
      // save without the new column so the client's submission still goes through.
      if (!/existing_website/i.test(String(dbErr && dbErr.message))) throw dbErr;
      console.error("website_submissions has no existing_website column yet; run schema/0004. Saving without it.");
      await env.DB.prepare(
        `INSERT INTO website_submissions (
          id, submitted_at, plan, part,
          business_name, listed_services, service_areas, color_scheme,
          design_notes, pricing_details, wants_service_area_map, logo_link
        ) VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?)`
      ).bind(
        id, submittedAt, "ads", "website",
        businessName,
        out.listed_services,
        out.service_areas,
        out.color_scheme,
        out.design_notes,
        out.pricing_details,
        out.wants_service_area_map,
        out.logo
      ).run();
    }

    // Best-effort push to Google Sheets — never blocks the actual submission.
    // Matched to the client's existing row by business name.
    try {
      const sheetsRes = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "website",
          business_name: businessName,
          existing_website: out.existing_website,
          listed_services: out.listed_services,
          service_areas: out.service_areas,
          color_scheme: out.color_scheme,
          design_notes: out.design_notes,
          pricing_details: out.pricing_details,
          wants_service_area_map: out.wants_service_area_map,
          logo: out.logo,
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

    return json({ ok: true, id });
  } catch (err) {
    console.error("submit-website error:", err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

/* ==========================================================================
   Turning structured answers into readable text
   ========================================================================== */

const text = v => (v == null ? "" : String(v));

// The client's current website link, or a note when they said they don't have one.
function formatSite(v) {
  if (v && typeof v === "object" && v.skipped) return "No website yet";
  return text(v).trim();
}

// "199" -> "$199", "1299" -> "$1,299", "1,200.50" -> "$1,200.50". Anything
// else is left as typed ("Call for a quote", "$99/mo").
function money(p) {
  const s = text(p).trim();
  if (!s) return "";
  const m = s.match(/^([\d,]+)(\.\d{1,2})?$/);
  if (!m) return s;
  return "$" + m[1].replace(/,/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (m[2] || "");
}

// Service names first, joined with "; ". Any optional details the client added follow
// after a blank line. (src/api/lookup-services.js reads only the part before the
// blank line, so keep the names first.)
//   "Roofing; Gutters; Siding
//
//    Details:
//    Roofing: Mostly metal roofs, some tile"
function formatServices(v, details) {
  if (!Array.isArray(v)) return text(v);
  const names = v.map(s => text(s).trim());
  const lines = [];
  names.forEach((name, i) => {
    const d = Array.isArray(details) ? text(details[i]).trim() : "";
    if (name && d) lines.push(name + ": " + d);
  });
  const list = names.filter(Boolean).join("; ");
  return lines.length ? list + "\n\nDetails:\n" + lines.join("\n") : list;
}

function formatArea(v) {
  if (!v || typeof v !== "object") return text(v);
  const where = v.place ? v.zip + " (" + v.place + ")" : v.zip;
  return "Home base " + where + ", " + v.miles + " mile radius";
}

function formatColors(v) {
  if (!v || typeof v !== "object") return text(v);
  return [["Main", v.main], ["Secondary", v.secondary], ["Accent", v.accent]]
    .filter(pair => pair[1])
    .map(pair => pair[0] + " " + pair[1])
    .join(" · ");
}

// What each style means, in words the team can act on straight from the Sheet.
const DESIGN_STYLES = {
  bold: "Bold and direct: main hero at the very top with a clear call to action",
  clean: "Clean and trusted: case studies or testimonial videos at the top, logo featured in the center, more professional-looking site",
  showcase: "Photo-forward: before-and-after photos where the hero is"
};

function formatDesign(v) {
  if (!v || typeof v !== "object") return text(v);
  if (v.skipped) return "Skipped, will send later";
  if (v.other) return "Style: Something else, " + v.other;
  return "Style: " + (DESIGN_STYLES[v.choice] || v.label || v.choice || "");
}

function formatPricing(data) {
  const wants = data.wants_pricing;
  if (wants === "No") return "No pricing on the site";
  if (wants !== "Yes") return text(wants);

  const layout = data.pricing_layout;
  if (!layout || layout.skipped) return "Yes · layout and prices to follow";
  const name = layout.label || layout.choice;

  // "Custom" is described right in the layout step. Older versions of the form
  // asked for it in a separate step, so that is still honored.
  if (layout.choice === "custom") {
    const older = data.pricing_custom && !data.pricing_custom.skipped ? data.pricing_custom : "";
    const described = text(layout.other || older).trim();
    return described ? "Yes · " + name + ": " + described : "Yes · " + name + " · details to follow";
  }

  const detailKey = { tiers: "pricing_tiers", list: "pricing_list", starting: "pricing_starting" }[layout.choice];
  const detail = detailKey ? data[detailKey] : null;
  if (!detail || detail.skipped) return "Yes · " + name + " · prices to follow";

  const rows = Array.isArray(detail) ? detail : [];
  const parts = rows.map(r => {
    const price = money(r.price);
    if (layout.choice === "tiers") return text(r.label).trim() + " " + price + (r.incl ? " (" + text(r.incl).trim() + ")" : "");
    if (layout.choice === "starting") return text(r.label).trim() + " from " + price;
    return text(r.label).trim() + " " + price;
  });
  return "Yes · " + name + ": " + parts.join("; ");
}

function formatMap(data) {
  const wants = data.wants_service_area_map;
  if (wants === "Yes") {
    const l = data.site_map_layout;
    if (!l || l.skipped) return "Yes";
    if (l.other) return "Yes · " + (l.label || "Custom") + ": " + text(l.other).trim();
    return l.label ? "Yes · " + l.label : "Yes";
  }
  return text(wants);
}
