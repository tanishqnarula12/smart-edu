import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Pin,
} from 'lucide-react';
import { noticeApi, academicApi } from '../services/endpoints.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader } from '../layouts/DashboardLayout.jsx';
import {
  Card,
  Button,
  Modal,
  Input,
  Textarea,
  Select,
  Checkbox,
  Badge,
  StatusBadge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  ConfirmDialog,
  Pagination,
} from '../components/ui/index.js';
import { formatDate, formatRelative, humanise } from '../utils/format.js';
import { NOTICE_CATEGORIES, PRIORITIES } from '../utils/constants.js';
import { cn } from '../utils/cn.js';

/** Notice publishing (§13), shared by teachers and admins. */
export function NoticesManager() {
  const { user, role } = useAuth();
  const toast = useToast();

  const [isOpen, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useApi(() => noticeApi.list({ page, limit: 20 }), [page]);
  const { data: classes } = useApi(() => academicApi.classes(), []);

  const remove = async () => {
    try {
      await noticeApi.remove(toDelete.id);
      toast.success('Notice removed');
      setToDelete(null);
      refetch();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  const notices = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Notices"
        description="Publish announcements to students, parents, staff or a single class."
        action={
          <Button icon={Plus} onClick={() => { setEditing(null); setOpen(true); }}>
            New notice
          </Button>
        }
      />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} height="h-32" />
      ) : notices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No notices"
          message="Publish an announcement and it will reach the audience you choose immediately."
          action={<Button icon={Plus} onClick={() => setOpen(true)}>New notice</Button>}
        />
      ) : (
        <>
          <ul className="space-y-4">
            {notices.map((notice) => {
              const canEdit = role === 'admin' || notice.authorName === user?.name;

              return (
                <li key={notice.id}>
                  <Card
                    className={cn(
                      notice.isPinned && 'border-brand-200 bg-brand-50/30 dark:border-brand-900 dark:bg-brand-950/20'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {notice.isPinned && (
                            <Pin size={13} className="text-brand-600" aria-label="Pinned" />
                          )}
                          <h3 className="text-sm font-semibold text-ink">{notice.title}</h3>
                          <Badge tone="neutral" size="sm">
                            {humanise(notice.category)}
                          </Badge>
                          {['high', 'urgent'].includes(notice.priority) && (
                            <StatusBadge status={notice.priority} size="sm" />
                          )}
                          {notice.targetRole && (
                            <Badge tone="info" size="sm">
                              {humanise(notice.targetRole)}s only
                            </Badge>
                          )}
                          {notice.className && (
                            <Badge tone="brand" size="sm">
                              {notice.className}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                          {notice.content}
                        </p>

                        <p className="mt-2.5 text-xs text-ink-subtle">
                          {notice.authorName ?? 'Administration'} · {formatRelative(notice.createdAt)}
                          {notice.expiresAt && ` · expires ${formatDate(notice.expiresAt)}`}
                        </p>
                      </div>

                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Pencil}
                            onClick={() => { setEditing(notice); setOpen(true); }}
                            aria-label="Edit notice"
                          />
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={Trash2}
                            onClick={() => setToDelete(notice)}
                            aria-label="Delete notice"
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          {data?.meta?.pagination?.totalPages > 1 && (
            <Pagination pagination={data.meta.pagination} onPageChange={setPage} />
          )}
        </>
      )}

      <NoticeFormModal
        isOpen={isOpen}
        notice={editing}
        classes={classes}
        isAdmin={role === 'admin'}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={() => {
          setOpen(false);
          setEditing(null);
          refetch();
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Remove this notice?"
        message={toDelete ? `"${toDelete.title}" will no longer be visible to anyone.` : ''}
        confirmLabel="Remove notice"
      />
    </>
  );
}

function NoticeFormModal({ isOpen, notice, classes, isAdmin, onClose, onSaved }) {
  const toast = useToast();
  const isEditing = Boolean(notice);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    values: notice
      ? {
          title: notice.title,
          content: notice.content,
          category: notice.category,
          priority: notice.priority,
          targetRole: notice.targetRole ?? '',
          classId: notice.classId ?? '',
          isPinned: notice.isPinned,
          expiresAt: notice.expiresAt ? notice.expiresAt.slice(0, 10) : '',
        }
      : { category: 'general', priority: 'normal', isPinned: false },
  });

  const submit = async (values) => {
    try {
      const payload = {
        ...values,
        targetRole: values.targetRole || null,
        classId: values.classId || null,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      };

      if (isEditing) {
        await noticeApi.update(notice.id, payload);
        toast.success('Notice updated');
      } else {
        const created = await noticeApi.create(payload);
        toast.success(
          created.notified
            ? `Notice published — ${created.notified} people notified`
            : 'Notice published'
        );
      }

      reset({ category: 'general', priority: 'normal', isPinned: false });
      onSaved();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit notice' : 'Publish a notice'}
      description="Everyone in the target audience is notified as soon as it is published."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            {isEditing ? 'Save changes' : 'Publish notice'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <Input
          label="Title"
          placeholder="End-semester examination timetable published"
          required
          error={errors.title?.message}
          {...register('title', {
            required: 'Give the notice a title',
            minLength: { value: 3, message: 'At least 3 characters' },
          })}
        />

        <Textarea
          label="Content"
          rows={6}
          placeholder="The full announcement…"
          required
          error={errors.content?.message}
          {...register('content', {
            required: 'Write the notice content',
            minLength: { value: 5, message: 'A little more detail, please' },
          })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" options={NOTICE_CATEGORIES} {...register('category')} />
          <Select label="Priority" options={PRIORITIES} {...register('priority')} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Audience"
            placeholder="Everyone"
            hint="Leave as everyone to reach all roles"
            options={[
              { value: 'student', label: 'Students only' },
              { value: 'parent', label: 'Parents only' },
              { value: 'teacher', label: 'Teachers only' },
              ...(isAdmin ? [{ value: 'admin', label: 'Administrators only' }] : []),
            ]}
            {...register('targetRole')}
          />

          <Select
            label="Class"
            placeholder="All classes"
            hint="Narrow the notice to a single class"
            options={(classes ?? []).map((classRow) => ({
              value: classRow.id,
              label: `${classRow.name} ${classRow.section}`,
            }))}
            {...register('classId')}
          />
        </div>

        <Input
          label="Expires on"
          type="date"
          hint="Optional — after this date the notice is hidden automatically"
          {...register('expiresAt')}
        />

        <Checkbox
          label="Pin to the top"
          description="Pinned notices appear above everything else"
          {...register('isPinned')}
        />
      </form>
    </Modal>
  );
}

export default NoticesManager;
