/**
 * Handles POST /api/submit-website — called from src/index.js.
 *
 * Expects multipart/form-data with a single "data" field: a JSON string
 * matching the shape produced by public/ads/website/index.html's CONFIG.steps.
 *
 * Required bindings/vars (see wrangler.toml):
 *   env.DB                — D1 database binding
 *   env.SHEETS_WEBHOOK_URL — Apps Script Web App URL for the Sheets sync
 */

export async function handleSubmitWebsite(request, env) {
  try {
    const form = await request.formData();
    const dataRaw = form.get("data");
    if (!dataRaw) return json({ ok: false, error: "Missing form data" }, 400);
    const data = JSON.parse(dataRaw);

    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO website_submissions (
        id, submitted_at, plan, part,
        business_name, listed_services, service_areas, color_scheme,
        design_notes, pricing_details, wants_service_area_map, logo_link
      ) VALUES (?,?,?,?, ?,?,?,?, ?,?,?,?)`
    ).bind(
      id, submittedAt, "ads", "website",
      data.business_name,
      data.listed_services || "",
      data.service_areas || "",
      data.color_scheme || "",
      data.design_notes || "",
      data.pricing_details || "",
      data.wants_service_area_map || "",
      data.logo || ""
    ).run();

    // Best-effort push to Google Sheets — never blocks the actual submission.
    // Matched to the client's existing row by business name.
    try {
      await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "website",
          business_name: data.business_name,
          listed_services: data.listed_services || "",
          service_areas: data.service_areas || "",
          color_scheme: data.color_scheme || "",
          design_notes: data.design_notes || "",
          pricing_details: data.pricing_details || "",
          wants_service_area_map: data.wants_service_area_map || "",
          logo: data.logo || ""
        })
      });
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
