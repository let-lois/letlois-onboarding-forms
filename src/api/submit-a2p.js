/**
 * Handles POST /api/submit-a2p — called from src/index.js.
 *
 * Expects multipart/form-data with a single "data" field: a JSON string
 * matching the shape produced by public/ads/a2p/index.html's CONFIG.steps.
 *
 * Required binding (see wrangler.toml):
 *   env.DB — D1 database binding
 */

export async function handleSubmitA2P(request, env) {
  try {
    const form = await request.formData();
    const dataRaw = form.get("data");
    if (!dataRaw) return json({ ok: false, error: "Missing form data" }, 400);
    const data = JSON.parse(dataRaw);

    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    const addr = data.legal_biz_address || {};
    const consent = data.consent || {};

    await env.DB.prepare(
      `INSERT INTO a2p_submissions (
        id, submitted_at, plan, part,
        business_email, respondent_legal_name, respondent_title, ein, legal_biz_name,
        legal_biz_street, legal_biz_suite, legal_biz_city, legal_biz_state, legal_biz_zip,
        legal_biz_entity_type, mobile_cell_phone,
        software_access, team_members,
        consent_agreed, consent_signed_at
      ) VALUES (?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?, ?,?, ?,?)`
    ).bind(
      id, submittedAt, "ads", "a2p",
      data.business_email, data.respondent_legal_name, data.respondent_title, data.ein, data.legal_biz_name,
      addr.street || "", addr.suite || null, addr.city || "", addr.state || "", addr.zip || "",
      data.legal_biz_entity_type, data.mobile_cell_phone,
      data.software_access || "", JSON.stringify(data.team_members || []),
      consent.agreed ? 1 : 0, consent.signed_at || null
    ).run();

    return json({ ok: true, id });
  } catch (err) {
    console.error("submit-a2p error:", err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
