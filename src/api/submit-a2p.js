/**
 * Handles POST /api/submit-a2p — called from src/index.js.
 *
 * Expects multipart/form-data with a single "data" field: a JSON string
 * matching the shape produced by public/ads/a2p/index.html's CONFIG.steps.
 *
 * Required bindings/vars (see wrangler.toml):
 *   env.DB                — D1 database binding
 *   env.SHEETS_WEBHOOK_URL — Apps Script Web App URL for the Sheets sync
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
    const software = formatSoftware(data.software_access);

    await env.DB.prepare(
      `INSERT INTO a2p_submissions (
        id, submitted_at, plan, part,
        business_name,
        business_email, respondent_legal_name, respondent_title, ein, legal_biz_name,
        legal_biz_street, legal_biz_suite, legal_biz_city, legal_biz_state, legal_biz_zip,
        legal_biz_entity_type, mobile_cell_phone,
        software_access, team_members,
        consent_agreed, consent_signed_at
      ) VALUES (?,?,?,?, ?, ?,?,?,?,?, ?,?,?,?,?, ?,?, ?,?, ?,?)`
    ).bind(
      id, submittedAt, "ads", "a2p",
      data.business_name || "",
      data.business_email, data.respondent_legal_name, data.respondent_title, data.ein, data.legal_biz_name,
      addr.street || "", addr.suite || null, addr.city || "", addr.state || "", addr.zip || "",
      data.legal_biz_entity_type, data.mobile_cell_phone,
      software, JSON.stringify(data.team_members || []),
      consent.agreed ? 1 : 0, consent.signed_at || null
    ).run();

    // Best-effort push to Google Sheets — never blocks the actual submission,
    // since D1 is the source of truth. Business Name is used to match/merge
    // a client's row across the 3 onboarding parts.
    try {
      const addressParts = [addr.street, addr.suite, addr.city, addr.state, addr.zip].filter(Boolean);
      const teamMembers = (data.team_members || [])
        .filter(m => m.name || m.email || m.phone)
        .map(m => [m.name, m.email, m.phone].filter(Boolean).join(", "))
        .join("; ");

      const sheetsRes = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: "a2p",
          business_name: data.business_name || "",
          email: data.business_email,
          name: data.respondent_legal_name,
          title: data.respondent_title,
          ein: data.ein,
          legal_biz_name: data.legal_biz_name,
          biz_address: addressParts.join(", "),
          biz_type: data.legal_biz_entity_type,
          mobile: data.mobile_cell_phone,
          crm: software,
          additional_team: teamMembers,
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
    console.error("submit-a2p error:", err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// The software question sends { selected: [...], other, notes }. This turns it into one
// readable line for the database and the Google Sheet, e.g.
//   "Jobber, ServiceTitan · Notes: Mike (owner) manages Jobber, mike@acme.com"
// Older versions of the form sent plain text, so a string is passed through as is.
function formatSoftware(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  const picked = (Array.isArray(v.selected) ? v.selected : []).map(x => String(x).trim()).filter(Boolean);
  const notes = String(v.notes || "").trim();
  const names = picked.join(", ");
  if (names && notes) return names + " · Notes: " + notes;
  return names || (notes ? "Notes: " + notes : "");
}
