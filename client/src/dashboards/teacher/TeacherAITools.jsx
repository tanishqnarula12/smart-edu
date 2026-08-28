import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Sparkles,
  FlaskConical,
  FileSpreadsheet,
  Search,
  Save,
  Printer,
  RefreshCw,
  ClipboardList,
  Users,
  Check,
  MessageSquare,
  Trash2,
  Send,
} from 'lucide-react';
import { aiApi, teacherApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import { AIChat } from '../../components/AIChat.jsx';
import { CreateAssignmentModal } from './TeacherAssignments.jsx';
import {
  Card,
  CardHeader,
  Tabs,
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  Avatar,
  Checkbox,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Callout,
  ConfirmDialog,
  PrintMasthead,
  PrintFooter,
} from '../../components/ui/index.js';
import { formatRelative, humanise } from '../../utils/format.js';
import { BLOOM_LEVELS, QUESTION_TYPES } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';

/**
 * Turn generated content into the plain-text `description` an assignment
 * shows students — deliberately dropping every `answer`/`explanation` field,
 * since publishing a quiz or paper must never hand the class its own key.
 */
function formatQuestionsForStudents(questions) {
  return questions
    .map((question, index) => {
      const options = question.options
        ?.map((option, i) => `   ${String.fromCharCode(65 + i)}. ${option}`)
        .join('\n');
      return `${question.number ?? index + 1}. ${question.question} [${question.marks} marks]${
        options ? `\n${options}` : ''
      }`;
    })
    .join('\n\n');
}

function quizToAssignmentPrefill(quiz) {
  return {
    title: quiz.title,
    description: `${quiz.questionCount} questions · ${quiz.totalMarks} marks · ${humanise(quiz.difficulty)}\n\n${formatQuestionsForStudents(quiz.questions)}`,
    instructions: 'Answer directly in your submission — type your answers, no file upload needed.',
    maxMarks: quiz.totalMarks,
  };
}

function assignmentToPrefill(assignment) {
  const objectives = assignment.objectives?.length
    ? `Learning objectives:\n${assignment.objectives.map((o) => `- ${o}`).join('\n')}\n\n`
    : '';
  const tasks = assignment.tasks
    .map(
      (task) =>
        `${task.number}. ${task.task} [${task.marks} marks]${task.guidance ? `\n   ${task.guidance}` : ''}`
    )
    .join('\n\n');

  return {
    title: assignment.title,
    description: `${assignment.introduction ? `${assignment.introduction}\n\n` : ''}${objectives}${tasks}`,
    instructions: 'Submit either as a file upload or typed directly, whichever suits the task.',
    maxMarks: assignment.totalMarks,
  };
}

function paperToPrefill(paper) {
  const sections = paper.sections
    .map((section) => {
      const questions = formatQuestionsForStudents(section.questions);
      return `${section.name} (${section.marks} marks)\n${section.instructions}\n\n${questions}`;
    })
    .join('\n\n───\n\n');

  const header = paper.instructions?.length
    ? `${paper.instructions.map((instruction, i) => `${i + 1}. ${instruction}`).join('\n')}\n\n`
    : '';

  return {
    title: paper.title,
    description: `${header}${sections}`,
    instructions: `Time allowed: ${Math.floor(paper.durationMinutes / 60)}h ${paper.durationMinutes % 60}m. Answer directly in your submission.`,
    maxMarks: paper.totalMarks,
  };
}

/** Teacher AI tools (§23–§26): generators, natural-language search and chat. */
export function TeacherAITools() {
  const [tab, setTab] = useState('quiz');

  return (
    <>
      <PageHeader
        title="AI tools"
        description="Generate assessments, search your students in plain English, and ask about your classes."
      />

      <Tabs
        tabs={[
          { value: 'quiz', label: 'Quiz generator', icon: FlaskConical },
          { value: 'assignment', label: 'Assignment', icon: ClipboardList },
          { value: 'paper', label: 'Question paper', icon: FileSpreadsheet },
          { value: 'search', label: 'Student search', icon: Search },
          { value: 'chat', label: 'Assistant', icon: MessageSquare },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'quiz' && <QuizGenerator />}
      {tab === 'assignment' && <AssignmentGenerator />}
      {tab === 'paper' && <QuestionPaperGenerator />}
      {tab === 'search' && <NaturalLanguageSearch />}
      {tab === 'chat' && (
        <AIChat title="Teaching assistant" description="Grounded in the classes you teach" />
      )}
    </>
  );
}

/** Reusable subject/class pickers driven by the teacher's own assignments. */
function useTeachingOptions() {
  const { data } = useApi(() => teacherApi.myClasses(), []);

  const classes = useMemo(() => {
    const map = new Map();
    for (const row of data ?? []) {
      if (!map.has(row.class_id)) {
        map.set(row.class_id, { value: row.class_id, label: `${row.class_name} ${row.section}` });
      }
    }
    return [...map.values()];
  }, [data]);

  const subjects = useMemo(() => {
    const map = new Map();
    for (const row of data ?? []) {
      if (!map.has(row.subject_id)) {
        map.set(row.subject_id, { value: row.subject_id, label: row.subject_name });
      }
    }
    return [...map.values()];
  }, [data]);

  return { classes, subjects };
}

// ═══════════════════════════ QUIZ GENERATOR ═══════════════════════════════

function QuizGenerator() {
  const toast = useToast();
  const { classes, subjects } = useTeachingOptions();

  const [quiz, setQuiz] = useState(null);
  const [isGenerating, setGenerating] = useState(false);
  const [showAnswers, setShowAnswers] = useState(true);
  const [types, setTypes] = useState(['mcq']);
  const [publishPrefill, setPublishPrefill] = useState(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { difficulty: 'medium', questionCount: 10, bloomLevel: 'understand' },
  });

  const generate = async (values) => {
    if (!types.length) {
      toast.error('Choose at least one question type');
      return;
    }

    setGenerating(true);
    try {
      const result = await aiApi.generateQuiz({ ...values, questionTypes: types });
      setQuiz(result);
      toast.success(`Generated ${result.questionCount} questions`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    try {
      await aiApi.save({
        kind: 'quiz',
        title: quiz.title,
        topic: quiz.topic,
        difficulty: quiz.difficulty,
        payload: quiz,
      });
      toast.success('Quiz saved to your library');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="no-print lg:sticky lg:top-24 lg:self-start">
        <CardHeader title="Generate a quiz" icon={FlaskConical} />

        <form onSubmit={handleSubmit(generate)} className="mt-4 space-y-4">
          <Select
            label="Subject"
            options={subjects}
            placeholder="Select a subject"
            required
            error={errors.subjectId?.message}
            {...register('subjectId', { required: 'Choose a subject' })}
          />

          <Select label="Class" options={classes} placeholder="Any class" {...register('classId')} />

          <Input
            label="Topic"
            placeholder="Binary search trees"
            required
            error={errors.topic?.message}
            {...register('topic', { required: 'Enter a topic' })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Difficulty"
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
                { value: 'mixed', label: 'Mixed' },
              ]}
              {...register('difficulty')}
            />
            <Input
              label="Questions"
              type="number"
              min="1"
              max="50"
              {...register('questionCount')}
            />
          </div>

          <Select label="Bloom's level" options={BLOOM_LEVELS} {...register('bloomLevel')} />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Question types</legend>
            <div className="space-y-2">
              {QUESTION_TYPES.map((type) => (
                <Checkbox
                  key={type.value}
                  label={type.label}
                  checked={types.includes(type.value)}
                  onChange={(event) =>
                    setTypes((current) =>
                      event.target.checked
                        ? [...current, type.value]
                        : current.filter((value) => value !== type.value)
                    )
                  }
                />
              ))}
            </div>
          </fieldset>

          <Button
            type="submit"
            fullWidth
            icon={quiz ? RefreshCw : Sparkles}
            isLoading={isGenerating}
          >
            {quiz ? 'Regenerate' : 'Generate quiz'}
          </Button>
        </form>
      </Card>

      <div className="lg:col-span-2">
        {!quiz ? (
          <EmptyState
            icon={FlaskConical}
            title="No quiz generated yet"
            message="Choose a subject and topic, then generate. Every question comes with an answer key you can edit."
          />
        ) : (
          <>
            <PrintMasthead title="Quiz" subtitle={quiz.title} />
            <PrintFooter />
            <Card className="print-full">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">{quiz.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {quiz.questionCount} questions · {quiz.totalMarks} marks · {humanise(quiz.difficulty)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="neutral" size="sm">{quiz.subject}</Badge>
                  <Badge tone="brand" size="sm">{quiz.topic}</Badge>
                  <Badge tone="info" size="sm">{humanise(quiz.bloomLevel)}</Badge>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2 no-print">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAnswers((current) => !current)}
                >
                  {showAnswers ? 'Hide answers' : 'Show answers'}
                </Button>
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                  Print
                </Button>
                <Button variant="secondary" size="sm" icon={Save} onClick={save}>
                  Save
                </Button>
                <Button
                  size="sm"
                  icon={Send}
                  onClick={() => setPublishPrefill(quizToAssignmentPrefill(quiz))}
                >
                  Publish to a class
                </Button>
              </div>
            </div>

            <ol className="mt-6 space-y-6">
              {quiz.questions.map((question) => (
                <li key={question.number} className="border-b border-line pb-6 last:border-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-xs font-bold text-ink-muted">
                      {question.number}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-relaxed text-ink">
                        {question.question}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone="neutral" size="sm">{humanise(question.type)}</Badge>
                        <Badge tone="info" size="sm">{question.marks} marks</Badge>
                        <Badge tone="neutral" size="sm">{humanise(question.bloomLevel)}</Badge>
                      </div>

                      {question.options && (
                        <ul className="mt-3 space-y-1.5">
                          {question.options.map((option, index) => {
                            const isCorrect = showAnswers && option === question.answer;
                            return (
                              <li
                                key={index}
                                className={cn(
                                  'flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                                  isCorrect
                                    ? 'bg-success-50 font-medium text-success-800 dark:bg-success-500/10 dark:text-success-500'
                                    : 'text-ink-muted'
                                )}
                              >
                                <span className="font-mono text-xs">
                                  {String.fromCharCode(65 + index)}.
                                </span>
                                <span className="flex-1">{option}</span>
                                {isCorrect && <Check size={14} className="shrink-0" aria-hidden="true" />}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {showAnswers && !question.options && (
                        <div className="mt-3 rounded-lg bg-success-50 p-3 dark:bg-success-500/10">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-success-700 dark:text-success-500">
                            Expected answer
                          </p>
                          <p className="mt-1 text-sm text-success-900 dark:text-success-100">
                            {question.answer}
                          </p>
                        </div>
                      )}

                      {showAnswers && question.explanation && (
                        <p className="mt-2 text-xs italic leading-relaxed text-ink-subtle">
                          {question.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-6 border-t border-line pt-4 text-xs text-ink-subtle">
              Generated by {quiz.generatedBy}. Review and edit before using with students.
            </p>
            </Card>

            <CreateAssignmentModal
              isOpen={Boolean(publishPrefill)}
              onClose={() => setPublishPrefill(null)}
              prefill={publishPrefill}
              onCreated={() => {
                setPublishPrefill(null);
                toast.success('Published — students in that class have been notified');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════ ASSIGNMENT GENERATOR ════════════════════════════

function AssignmentGenerator() {
  const toast = useToast();
  const { classes, subjects } = useTeachingOptions();

  const [assignment, setAssignment] = useState(null);
  const [isGenerating, setGenerating] = useState(false);
  const [publishPrefill, setPublishPrefill] = useState(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { difficulty: 'medium', questionCount: 5 },
  });

  const generate = async (values) => {
    setGenerating(true);
    try {
      const objectives = values.learningObjectives
        ? values.learningObjectives.split('\n').map((line) => line.trim()).filter(Boolean)
        : [];

      const result = await aiApi.generateAssignment({ ...values, learningObjectives: objectives });
      setAssignment(result);
      toast.success('Assignment generated');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    try {
      await aiApi.save({
        kind: 'assignment',
        title: assignment.title,
        topic: assignment.topic,
        difficulty: assignment.difficulty,
        payload: assignment,
      });
      toast.success('Saved to your library');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="no-print lg:sticky lg:top-24 lg:self-start">
        <CardHeader title="Generate an assignment" icon={ClipboardList} />

        <form onSubmit={handleSubmit(generate)} className="mt-4 space-y-4">
          <Select
            label="Subject"
            options={subjects}
            placeholder="Select a subject"
            required
            error={errors.subjectId?.message}
            {...register('subjectId', { required: 'Choose a subject' })}
          />
          <Select label="Class" options={classes} placeholder="Any class" {...register('classId')} />
          <Input
            label="Topic"
            placeholder="Normalisation"
            required
            error={errors.topic?.message}
            {...register('topic', { required: 'Enter a topic' })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Difficulty"
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
                { value: 'mixed', label: 'Mixed' },
              ]}
              {...register('difficulty')}
            />
            <Input label="Tasks" type="number" min="1" max="25" {...register('questionCount')} />
          </div>

          <Textarea
            label="Learning objectives"
            rows={4}
            placeholder={'One per line, e.g.\nApply normalisation to an unfamiliar schema'}
            hint="Optional — sensible defaults are used if left empty"
            {...register('learningObjectives')}
          />

          <Button type="submit" fullWidth icon={Sparkles} isLoading={isGenerating}>
            {assignment ? 'Regenerate' : 'Generate assignment'}
          </Button>
        </form>
      </Card>

      <div className="lg:col-span-2">
        {!assignment ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignment generated yet"
            message="Describe the topic and objectives, and a structured assignment with a marking rubric will be produced."
          />
        ) : (
          <>
            <PrintMasthead title="Assignment" subtitle={assignment.title} />
            <PrintFooter />
            <Card className="print-full">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">{assignment.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {assignment.tasks.length} tasks · {assignment.totalMarks} marks
                </p>
              </div>
              <div className="flex shrink-0 gap-2 no-print">
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                  Print
                </Button>
                <Button variant="secondary" size="sm" icon={Save} onClick={save}>
                  Save
                </Button>
                <Button
                  size="sm"
                  icon={Send}
                  onClick={() => setPublishPrefill(assignmentToPrefill(assignment))}
                >
                  Publish to a class
                </Button>
              </div>
            </div>

            {assignment.introduction && (
              <p className="mt-4 rounded-xl bg-surface-sunken p-4 text-sm leading-relaxed text-ink">
                {assignment.introduction}
              </p>
            )}

            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Learning objectives
              </h3>
              <ul className="space-y-1.5">
                {assignment.objectives.map((objective, index) => (
                  <li key={index} className="flex gap-2 text-sm text-ink-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                    {objective}
                  </li>
                ))}
              </ul>
            </div>

            <ol className="mt-6 space-y-5">
              {assignment.tasks.map((task) => (
                <li key={task.number} className="rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink">
                      {task.number}. {task.task}
                    </p>
                    <Badge tone="info" size="sm">
                      {task.marks} marks
                    </Badge>
                  </div>
                  {task.guidance && (
                    <p className="mt-2 text-xs leading-relaxed text-ink-muted">{task.guidance}</p>
                  )}
                  <Badge tone="neutral" size="sm" className="mt-2">
                    {humanise(task.bloomLevel)}
                  </Badge>
                </li>
              ))}
            </ol>

            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Marking rubric
              </h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {assignment.rubric.map((criterion, index) => (
                  <li key={index} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{criterion.criterion}</p>
                      <p className="text-xs text-ink-muted">{criterion.descriptor}</p>
                    </div>
                    <Badge tone="brand" size="sm">
                      {criterion.weight}%
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            </Card>

            <CreateAssignmentModal
              isOpen={Boolean(publishPrefill)}
              onClose={() => setPublishPrefill(null)}
              prefill={publishPrefill}
              onCreated={() => {
                setPublishPrefill(null);
                toast.success('Published — students in that class have been notified');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════ QUESTION PAPER GENERATOR ═════════════════════════

function QuestionPaperGenerator() {
  const toast = useToast();
  const { classes, subjects } = useTeachingOptions();

  const [paper, setPaper] = useState(null);
  const [isGenerating, setGenerating] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [publishPrefill, setPublishPrefill] = useState(null);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { totalMarks: 100, durationMinutes: 180 },
  });

  const generate = async (values) => {
    const topics = String(values.topics ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!topics.length) {
      toast.error('List at least one topic');
      return;
    }

    setGenerating(true);
    try {
      const result = await aiApi.generateQuestionPaper({ ...values, topics });
      setPaper(result);
      toast.success('Question paper generated');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    try {
      await aiApi.save({
        kind: 'question_paper',
        title: paper.title,
        payload: paper,
      });
      toast.success('Saved to your library');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="no-print lg:sticky lg:top-24 lg:self-start">
        <CardHeader title="Generate a question paper" icon={FileSpreadsheet} />

        <form onSubmit={handleSubmit(generate)} className="mt-4 space-y-4">
          <Select
            label="Subject"
            options={subjects}
            placeholder="Select a subject"
            required
            error={errors.subjectId?.message}
            {...register('subjectId', { required: 'Choose a subject' })}
          />
          <Select label="Class" options={classes} placeholder="Any class" {...register('classId')} />

          <Textarea
            label="Topics"
            rows={5}
            placeholder={'One per line, e.g.\nTrees and graphs\nSorting algorithms'}
            required
            {...register('topics')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Total marks" type="number" min="10" max="200" {...register('totalMarks')} />
            <Input
              label="Duration (min)"
              type="number"
              min="15"
              max="360"
              {...register('durationMinutes')}
            />
          </div>

          <Button type="submit" fullWidth icon={Sparkles} isLoading={isGenerating}>
            {paper ? 'Regenerate' : 'Generate paper'}
          </Button>
        </form>
      </Card>

      <div className="lg:col-span-2">
        {!paper ? (
          <EmptyState
            icon={FileSpreadsheet}
            title="No paper generated yet"
            message="List the topics to cover and a sectioned paper with a marks distribution and answer key will be produced."
          />
        ) : (
          <>
            <PrintFooter label="Smart Edu — Confidential examination material" />
            <Card className="print-full">
            <div className="flex flex-wrap items-start justify-between gap-3 no-print">
              <div />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAnswers((c) => !c)}>
                  {showAnswers ? 'Hide answer key' : 'Show answer key'}
                </Button>
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                  Print
                </Button>
                <Button variant="secondary" size="sm" icon={Save} onClick={save}>
                  Save
                </Button>
                <Button
                  size="sm"
                  icon={Send}
                  onClick={() => setPublishPrefill(paperToPrefill(paper))}
                >
                  Publish to a class
                </Button>
              </div>
            </div>

            <p className="hidden text-center text-[10px] uppercase tracking-widest text-ink-subtle print:block">
              Smart Edu
            </p>

            {/* Paper header, styled like a real exam paper */}
            <div className="mt-4 border-b-2 border-ink pb-4 text-center">
              <h2 className="text-lg font-bold uppercase tracking-wide text-ink">{paper.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{paper.subject}</p>
              <div className="mt-3 flex justify-between text-sm font-medium text-ink">
                <span>Time: {Math.floor(paper.durationMinutes / 60)}h {paper.durationMinutes % 60}m</span>
                <span>Maximum marks: {paper.totalMarks}</span>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Instructions
              </p>
              <ol className="mt-2 space-y-1 text-sm text-ink-muted">
                {paper.instructions.map((instruction, index) => (
                  <li key={index}>
                    {index + 1}. {instruction}
                  </li>
                ))}
              </ol>
            </div>

            {paper.sections.map((section) => (
              <section key={section.name} className="mt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-ink">
                    {section.name}
                  </h3>
                  <span className="text-xs text-ink-muted">{section.marks} marks</span>
                </div>
                <p className="mt-1.5 text-xs italic text-ink-muted">{section.instructions}</p>

                <ol className="mt-3 space-y-3">
                  {section.questions.map((question) => (
                    <li key={question.number} className="text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-ink">
                          <span className="font-semibold">{question.number}.</span>{' '}
                          {question.question}
                        </p>
                        <span className="shrink-0 text-xs text-ink-muted">[{question.marks}]</span>
                      </div>

                      {question.options && (
                        <ul className="mt-1.5 grid gap-1 pl-5 sm:grid-cols-2">
                          {question.options.map((option, index) => (
                            <li key={index} className="text-xs text-ink-muted">
                              ({String.fromCharCode(97 + index)}) {option}
                            </li>
                          ))}
                        </ul>
                      )}

                      {showAnswers && (
                        <p className="mt-1.5 rounded-lg bg-success-50 px-2.5 py-1.5 text-xs text-success-800 dark:bg-success-500/10 dark:text-success-500">
                          <span className="font-semibold">Answer:</span> {question.answer}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
            </Card>

            <CreateAssignmentModal
              isOpen={Boolean(publishPrefill)}
              onClose={() => setPublishPrefill(null)}
              prefill={publishPrefill}
              onCreated={() => {
                setPublishPrefill(null);
                toast.success('Published — students in that class have been notified');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════ NATURAL-LANGUAGE SEARCH ═══════════════════════════

/**
 * Plain-English student search (§26).
 *
 * The phrase is translated into one of a fixed set of validated queries on the
 * server — no generated SQL is ever run. When a phrase is not understood the
 * UI says so and offers the examples that do work.
 */
function NaturalLanguageSearch() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [isSearching, setSearching] = useState(false);

  const examples = [
    'Show students below 75% attendance',
    'Which students are struggling in mathematics?',
    'Show students whose marks dropped by more than 10%',
    'Who has pending assignments?',
    'Which students are at risk?',
    'Top 10 performers',
  ];

  const search = async (text) => {
    const value = (text ?? query).trim();
    if (value.length < 3) return;

    setQuery(value);
    setSearching(true);
    try {
      const data = await aiApi.search({ query: value });
      setResult(data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Ask about your students"
          subtitle="Describe what you're looking for in plain English"
          icon={Search}
        />

        <form
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
          className="mt-4 flex gap-2"
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Show students below 75% attendance"
            containerClassName="flex-1"
            aria-label="Search query"
          />
          <Button type="submit" icon={Search} isLoading={isSearching} className="mt-0 h-10 self-end">
            Search
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => search(example)}
              className="rounded-full border border-line bg-surface-sunken px-3 py-1.5 text-xs text-ink-muted transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/40"
            >
              {example}
            </button>
          ))}
        </div>

        <Callout tone="neutral" className="mt-4">
          <p className="text-xs leading-relaxed">
            Your phrasing is matched to a fixed set of pre-written, parameterised queries. The AI
            never writes SQL that gets executed — if a phrase does not match, you get the examples
            above rather than a guess.
          </p>
        </Callout>
      </Card>

      {result && (
        <Card>
          <CardHeader
            title={result.understood ? result.interpretation : 'Not understood'}
            subtitle={result.message}
            icon={Users}
            action={
              result.results?.length > 0 && (
                <Badge tone="brand">{result.results.length} students</Badge>
              )
            }
          />

          <div className="mt-4">
            {!result.understood ? (
              <div className="rounded-xl border border-dashed border-line p-5">
                <p className="text-sm text-ink-muted">{result.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(result.examples ?? examples).map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => search(example)}
                      className="rounded-full bg-surface-sunken px-3 py-1.5 text-xs text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : result.results.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students matched"
                message="Nobody in your classes fits that description right now — which is usually good news."
                compact
              />
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {result.results.map((student) => (
                    <li key={`${student.studentId}-${student.detail ?? ''}`} className="flex items-center gap-3 py-3">
                      <Avatar name={student.name} src={student.avatarUrl} size="sm" />

                      <div className="min-w-0 flex-1">
                        <a
                          href={`/teacher/students/${student.studentId}`}
                          className="block truncate text-sm font-medium text-ink hover:text-brand-600"
                        >
                          {student.name}
                        </a>
                        <p className="truncate text-xs text-ink-muted">
                          {student.className}
                          {student.rollNumber && ` · Roll ${student.rollNumber}`}
                        </p>
                        {student.detail && (
                          <p className="mt-0.5 truncate text-xs text-ink-subtle">{student.detail}</p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-ink">
                          {student.metric}
                          {result.metricUnit ?? ''}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-ink-subtle">
                          {result.metricLabel}
                        </p>
                      </div>

                      {student.riskLevel && (
                        <Badge
                          tone={
                            student.riskLevel === 'high'
                              ? 'danger'
                              : student.riskLevel === 'medium'
                                ? 'warning'
                                : 'neutral'
                          }
                          size="sm"
                        >
                          {student.riskLevel}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>

                {result.caveat && (
                  <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-subtle">
                    {result.caveat}
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/** /teacher/quizzes and /teacher/question-papers — the saved library. */
export function TeacherLibrary({ kind = 'quiz', title, description }) {
  const toast = useToast();
  const [toDelete, setToDelete] = useState(null);

  const { data, isLoading, error, refetch } = useApi(() => aiApi.saved({ kind }), [kind]);

  const remove = async () => {
    try {
      await aiApi.deleteSaved(toDelete.id);
      toast.success('Deleted');
      setToDelete(null);
      refetch();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        action={
          <Button to="/teacher/ai-tools" icon={Sparkles}>
            Generate new
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={3} height="h-32" />
      ) : !data?.length ? (
        <EmptyState
          icon={kind === 'quiz' ? FlaskConical : FileSpreadsheet}
          title={`No saved ${kind === 'quiz' ? 'quizzes' : 'question papers'}`}
          message="Generate one from the AI tools and save it here for reuse."
          action={
            <Button to="/teacher/ai-tools" icon={Sparkles}>
              Open AI tools
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">{item.title}</h3>
                <Button
                  variant="ghost"
                  size="xs"
                  icon={Trash2}
                  onClick={() => setToDelete(item)}
                  aria-label="Delete"
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.subject_name && (
                  <Badge tone="neutral" size="sm">
                    {item.subject_name}
                  </Badge>
                )}
                {item.topic && (
                  <Badge tone="brand" size="sm">
                    {item.topic}
                  </Badge>
                )}
                {item.difficulty && (
                  <Badge tone="info" size="sm">
                    {humanise(item.difficulty)}
                  </Badge>
                )}
              </div>

              <dl className="mt-4 space-y-1.5 text-xs text-ink-muted">
                {item.payload?.questionCount && (
                  <div className="flex justify-between">
                    <dt>Questions</dt>
                    <dd className="font-medium text-ink">{item.payload.questionCount}</dd>
                  </div>
                )}
                {item.payload?.totalMarks && (
                  <div className="flex justify-between">
                    <dt>Total marks</dt>
                    <dd className="font-medium text-ink">{item.payload.totalMarks}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Created</dt>
                  <dd>{formatRelative(item.created_at)}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this item?"
        message={toDelete ? `"${toDelete.title}" will be permanently removed.` : ''}
        confirmLabel="Delete"
      />
    </>
  );
}

export default TeacherAITools;
