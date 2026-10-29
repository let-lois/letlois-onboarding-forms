-- Part 2 now asks for the client's current website link.
-- Run this once in the Cloudflare D1 Console for the "letlois-onboarding" database.
ALTER TABLE website_submissions ADD COLUMN existing_website TEXT;
