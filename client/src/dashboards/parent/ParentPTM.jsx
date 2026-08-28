import { useState } from 'react';
import {
  HeartHandshake,
  CalendarPlus,
  Video,
  MapPin,
  Phone,
  X,
  Clock,
  CalendarClock,
} from 'lucide-react';
import { ptmApi, parentApi } from '../../services/endpoints.js';
import { useApi } from '../../hooks/useApi.js';
import { useToast } from '../../context/ToastContext.jsx';
import { PageHeader } from '../../layouts/DashboardLayout.jsx';
import {
  Card,
  CardHeader,
  Tabs,
  Button,
  Modal,
  Select,
  Textarea,
  StatusBadge,
  Avatar,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Badge,
  ConfirmDialog,
} from '../../components/ui/index.js';
import { formatDate, formatTime } from '../../utils/format.js';
import { cn } from '../../utils/cn.js';

/** Parent–teacher meetings (§17): browse availability, book, reschedule, cancel. */
export function ParentPTM() {
  const toast = useToast();

  const [tab, setTab] = useState('book');
  const [bookingSlot, setBookingSlot] = useState(null);
  const [studentId, setStudentId] = useState('');
  const [agenda, setAgenda] = useState('');
  const [isBooking, setBooking] = useState(false);
  const [toCancel, setToCancel] = useState(null);
  const [rescheduling, setRescheduling] = useState(null); // booking

  const { data: children } = useApi(() => parentApi.children(), []);
  const { data: slots, isLoading: slotsLoading, error: slotsError, refetch: refetchSlots } = useApi(
    () => ptmApi.slots(),
    []
  );
  const { data: bookings, isLoading: bookingsLoading, refetch: refetchBookings } = useApi(
    () => ptmApi.bookings(),
    []
  );

  const openBooking = (slot) => {
    setBookingSlot(slot);
    setStudentId(children?.[0]?.id ?? '');
    setAgenda('');
  };

  const book = async () => {
    if (!studentId) {
      toast.error('Choose which child the meeting is about');
      return;
    }

    setBooking(true);
    try {
      await ptmApi.book({ slotId: bookingSlot.id, studentId, agenda: agenda || null });
      toast.success('Meeting requested — the teacher will confirm.');
      setBookingSlot(null);
      refetchSlots();
      refetchBookings();
      setTab('meetings');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBooking(false);
    }
  };

  const cancel = async () => {
    try {
      await ptmApi.updateBooking(toCancel.id, { status: 'cancelled' });
      toast.success('Meeting cancelled');
      setToCancel(null);
      refetchSlots();
      refetchBookings();
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Group open slots by teacher so a parent picks the person, then the time.
  const byTeacher = (slots ?? [])
    .filter((slot) => !slot.isBooked)
    .reduce((acc, slot) => {
      (acc[slot.teacherId] ??= { teacher: slot, slots: [] }).slots.push(slot);
      return acc;
    }, {});

  const upcoming = (bookings ?? []).filter(
    (booking) => !booking.isPast && booking.status !== 'cancelled'
  );
  const past = (bookings ?? []).filter((booking) => booking.isPast || booking.status === 'cancelled');

  const MODE_ICONS = { online: Video, in_person: MapPin, phone: Phone };

  return (
    <>
      <PageHeader
        title="Parent-teacher meetings"
        description="Book time with your child's teachers, and manage the meetings you've arranged."
      />

      <Tabs
        tabs={[
          { value: 'book', label: 'Book a meeting' },
          { value: 'meetings', label: 'My meetings', count: upcoming.length || undefined },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'book' && (
        <>
          {slotsError ? (
            <ErrorState error={slotsError} onRetry={refetchSlots} />
          ) : slotsLoading ? (
            <LoadingSkeleton count={3} height="h-40" />
          ) : Object.keys(byTeacher).length === 0 ? (
            <EmptyState
              icon={CalendarPlus}
              title="No slots available"
              message="Your child's teachers have not published availability yet. Check back closer to the meeting period."
            />
          ) : (
            <div className="space-y-5">
              {Object.values(byTeacher).map(({ teacher, slots: teacherSlots }) => (
                <Card key={teacher.teacherId}>
                  <div className="flex items-center gap-3">
                    <Avatar name={teacher.teacherName} src={teacher.teacherAvatar} size="md" />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink">
                        {teacher.teacherName}
                      </h3>
                      <p className="truncate text-xs text-ink-muted">
                        {teacher.designation}
                        {teacher.departmentName && ` · ${teacher.departmentName}`}
                      </p>
                    </div>
                    <Badge tone="neutral" size="sm" className="ml-auto">
                      {teacherSlots.length} slot{teacherSlots.length === 1 ? '' : 's'}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {teacherSlots.map((slot) => {
                      const ModeIcon = MODE_ICONS[slot.mode] ?? MapPin;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => openBooking(slot)}
                          className="rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                        >
                          <span className="block text-xs font-semibold text-ink">
                            {formatDate(slot.date, { day: 'numeric', month: 'short', weekday: 'short' })}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                            <Clock size={10} aria-hidden="true" />
                            {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                          </span>
                          <span className="mt-1 flex items-center gap-1 text-[10px] text-ink-subtle">
                            <ModeIcon size={9} aria-hidden="true" />
                            {slot.mode === 'in_person' ? slot.location ?? 'In person' : slot.mode}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'meetings' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Upcoming meetings" icon={HeartHandshake} />
            <div className="mt-4">
              {bookingsLoading ? (
                <LoadingSkeleton count={2} height="h-24" />
              ) : upcoming.length === 0 ? (
                <EmptyState
                  icon={HeartHandshake}
                  title="No meetings booked"
                  message="Book a slot with one of your child's teachers."
                  action={<Button onClick={() => setTab('book')}>Browse availability</Button>}
                  compact
                />
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((booking) => (
                    <MeetingRow
                      key={booking.id}
                      booking={booking}
                      onCancel={() => setToCancel(booking)}
                      onReschedule={() => setRescheduling(booking)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {past.length > 0 && (
            <Card>
              <CardHeader title="Past meetings" icon={Clock} />
              <ul className="mt-4 space-y-3">
                {past.map((booking) => (
                  <MeetingRow key={booking.id} booking={booking} isPast />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Modal
        isOpen={Boolean(bookingSlot)}
        onClose={() => setBookingSlot(null)}
        title="Request a meeting"
        description={
          bookingSlot
            ? `${bookingSlot.teacherName} · ${formatDate(bookingSlot.date)} at ${formatTime(bookingSlot.startTime)}`
            : ''
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setBookingSlot(null)}>
              Cancel
            </Button>
            <Button onClick={book} isLoading={isBooking}>
              Request meeting
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Which child is this about?"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            placeholder="Select a child"
            required
            options={(children ?? []).map((child) => ({
              value: child.id,
              label: `${child.name}${child.className ? ` — ${child.className}` : ''}`,
            }))}
          />

          <Textarea
            label="What would you like to discuss?"
            value={agenda}
            onChange={(event) => setAgenda(event.target.value)}
            rows={4}
            placeholder="Give the teacher a sense of what you'd like to cover…"
            hint="Optional, but it helps the teacher prepare."
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(toCancel)}
        onClose={() => setToCancel(null)}
        onConfirm={cancel}
        title="Cancel this meeting?"
        message="The slot will be released for other parents to book."
        confirmLabel="Cancel meeting"
      />

      <RescheduleModal
        booking={rescheduling}
        slots={slots}
        onClose={() => setRescheduling(null)}
        onDone={() => {
          refetchSlots();
          refetchBookings();
        }}
      />
    </>
  );
}

function MeetingRow({ booking, onCancel, onReschedule, isPast = false }) {
  const ModeIcon = { online: Video, in_person: MapPin, phone: Phone }[booking.mode] ?? MapPin;

  return (
    <li
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-xl border border-line p-4',
        isPast && 'opacity-65'
      )}
    >
      <Avatar name={booking.teacherName} src={booking.teacherAvatar} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">{booking.teacherName}</h3>
          <StatusBadge status={booking.status} size="sm" />
        </div>

        <p className="mt-1 text-xs text-ink-muted">
          About {booking.studentName} · {formatDate(booking.date)} ·{' '}
          {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
        </p>

        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-subtle">
          <ModeIcon size={11} aria-hidden="true" />
          {booking.mode === 'in_person' ? (booking.location ?? 'In person') : booking.mode}
        </p>

        {booking.agenda && (
          <p className="mt-2 rounded-lg bg-surface-sunken p-2.5 text-xs text-ink-muted">
            {booking.agenda}
          </p>
        )}

        {booking.teacherNote && (
          <p className="mt-2 rounded-lg bg-info-50 p-2.5 text-xs text-info-800 dark:bg-info-500/10 dark:text-info-100">
            <span className="font-semibold">Teacher note:</span> {booking.teacherNote}
          </p>
        )}
      </div>

      {!isPast && booking.status !== 'cancelled' && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {onReschedule && (
            <Button variant="secondary" size="xs" icon={CalendarClock} onClick={onReschedule}>
              Reschedule
            </Button>
          )}
          {onCancel && (
            <Button variant="ghost" size="xs" icon={X} onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Move a booking to a different open slot with the same teacher. */
function RescheduleModal({ booking, slots, onClose, onDone }) {
  const toast = useToast();
  const [slotId, setSlotId] = useState('');
  const [isSaving, setSaving] = useState(false);

  const openSlots = (slots ?? []).filter(
    (slot) => slot.teacherId === booking?.teacherId && !slot.isBooked
  );
  const ModeIcons = { online: Video, in_person: MapPin, phone: Phone };

  const submit = async () => {
    if (!slotId) {
      toast.error('Pick a new time first');
      return;
    }
    setSaving(true);
    try {
      await ptmApi.updateBooking(booking.id, { status: 'rescheduled', slotId });
      toast.success('Meeting rescheduled — the teacher will confirm the new time');
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
      description={booking ? `${booking.teacherName} · about ${booking.studentName}` : ''}
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
          title="No other open slots"
          message="This teacher has no other availability published right now — try again later."
          compact
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {openSlots.map((slot) => {
            const ModeIcon = ModeIcons[slot.mode] ?? MapPin;
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
                  {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                </span>
                <span className="mt-1 flex items-center gap-1 text-[10px] text-ink-subtle">
                  <ModeIcon size={9} aria-hidden="true" />
                  {slot.mode === 'in_person' ? (slot.location ?? 'In person') : slot.mode}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default ParentPTM;
