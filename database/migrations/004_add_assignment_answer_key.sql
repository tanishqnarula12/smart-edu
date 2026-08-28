-- Server-side-only answer key for objectively-gradable questions (mcq,
-- true_false) — never sent to students, only used to auto-score a
-- submission. `selected_answers` records what a student actually picked per
-- question, for auto-grading and for the teacher's own reference.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS answer_key JSONB;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS selected_answers JSONB;
