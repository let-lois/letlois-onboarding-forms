-- Ads plan, Part 3 — Assets intake
-- Run in the D1 Console tab (Storage & Databases → D1 SQLite Database → letlois-onboarding → Console)

CREATE TABLE IF NOT EXISTS assets_submissions (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'ads',
  part TEXT NOT NULL DEFAULT 'assets',

  business_name TEXT NOT NULL,
  top_3_services TEXT,
  offer_details TEXT,
  drive_folder_url TEXT,
  photos_uploaded_count INTEGER NOT NULL DEFAULT 0,
  videos_uploaded_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_assets_biz_name ON assets_submissions(business_name);
