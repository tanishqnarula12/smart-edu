import { useState } from 'react';
import { Sparkles, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parentApi, aiApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import { AIChat } from '../components/AIChat.jsx';
import { ChildSelector } from '../dashboards/parent/ChildSelector.jsx';
import { Card, CardHeader, Callout, Badge, LoadingSkeleton } from '../components/ui/index.js';

/**
 * AI assistant page for parents and admins (§17, §33).
 *
 * Parents pick which child the conversation is about; the selection is passed
 * to the API as context, and the answer is still bounded by that child's
 * privacy settings.
 */
export function AIAssistantPage() {
  const { role } = useAuth();
  const [selectedChildId, setSelectedChildId] = useState(null);

  const { data: children, isLoading } = useApi(
    () => (role === 'parent' ? parentApi.children() : Promise.resolve(null)),
    [role]
  );

  const { data: status } = useApi(() => aiApi.status(), []);

  const child = selectedChildId
    ? children?.find((candidate) => candidate.id === selectedChildId)
    : children?.[0];

  const restricted = child
    ? Object.entries(child.permissions)
        .filter(([, allowed]) => !allowed)
        .map(([scope]) => scope)
    : [];

  return (
    <>
      <PageHeader
        title="AI assistant"
        description={
          role === 'parent'
            ? "Ask about your child's progress in plain language."
            : 'Ask about attendance, performance and institutional trends.'
        }
      >
        {role === 'parent' && children?.length > 1 && (
          <ChildSelector
            students={children}
            selectedId={child?.id}
            onSelect={setSelectedChildId}
            className="mt-4"
          />
        )}
      </PageHeader>

      {role === 'parent' && isLoading && <LoadingSkeleton count={2} height="h-20" />}

      {role === 'parent' && child && restricted.length > 0 && (
        <Callout tone="info" icon={AlertTriangle} title="Some topics are off limits" className="mb-5">
          <p className="text-sm">
            {child.name} has not shared their {restricted.join(', ')} with you, so the assistant
            cannot answer questions about those — that data is never loaded into the conversation.
          </p>
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <AIChat
            contextParams={child ? { studentId: child.id } : {}}
            title={
              role === 'parent'
                ? child
                  ? `About ${child.name}`
                  : 'Parent assistant'
                : 'Institutional analyst'
            }
            description={
              role === 'parent'
                ? 'Only what your child has chosen to share'
                : 'Institution-wide analytics and trends'
            }
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="What it can see" icon={Lightbulb} />

            <div className="mt-4 space-y-2.5 text-sm">
              {role === 'parent' && child ? (
                Object.entries(child.permissions).map(([scope, allowed]) => (
                  <div key={scope} className="flex items-center justify-between gap-2">
                    <span className="capitalize text-ink-muted">{scope}</span>
                    <Badge tone={allowed ? 'success' : 'neutral'} size="sm">
                      {allowed ? 'Shared' : 'Not shared'}
                    </Badge>
                  </div>
                ))
              ) : (
                <ul className="space-y-2">
                  {[
                    'Institution-wide attendance and performance',
                    'Class and department comparisons',
                    'The academic risk register',
                    'Open complaints and leave requests',
                  ].map((item) => (
                    <li key={item} className="flex gap-2 text-ink-muted">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="How it works" icon={Sparkles} />
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Every answer is assembled from records you are permitted to fetch through the API.
              The authorisation check runs before any data reaches the model, so the assistant
              cannot describe something you could not look up yourself.
            </p>

            {status?.ai && (
              <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-ink-muted">Provider</span>
                  <Badge tone={status.ai.live ? 'success' : 'neutral'} size="sm">
                    {status.ai.live ? status.ai.provider : 'built-in'}
                  </Badge>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-ink-muted">Retrieval</span>
                  <span className="font-medium text-ink">{status.rag?.mode}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default AIAssistantPage;
