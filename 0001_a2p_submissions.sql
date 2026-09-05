-- Ads plan, Part 1 — A2P / SMS Compliance intake
-- Run with: wrangler d1 execute letlois-onboarding --file=schema/0001_a2p_submissions.sql [--remote]

CREATE TABLE IF NOT EXISTS a2p_submissions (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'ads',
  part TEXT NOT NULL DEFAULT 'a2p',

  business_email TEXT NOT NULL,
  respondent_legal_name TEXT NOT NULL,
  respondent_title TEXT NOT NULL,
  ein TEXT NOT NULL,
  legal_biz_name TEXT NOT NULL,

  legal_biz_street TEXT NOT NULL,
  legal_biz_suite TEXT,
  legal_biz_city TEXT NOT NULL,
  legal_biz_state TEXT NOT NULL,
  legal_biz_zip TEXT NOT NULL,

  legal_biz_entity_type TEXT NOT NULL,
  mobile_cell_phone TEXT NOT NULL,

  software_access TEXT NOT NULL,   -- free text: CRM/tools they use (info@letlois.com asked to be added as a user)
  team_members TEXT,               -- JSON: [{ "name":"", "email":"", "phone":"" }, ...]

  consent_agreed INTEGER NOT NULL DEFAULT 0,
  consent_signed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_a2p_business_email ON a2p_submissions(business_email);
CREATE INDEX IF NOT EXISTS idx_a2p_submitted_at ON a2p_submissions(submitted_at);
