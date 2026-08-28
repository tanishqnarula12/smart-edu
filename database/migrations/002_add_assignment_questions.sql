-- Optional structured question list for an assignment. Only populated when
-- an assignment is published from AI-generated content (a quiz, assignment
-- draft, or question paper) — manually created assignments leave this NULL
-- and the student sees the existing single free-text/upload submission box.
-- Never contains an answer key: that stays server-side in generated_content.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS questions JSONB;
