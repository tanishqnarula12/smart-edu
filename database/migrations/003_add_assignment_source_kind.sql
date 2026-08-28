-- Tags which AI generator an assignment was published from (quiz,
-- assignment, question_paper), or NULL for a manually created one — lets the
-- student "Quizzes" section and the teacher "Quiz progress" view filter down
-- to just quizzes instead of showing every assignment.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source_kind VARCHAR(20);
