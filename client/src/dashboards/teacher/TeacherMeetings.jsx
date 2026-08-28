import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  HeartHandshake,
  CalendarPlus,
  Video,
  MapPin,
  Phone,
  Trash2,
  Check,
  X,
  CheckCircle2,
  Clock,
  CalendarClock,
} from 'lucide-react';
import { ptmApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  Tabs,
  Button,
  Modal,
  Input,
  Select,
  Textarea,
  DatePicker,
  StatusBadge,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  ConfirmDialog,
} from '../../components/ui/index.js';
import { formatDate, formatTime } from '../../utils/format.js';
import { cn } from '../../utils/cn.js';

const MODE_ICONS = { online: Video, in_person: MapPin, phone: Phone };

/**
 * Teacher side of parent-teacher meetings (§17) — the backend has always
 * supported this (publishing slots, confirming/cancelling/completing
 * bookings), it just never had a page. Mirrors the parent's booking view:
 * publish availability on one tab, respond to requests on the other.
 */
export function TeacherMeetings() {
  const toast = useToast();

  const [tab, setTab] = useState('requests');
  const [isPublishOpen, setPublishOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [responding, setResponding] = useState(null); // { booking, status }
  const [rescheduling, setRescheduling] = useState(null); // booking

  const {
    data: slots,
    isLoading: slotsLoading,
    error: slotsError,
    refetch: refetchSlots,
  } = useApi(() => ptmApi.slots(), []);
  const {
    data: bookings,
    isLoading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useApi(() => ptmApi.bookings(), []);

  const needsResponse = (bookings ?? []).filter((b) => b.status === 'requested');
  const upcoming = (bookings ?? []).filter(
    (b) => !b.isPast && ['confirmed', 'rescheduled'].includes(b.status)
  );
  const history = (bookings ?? []).filter(
    (b) => b.isPast || ['cancelled', 'completed'].includes(b.status)
  );

  const refetchAll = () => {
    refetchSlots();
    refetchBookings();
  };

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Publish times parents can book, and respond to their requests."
        action={
          <Button icon={CalendarPlus} onClick={() => setPublishOpen(true)}>
            Publish availability
          </Button>
        }
      />

      <Tabs
        tabs={[
          { value: 'requests', label: 'Requests', count: needsResponse.length || undefined },
          { value: 'availability', label: 'My availability' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'requests' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Needs your response" icon={HeartHandshake} />
            <div className="mt-4">
              {bookingsError ? (
                <ErrorState error={bookingsError} onRetry={refetchBookings} compact />
              ) : bookingsLoading ? (
                <LoadingSkeleton count={2} height="h-24" />
              ) : needsResponse.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="Nothing pending" message="You're all caught up." compact />
              ) : (
                <ul className="space-y-3">
                  {needsResponse.map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      actions={
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            size="xs"
                            icon={Check}
                            onClick={() => setResponding({ booking, status: 'confirmed' })}
                          >
                            Confirm
                          </Button>
                          <Button
                            size="xs"
                            variant="secondary"
                            icon={CalendarClock}
                            onClick={() => setRescheduling(booking)}
                          >
                            Reschedule
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            icon={X}
                            onClick={() => setResponding({ booking, status: 'cancelled' })}
                          >
                            Decline
                          </Button>
                        </div>
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Upcoming meetings" icon={Clock} />
            <div className="mt-4">
              {bookingsLoading ? (
                <LoadingSkeleton count={2} height="h-24" />
              ) : upcoming.length === 0 ? (
                <EmptyState icon={Clock} title="No confirmed meetings yet" compact />
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      actions={
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            size="xs"
                            variant="secondary"
                            icon={CheckCircle2}
                            onClick={() => setResponding({ booking, status: 'completed' })}
                          >
                            Mark completed
                          </Button>
                          <Button
                            size="xs"
                            variant="secondary"
                            icon={CalendarClock}
                            onClick={() => setRescheduling(booking)}
                          >
                            Reschedule
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            icon={X}
                            onClick={() => setResponding({ booking, status: 'cancelled' })}
                          >
                            Cancel
                          </Button>
                        </div>
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {history.length > 0 && (
            <Card>
              <CardHeader title="Past meetings" icon={Clock} />
              <ul className="mt-4 space-y-3">
                {history.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} isPast />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'availability' && (
        <Card>
          <CardHeader title="Published slots" icon={CalendarPlus} />
          <div className="mt-4">
            {slotsError ? (
              <ErrorState error={slotsError} onRetry={refetchSlots} compact />
            ) : slotsLoading ? (
              <LoadingSkeleton count={3} height="h-20" />
            ) : !slots?.length ? (
              <EmptyState
                icon={CalendarPlus}
                title="No availability published"
                message="Publish a slot so parents can book time with you."
                action={<Button onClick={() => setPublishOpen(true)}>Publish availability</Button>}
                compact
              />
            ) : (
              <ul className="space-y-2.5">
                {slots.map((slot) => {
                  const ModeIcon = MODE_ICONS[slot.mode] ?? MapPin;
                  const isBooked = Boolean(slot.booking_id) && slot.booking_status !== 'cancelled';

                  return (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">
                            {formatDate(slot.date, { day: 'numeric', month: 'short', weekday: 'short' })}
                          </span>
                          <span className="text-xs text-ink-muted">
                            {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-ink-subtle">
                            <ModeIcon size={11} aria-hidden="true" />
                            {slot.mode === 'in_person' ? slot.location ?? 'In person' : slot.mode}
                          </span>
                        </div>

                        {isBooked ? (
                          <p className="mt-1 text-xs text-ink-muted">
                            Booked by {slot.parent_name} — about {slot.student_name}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-success-600">Open</p>
                        )}
                      </div>

                      {isBooked ? (
                        <StatusBadge status={slot.booking_status} size="sm" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Trash2}
                          onClick={() => setToDelete(slot)}
                          aria-label="Remove slot"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      )}

      <PublishSlotModal
        isOpen={isPublishOpen}
        onClose={() => setPublishOpen(false)}
        onCreated={() => {
          setPublishOpen(false);
          refetchAll();
        }}
      />

      <RespondModal responding={responding} onClose={() => setResponding(null)} onDone={refetchAll} />

      <RescheduleModal
        booking={rescheduling}
        slots={slots}
        onClose={() => setRescheduling(null)}
        onDone={refetchAll}
      />

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            await ptmApi.removeSlot(toDelete.id);
            toast.success('Slot removed');
            setToDelete(null);
            refetchSlots();
          } catch (error) {
            toast.error(error.message);
          }
        }}
        title="Remove this slot?"
        message="Parents will no longer be able to book this time."
        confirmLabel="Remove slot"
      />
    </>
  );
}

function BookingRow({ booking, actions, isPast = false }) {
  const ModeIcon = MODE_ICONS[booking.mode] ?? MapPin;

  return (
    <li
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-xl border border-line p-4',
        isPast && 'opacity-65'
      )}
    >
      <Avatar name={booking.parentName} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{booking.parentName}</h3>
          <StatusBadge status={booking.status} size="sm" />
        </div>

        <p className="mt-1 text-xs text-ink-muted">
          About {booking.studentName} · {formatDate(booking.date)} · {formatTime(booking.startTime)} –{' '}
          {formatTime(booking.endTime)}
        </p>

        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-subtle">
          <ModeIcon size={11} aria-hidden="true" />
          {booking.mode === 'in_person' ? booking.location ?? 'In person' : booking.mode}
        </p>

        {booking.agenda && (
          <p className="mt-2 rounded-lg bg-surface-sunken p-2.5 text-xs text-ink-muted">{booking.agenda}</p>
        )}

        {booking.teacherNote && (
          <p className="mt-2 rounded-lg bg-info-50 p-2.5 text-xs text-info-800 dark:bg-info-500/10 dark:text-info-100">
            <span className="font-semibold">Your note:</span> {booking.teacherNote}
          </p>
        )}
      </div>

      {actions}
    </li>
  );
}

function PublishSlotModal({ isOpen, onClose, onCreated }) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { mode: 'in_person' } });

  const mode = watch('mode');

  const submit = async (values) => {
    try {
      await ptmApi.createSlot(values);
      toast.success('Availability published');
      reset({ mode: 'in_person' });
      onCreated();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Publish availability"
      description="Parents of students you teach will be able to book this slot."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(submit)} isLoading={isSubmitting}>
            Publish
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <DatePicker
          label="Date"
          required
          defaultValue={tomorrow.toISOString().slice(0, 10)}
          error={errors.date?.message}
          {...register('date', { required: 'Choose a date' })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Start time"
            type="time"
            required
            error={errors.startTime?.message}
            {...register('startTime', { required: 'Choose a start time' })}
          />
          <Input
            label="End time"
            type="time"
            required
            error={errors.endTime?.message}
            {...register('endTime', { required: 'Choose an end time' })}
          />
        </div>

        <Select
          label="Mode"
          options={[
            { value: 'in_person', label: 'In person' },
            { value: 'online', label: 'Online' },
            { value: 'phone', label: 'Phone' },
          ]}
          {...register('mode')}
        />

        {mode === 'in_person' && (
          <Input label="Location" placeholder="Staff room 2" {...register('location')} />
        )}
      </form>
    </Modal>
  );
}

/** One shared modal for confirm / decline / mark-completed — each just a status change with an optional note. */
function RespondModal({ responding, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [isSaving, setSaving] = useState(false);

  const labels = {
    confirmed: { title: 'Confirm this meeting?', action: 'Confirm meeting' },
    cancelled: { title: 'Decline / cancel this meeting?', action: 'Cancel meeting' },
    completed: { title: 'Mark this meeting as completed?', action: 'Mark completed' },
  };
  const copy = responding ? labels[responding.status] : null;

  const submit = async () => {
    setSaving(true);
    try {
      await ptmApi.updateBooking(responding.booking.id, {
        status: responding.status,
        teacherNote: note || null,
      });
      toast.success('Meeting updated');
      setNote('');
      onDone();
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(responding)}
      onClose={onClose}
      title={copy?.title ?? ''}
      description={
        responding
          ? `${responding.booking.parentName} · about ${responding.booking.studentName}`
          : ''
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button
            onClick={submit}
            isLoading={isSaving}
            variant={responding?.status === 'cancelled' ? 'danger' : 'primary'}
          >
            {copy?.action}
          </Button>
        </>
      }
    >
      <Textarea
        label="Note to the parent (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="Anything they should know…"
      />
    </Modal>
  );
}

/** Move a booking to one of the teacher's own open slots. */
function RescheduleModal({ booking, slots, onClose, onDone }) {
  const toast = useToast();
  const [slotId, setSlotId] = useState('');
  const [isSaving, setSaving] = useState(false);

  const openSlots = (slots ?? []).filter(
    (slot) => !slot.booking_id || slot.booking_status === 'cancelled'
  );

  const submit = async () => {
    if (!slotId) {
      toast.error('Pick a new time first');
      return;
    }
    setSaving(true);
    try {
      await ptmApi.updateBooking(booking.id, { status: 'rescheduled', slotId });
      toast.success('Meeting rescheduled — the parent has been notified');
      setSlotId('');
      onDone();
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(booking)}
      onClose={onClose}
      title="Reschedule this meeting"
      description={booking ? `${booking.parentName} · about ${booking.studentName}` : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Back
          </Button>
          <Button onClick={submit} isLoading={isSaving} disabled={!slotId}>
            Reschedule
          </Button>
        </>
      }
    >
      {openSlots.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No open slots"
          message="Publish another slot on the Availability tab first, then come back here."
          compact
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {openSlots.map((slot) => {
            const ModeIcon = MODE_ICONS[slot.mode] ?? MapPin;
            const isSelected = slotId === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => setSlotId(slot.id)}
                className={cn(
                  'rounded-xl border px-3.5 py-2.5 text-left transition',
                  isSelected
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40'
                    : 'border-line hover:border-brand-300 hover:bg-surface-sunken'
                )}
              >
                <span className="block text-xs font-semibold text-ink">
                  {formatDate(slot.date, { day: 'numeric', month: 'short', weekday: 'short' })}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                  <Clock size={10} aria-hidden="true" />
                  {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                </span>
                <span className="mt-1 flex items-center gap-1 text-[10px] text-ink-subtle">
                  <ModeIcon size={9} aria-hidden="true" />
                  {slot.mode === 'in_person' ? slot.location ?? 'In person' : slot.mode}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default TeacherMeetings;
