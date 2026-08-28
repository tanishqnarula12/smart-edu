import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FileText, Plus, Trash2, Lock, School, Globe } from 'lucide-react';
import { aiApi, teacherApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  Button,
  Modal,
  Input,
  Textarea,
  Select,
  Badge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  ConfirmDialog,
  Callout,
} from '../../components/ui/index.js';
import { formatRelative, humanise } from '../../utils/format.js';

const SOURCE_TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'material', label: 'Study material' },
  { value: 'syllabus', label: 'Syllabus' },
  { value: 'faq', label: 'FAQ' },
  { value: 'assignment', label: 'Assignment reference' },
  { value: 'notice', label: 'Notice' },
];

const VISIBILITY_META = {
  private: { label: 'Only me', icon: Lock },
  class: { label: 'One class', icon: School },
  institution: { label: 'Everyone', icon: Globe },
};

/**
 * Study material for the AI assistant to reference (§ RAG). The backend has
 * always supported this — upload, list, delete, with proper visibility
 * scoping — it just never had a page.
 */
export function TeacherDocuments() {
  const { user } = useAuth();
  const toast = useToast();
  const [isAddOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const { data, isLoading, error, refetch } = useApi(() => aiApi.documents(), []);
  const documents = data?.documents ?? [];
  const status = data?.status;

  const remove = async () => {
    try {
      await aiApi.deleteDocument(toDelete.id);
      toast.success('Removed');
      setToDelete(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Study materials"
        description="Documents the AI assistant can reference when answering questions."
        action={
          <Button icon={Plus} onClick={() => setAddOpen(true)}>
            Add material
          </Button>
        }
      />

      {status && (
        <Callout tone="info" className="mb-6">
          Retrieval mode: {status.mode === 'vector' ? 'semantic search' : 'full-text search'}.{' '}
          {status.note}
        </Callout>
      )}

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-28" />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No study material yet"
          message="Add notes, a syllabus or FAQs so the AI assistant can answer from your institution's own material, not just generic knowledge."
          action={
            <Button icon={Plus} onClick={() => setAddOpen(true)}>
              Add material
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {documents.map((doc) => {
            const visMeta = VISIBILITY_META[doc.visibility] ?? VISIBILITY_META.class;
            const canDelete = doc.uploaded_by === user?.id;

            return (
              <Card key={doc.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">{doc.title}</h3>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={Trash2}
                      onClick={() => setToDelete(doc)}
                      aria-label="Remove"
                    />
                  )}
                </div>

                {doc.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-ink-muted">{doc.description}</p>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="neutral" size="sm">
                    {humanise(doc.source_type)}
                  </Badge>
                  <Badge tone="brand" size="sm" icon={visMeta.icon}>
                    {visMeta.label}
                  </Badge>
                  {!doc.is_indexed && (
                    <Badge tone="warning" size="sm">
                      Not indexed
                    </Badge>
                  )}
                </div>

                <dl className="mt-4 space-y-1.5 text-xs text-ink-muted">
                  {doc.subject_name && (
                    <div className="flex justify-between">
                      <dt>Subject</dt>
                      <dd className="font-medium text-ink">{doc.subject_name}</dd>
                    </div>
                  )}
                  {doc.class_name && (
                    <div className="flex justify-between">
                      <dt>Class</dt>
                      <dd className="font-medium text-ink">
                        {doc.class_name} {doc.section}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt>Chunks indexed</dt>
                    <dd className="font-medium text-ink">{doc.chunk_count}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Added by</dt>
                    <dd>{doc.uploaded_by_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Added</dt>
                    <dd>{formatRelative(doc.created_at)}</dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}

      <AddDocumentModal
        isOpen={isAddOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          refetch();
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Remove this material?"
        message={toDelete ? `"${toDelete.title}" will no longer be available to the AI assistant.` : ''}
        confirmLabel="Remove"
      />
    </>
  );
}

function AddDocumentModal({ isOpen, onClose, onCreated }) {
  const toast = useToast();
  const [file, setFile] = useState(null);

  const { data: assignments } = useApi(() => teacherApi.myClasses(), []);

  const classes = useMemo(() => {
    const map = new Map();
    for (const row of assignments ?? []) {
      if (!map.has(row.class_id)) {
        map.set(row.class_id, { value: row.class_id, label: `${row.class_name} ${row.section}` });
      }
    }
    return [...map.values()];
  }, [assignments]);

  const subjects = useMemo(() => {
    const map = new Map();
    for (const row of assignments ?? []) {
      if (!map.has(row.subject_id)) {
        map.set(row.subject_id, { value: row.subject_id, label: row.subject_name });
      }
    }
    return [...map.values()];
  }, [assignments]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { sourceType: 'note', visibility: 'class' } });

  const visibility = watch('visibility');

  const submit = async (values) => {
    if (!values.content?.trim() && !file) {
      toast.error('Paste some content or attach a file');
      return;
    }
    if (visibility === 'class' && !values.classId) {
      toast.error('Choose which class this is for, or set visibility to "Only me" / "Everyone"');
      return;
    }

    try {
      const payload = new FormData();
      payload.append('title', values.title);
      if (values.description) payload.append('description', values.description);
      payload.append('sourceType', values.sourceType);
      payload.append('visibility', values.visibility);
      if (values.subjectId) payload.append('subjectId', values.subjectId);
      if (values.classId) payload.append('classId', values.classId);
      if (values.content?.trim()) payload.append('content', values.content.trim());
      if (file) payload.append('file', file);

      await aiApi.uploadDocument(payload);
      toast.success('Material added');
      reset({ sourceType: 'note', visibility: 'class' });
      setFile(null);
      onCreated();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add study material"
      description="The AI assistant can pull from this when answering questions within its scope."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            Add material
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Input
          label="Title"
          required
          error={errors.title?.message}
          {...register('title', { required: 'Give it a title' })}
        />

        <Textarea label="Description" rows={2} {...register('description')} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" options={SOURCE_TYPES} {...register('sourceType')} />
          <Select
            label="Who the assistant can use this for"
            options={[
              { value: 'private', label: 'Only me' },
              { value: 'class', label: 'One class' },
              { value: 'institution', label: 'Everyone' },
            ]}
            {...register('visibility')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Subject (optional)"
            options={subjects}
            placeholder="Any subject"
            {...register('subjectId')}
          />
          <Select
            label={visibility === 'class' ? 'Class' : 'Class (optional)'}
            options={classes}
            placeholder="Select a class"
            required={visibility === 'class'}
            {...register('classId')}
          />
        </div>

        <Textarea
          label="Content"
          rows={6}
          placeholder="Paste the material's text here…"
          hint="This is what the assistant actually reads — a file alone is stored but not indexed"
          {...register('content')}
        />

        <div>
          <label htmlFor="document-file" className="mb-1.5 block text-sm font-medium text-ink">
            Or attach a file
          </label>
          <input
            id="document-file"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-xl border border-line bg-surface-raised text-sm text-ink-muted file:mr-3 file:cursor-pointer file:rounded-l-xl file:border-0 file:bg-surface-sunken file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-ink hover:file:bg-line/50"
          />
        </div>
      </form>
    </Modal>
  );
}

export default TeacherDocuments;
