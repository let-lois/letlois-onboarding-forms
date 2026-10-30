/**
 * The answers clients sent, as JSON, for LetLois Command Center.
 *
 *   /admin/api/submissions                     one row per business, with when each part arrived
 *   /admin/api/submissions/detail?business=…   every answer that business sent, newest first
 *
 * Called from src/api/admin-files.js, behind the same admin check (the team
 * password, or COMMAND_CENTER_TOKEN). Read only: nothing here writes.
 *
 * A business is identified by the same slug its files use in R2
 * (src/lib/upload-paths.js), so one row here is one folder in /admin/files/.
 *
 * Rows are read whole and then narrowed to the fields listed below, rather
 * than selected by name, because the D1 tables have grown columns that the
 * files in schema/ do not show (a2p_submissions.business_name, and all of
 * website_submissions). A field the table does not have comes back empty
 * instead of failing the request, and so does a table that does not exist.
 *
 * The EIN is masked to its last four digits unless the caller asks for it with
 * reveal=ein, so a screen that does not need it never receives it.
 */

import { slugify } from "../lib/upload-paths.js";

const PARTS = {
  a2p: {
    table: "a2p_submissions",
    fields: [
      "business_name", "business_email", "respondent_legal_name", "respondent_title", "ein",
      "legal_biz_name", "legal_biz_street", "legal_biz_suite", "legal_biz_city", "legal_biz_state",
      "legal_biz_zip", "legal_biz_entity_type", "mobile_cell_phone", "software_access",
      "team_members", "consent_agreed", "consent_signed_at"
    ]
  },
  website: {
    table: "website_submissions",
    fields: [
      "business_name", "existing_website", "listed_services", "service_areas", "color_scheme",
      "design_notes", "pricing_details", "wants_service_area_map", "logo_link"
    ]
  },
  assets: {
    table: "assets_submissions",
    fields: [
      "business_name", "top_3_services", "offer_details", "drive_folder_url",
      "photos_uploaded_count", "videos_uploaded_count"
    ]
  }
};

// Part 1 always asks for the business name now; older rows may only have the legal name.
function nameOf(part, row) {
  const name = String(row.business_name || "").trim();
  if (name) return name;
  return part === "a2p" ? String(row.legal_biz_name || "").trim() : "";
}

async function rowsOf(env, part) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM " + PARTS[part].table + " ORDER BY submitted_at DESC LIMIT 5000"
    ).all();
    return results || [];
  } catch (err) {
    if (/no such table/i.test(String(err && err.message))) return [];
    throw err;
  }
}

export async function handleAdminSubmissions(request, env, url) {
  if (url.pathname === "/admin/api/submissions") return list(env);
  if (url.pathname === "/admin/api/submissions/detail") return detail(env, url);
  return new Response("Not found", { status: 404 });
}

async function list(env) {
  const businesses = new Map();
  for (const part of Object.keys(PARTS)) {
    for (const row of await rowsOf(env, part)) {
      const name = nameOf(part, row);
      const key = slugify(name);
      let b = businesses.get(key);
      if (!b) {
        b = { key, name, parts: { a2p: null, website: null, assets: null }, last_submitted_at: "" };
        businesses.set(key, b);
      }
      const at = String(row.submitted_at || "");
      const seen = b.parts[part];
      if (!seen) b.parts[part] = { submitted_at: at, count: 1 };
      else seen.count += 1; // rows arrive newest first, so the first one seen is the latest
      if (at > b.last_submitted_at) {
        b.last_submitted_at = at;
        if (name) b.name = name; // the newest spelling of the name wins
      }
    }
  }
  const out = [...businesses.values()].sort((x, y) => (x.last_submitted_at < y.last_submitted_at ? 1 : -1));
  return json({ ok: true, businesses: out });
}

async function detail(env, url) {
  const key = url.searchParams.get("business") || "";
  if (!/^[a-z0-9-]{1,60}$/.test(key)) return json({ ok: false, error: "Bad business" }, 400);
  const revealEin = url.searchParams.get("reveal") === "ein";

  let name = "";
  let latest = "";
  const parts = {};
  for (const part of Object.keys(PARTS)) {
    parts[part] = [];
    for (const row of await rowsOf(env, part)) {
      const rowName = nameOf(part, row);
      if (slugify(rowName) !== key) continue;
      const answers = {};
      for (const field of PARTS[part].fields) answers[field] = row[field] == null ? "" : row[field];
      if (part === "a2p") {
        answers.ein = revealEin ? String(answers.ein) : maskEin(answers.ein);
        answers.team_members = parseTeam(answers.team_members);
        answers.consent_agreed = !!Number(answers.consent_agreed);
      }
      const at = String(row.submitted_at || "");
      parts[part].push({ id: String(row.id || ""), submitted_at: at, answers });
      if (at > latest) { latest = at; if (rowName) name = rowName; }
    }
  }
  if (!latest) return json({ ok: false, error: "No submissions for that business" }, 404);
  return json({ ok: true, key, name, parts });
}

// "12-3456789" -> "••-•••6789". Nothing useful is learned from a masked one.
function maskEin(v) {
  const digits = String(v || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length >= 4 ? "••-•••" + digits.slice(-4) : "••••";
}

function parseTeam(v) {
  try {
    const list = typeof v === "string" ? JSON.parse(v || "[]") : v;
    return (Array.isArray(list) ? list : [])
      .map(m => ({ name: String((m && m.name) || ""), email: String((m && m.email) || ""), phone: String((m && m.phone) || "") }))
      .filter(m => m.name || m.email || m.phone);
  } catch (e) {
    return [];
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
