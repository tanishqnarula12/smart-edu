import { useState } from 'react';
import {
  Sparkles,
  BookOpenCheck,
  Download,
  RefreshCw,
  Printer,
} from 'lucide-react';
import { aiApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import { AIChat } from '../../components/AIChat.jsx';
import {
  Card,
  CardHeader,
  Button,
  Select,
  EmptyState,
} from '../../components/ui/index.js';

/** AI tutor (§15). The chat component handles everything; this is the frame. */
export function StudentAITutor() {
  return (
    <>
      <PageHeader
        title="AI Tutor"
        description="Ask about your subjects, your results, or anything you're stuck on."
      />
      <AIChat
        title="Your study assistant"
        description="Answers grounded in your own academic record"
      />
    </>
  );
}

/** Study plan generator (§16). */
export function StudentStudyPlan() {
  const toast = useToast();
  const [days, setDays] = useState(14);
  const [plan, setPlan] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: insights } = useApi(() => aiApi.insights(), []);

  const generate = async () => {
    setIsGenerating(true);
    try {
      const data = await aiApi.studyPlan(Number(days));
      setPlan(data.plan);
      toast.success('Study plan ready');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const download = () => {
    const blob = new Blob([plan], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-edu-study-plan-${days}-days.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Study plan"
        description="A day-by-day plan built around your weakest subjects and outstanding work."
        action={
          plan && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={download}>
                Download
              </Button>
            </div>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card className="no-print">
            <CardHeader title="Generate a plan" icon={BookOpenCheck} />

            <div className="mt-4 space-y-4">
              <Select
                label="Plan length"
                value={days}
                onChange={(event) => setDays(event.target.value)}
                options={[
                  { value: 7, label: '1 week' },
                  { value: 14, label: '2 weeks' },
                  { value: 21, label: '3 weeks' },
                  { value: 30, label: '1 month' },
                ]}
              />

              <Button
                fullWidth
                icon={plan ? RefreshCw : Sparkles}
                onClick={generate}
                isLoading={isGenerating}
              >
                {plan ? 'Regenerate plan' : 'Generate my plan'}
              </Button>

              <p className="text-xs leading-relaxed text-ink-muted">
                The plan prioritises subjects where your average is lowest, flags any attendance
                shortfall, and puts outstanding assignments first.
              </p>
            </div>
          </Card>

          {insights?.weaknesses?.length > 0 && (
            <Card className="no-print">
              <CardHeader title="What it will focus on" />
              <ul className="mt-3 space-y-2">
                {insights.weaknesses.slice(0, 5).map((weakness, index) => (
                  <li key={index} className="flex gap-2 text-sm text-ink-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning-500" aria-hidden="true" />
                    {weakness}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card className="print-full lg:col-span-2">
          {!plan ? (
            <EmptyState
              icon={BookOpenCheck}
              title="No plan yet"
              message="Choose a length and generate a plan built from your own academic record."
            />
          ) : (
            <article className="prose-sm max-w-none">
              <PlanRenderer markdown={plan} />
            </article>
          )}
        </Card>
      </div>
    </>
  );
}

/**
 * Renders the generated plan's markdown. Deliberately small — the plan uses
 * only headings, bold, lists and blockquotes.
 */
function PlanRenderer({ markdown }) {
  const lines = String(markdown ?? '').split('\n');
  const elements = [];
  let listBuffer = [];

  const bold = (text) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  const flush = () => {
    if (!listBuffer.length) return;
    elements.push(
      <ul key={`list-${elements.length}`} className="my-2 space-y-1.5">
        {listBuffer.map((item, index) => (
          <li key={index} className="flex gap-2.5 text-sm text-ink-muted">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
            <span dangerouslySetInnerHTML={{ __html: bold(item) }} />
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (/^-\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^-\s+/, ''));
      return;
    }

    flush();

    if (!trimmed) {
      elements.push(<div key={index} className="h-2" />);
    } else if (/^#\s/.test(trimmed)) {
      elements.push(
        <h2 key={index} className="mb-3 mt-1 text-lg font-bold text-ink">
          {trimmed.replace(/^#\s/, '')}
        </h2>
      );
    } else if (/^##\s/.test(trimmed)) {
      elements.push(
        <h3 key={index} className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {trimmed.replace(/^##\s/, '')}
        </h3>
      );
    } else if (/^>\s?/.test(trimmed)) {
      elements.push(
        <blockquote
          key={index}
          className="my-3 rounded-r-lg border-l-4 border-warning-500 bg-warning-50 p-3 text-sm text-warning-900 dark:bg-warning-500/10 dark:text-warning-100"
          dangerouslySetInnerHTML={{ __html: bold(trimmed.replace(/^>\s?/, '')) }}
        />
      );
    } else if (/^---+$/.test(trimmed)) {
      elements.push(<hr key={index} className="my-5 border-line" />);
    } else if (/^\*\*Day/.test(trimmed)) {
      elements.push(
        <p
          key={index}
          className="mt-4 text-sm font-semibold text-ink"
          dangerouslySetInnerHTML={{ __html: bold(trimmed) }}
        />
      );
    } else {
      elements.push(
        <p
          key={index}
          className="text-sm leading-relaxed text-ink-muted"
          dangerouslySetInnerHTML={{ __html: bold(trimmed) }}
        />
      );
    }
  });

  flush();
  return <>{elements}</>;
}

export default StudentAITutor;
