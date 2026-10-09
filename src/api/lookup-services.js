/**
 * Handles GET /api/lookup-services?business=<name> — called from src/index.js.
 *
 * Part 3's "Use the same services from my website form" button calls this. It
 * finds the most recent Part 2 (Website) answer for that business name and
 * returns just the list of service names, e.g. { ok: true, services: ["Roofing", "Gutters"] }.
 * Nothing else from the answer is returned.
 *
 * Part 2 saves the services as "Roofing; Gutters; Siding" and may add a blank
 * line and a "Details:" section after it (see formatServices in
 * src/api/submit-website.js). Only the names, before the blank line, are used.
 *
 * Required bindings (see wrangler.toml):
 *   env.DB — D1 database binding
 */

export async function handleLookupServices(request, env, url) {
  try {
    const business = (url.searchParams.get("business") || "").trim().replace(/\s+/g, " ");
    if (!business) return json({ ok: true, services: [] });

    const row = await env.DB.prepare(
      `SELECT listed_services FROM website_submissions
       WHERE lower(business_name) = lower(?)
       ORDER BY submitted_at DESC LIMIT 1`
    ).bind(business).first();

    const raw = row && row.listed_services ? String(row.listed_services) : "";
    const services = raw.split("\n\n")[0].split(";").map(s => s.trim()).filter(Boolean);
    return json({ ok: true, services });
  } catch (err) {
    console.error("lookup-services error:", err);
    return json({ ok: false, error: "Lookup failed" }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
