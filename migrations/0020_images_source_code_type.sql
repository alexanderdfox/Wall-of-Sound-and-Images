-- Add source_code_type column for syntax highlighting (e.g. javascript, python, html)
ALTER TABLE images ADD COLUMN source_code_type TEXT;
