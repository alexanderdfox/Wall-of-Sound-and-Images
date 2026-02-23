-- Add reporter IP to reports for admin visibility
-- Run: wrangler d1 execute tchoff-db --remote --file=migrations/0010_reports_reporter_ip.sql

ALTER TABLE reports ADD COLUMN reporter_ip TEXT;
