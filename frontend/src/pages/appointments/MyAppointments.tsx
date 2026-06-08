import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiCalendar, FiMessageSquare, FiX, FiCheck, FiStar } from 'react-icons/fi';
import { useRole } from '../../context/AuthContext';
import { appointmentApi, reviewApi } from '../../services/api';
import { computeConsultationFeeBreakdown } from '../../utils/consultationFee';
import { Card, Button, Modal, Input, Textarea, PremiumTabs } from '../../components/ui';
import { AppointmentCardShell } from '../../components/appointments/AppointmentCardShell';
import { useToast } from '../../components/ui/Toast';

type CitizenAppointmentFilter =
  | 'all'
  | 'pending'
  | 'confirmed'
  | 'payment_required'
  | 'upcoming'
  | 'completed'
  | 'cancelled';

function filterCitizenAppointments(list: any[], f: CitizenAppointmentFilter) {
  const st = (a: any) => String(a?.status || '').toLowerCase();
  switch (f) {
    case 'all':
      return list;
    case 'pending':
      return list.filter((a) => st(a) === 'pending');
    case 'confirmed':
      return list.filter((a) => st(a) === 'confirmed');
    case 'payment_required':
      return list.filter((a) => st(a) === 'confirmed' && !a.isPaid);
    case 'upcoming':
      return list.filter((a) => ['pending', 'confirmed'].includes(st(a)));
    case 'completed':
      return list.filter((a) => st(a) === 'completed');
    case 'cancelled':
      return list.filter((a) => st(a) === 'cancelled');
    default:
      return list;
  }
}

function consultationPaymentLabel(appointment: { fee?: number; isPaid?: boolean; status?: string }): string | undefined {
  const fee = Number(appointment.fee ?? 0);
  if (!fee) return undefined;
  if (!appointment.isPaid && String(appointment.status).toLowerCase() === 'confirmed') {
    return 'Paid consultation · payment pending';
  }
  return 'Paid consultation';
}

const CITIZEN_FILTER_TABS: { id: CitizenAppointmentFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'payment_required', label: 'Payment required' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

export default function MyAppointments() {
  const { isLawyer } = useRole();
  const location = useLocation();
  const toast = useToast();
  const base = location.pathname.startsWith('/client') ? '/client' : '/lawyer';

  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [citizenFilter, setCitizenFilter] = useState<CitizenAppointmentFilter>('all');
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmMeetingLink, setConfirmMeetingLink] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAppointment, setReviewAppointment] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const pendingPaymentCount = appointments.filter(
    (appointment) => !isLawyer && appointment.status === 'confirmed' && !appointment.isPaid,
  ).length;

  const loadLawyerAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (activeTab === 'upcoming') {
        params.status = 'pending,confirmed';
      } else {
        params.status = 'completed,cancelled';
      }
      const response: any = await appointmentApi.getLawyerAppointments(params);
      const raw = response?.data;
      setAppointments(Array.isArray(raw) ? raw : []);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const loadCitizenAll = useCallback(async () => {
    setLoading(true);
    try {
      const upRes: any = await appointmentApi.getCitizenAppointments({ limit: 100, status: 'pending,confirmed' });
      const pastRes: any = await appointmentApi.getCitizenAppointments({ limit: 100, status: 'completed,cancelled' });
      const up = Array.isArray(upRes?.data) ? upRes.data : [];
      const past = Array.isArray(pastRes?.data) ? pastRes.data : [];
      const byId = new Map<string, any>();
      [...up, ...past].forEach((a) => {
        const id = String(a?._id ?? a?.id ?? '');
        if (id) byId.set(id, a);
      });
      setAppointments(Array.from(byId.values()));
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLawyer) void loadLawyerAppointments();
  }, [isLawyer, loadLawyerAppointments]);

  useEffect(() => {
    if (!isLawyer) void loadCitizenAll();
  }, [isLawyer, loadCitizenAll]);

  const refreshAppointments = () => {
    if (isLawyer) void loadLawyerAppointments();
    else void loadCitizenAll();
  };

  const displayedAppointments = useMemo(() => {
    if (isLawyer) return appointments;
    return filterCitizenAppointments(appointments, citizenFilter);
  }, [isLawyer, appointments, citizenFilter]);

  const handleConfirm = async (id: string, meetingLink?: string) => {
    try {
      const link = meetingLink?.trim();
      await appointmentApi.confirm(id, link || undefined);
      toast.success(link ? 'Appointment confirmed with meeting link' : 'Appointment confirmed');
      refreshAppointments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to confirm');
    }
  };

  const openConfirmFlow = (appointment: any) => {
    void handleConfirm(appointment._id);
  };

  const submitConfirmModal = async () => {
    if (!selectedAppointment?._id) return;
    setConfirmSubmitting(true);
    try {
      await handleConfirm(selectedAppointment._id, confirmMeetingLink);
      setShowConfirmModal(false);
      setConfirmMeetingLink('');
      setSelectedAppointment(null);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedAppointment || !cancelReason) return;
    try {
      await appointmentApi.cancel(selectedAppointment._id, cancelReason);
      toast.success('Appointment cancelled');
      setShowCancelModal(false);
      setCancelReason('');
      setSelectedAppointment(null);
      refreshAppointments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel');
    }
  };

  const handleReschedule = async () => {
    if (!selectedAppointment || !rescheduleDate || !rescheduleTime || !rescheduleReason) return;
    try {
      await appointmentApi.reschedule(
        selectedAppointment._id,
        rescheduleDate,
        rescheduleTime,
        rescheduleReason
      );
      toast.success('Appointment rescheduled');
      setShowRescheduleModal(false);
      setRescheduleDate('');
      setRescheduleTime('');
      setRescheduleReason('');
      setSelectedAppointment(null);
      refreshAppointments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to reschedule');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await appointmentApi.complete(id);
      toast.success('Appointment marked as completed');
      refreshAppointments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete');
    }
  };

  const openReviewModal = (appointment: any) => {
    setReviewAppointment(appointment);
    setReviewRating(5);
    setReviewComment('');
    setShowReviewModal(true);
  };

  const handleSubmitReview = async () => {
    if (!reviewAppointment) return;
    const appointmentId =
      reviewAppointment && typeof reviewAppointment === 'object' && reviewAppointment._id
        ? reviewAppointment._id
        : reviewAppointment?.id;
    const lawyerId =
      reviewAppointment.lawyerId && typeof reviewAppointment.lawyerId === 'object' && reviewAppointment.lawyerId._id
        ? reviewAppointment.lawyerId._id
        : reviewAppointment.lawyerId;
    if (!appointmentId) {
      toast.error('Could not identify appointment for review');
      return;
    }
    if (!lawyerId) {
      toast.error('Could not identify lawyer');
      return;
    }
    setReviewSubmitting(true);
    try {
      await reviewApi.create({
        lawyerId: String(lawyerId),
        appointmentId: String(appointmentId),
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
      toast.success('Review submitted successfully');
      setShowReviewModal(false);
      setReviewAppointment(null);
      refreshAppointments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="lk-portal-page-head">
        {!isLawyer ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm text-lk-muted">
                Filter by status — track requests, payment, and consultation progress for each booking.
              </p>
              <PremiumTabs tabs={CITIZEN_FILTER_TABS} active={citizenFilter} onChange={setCitizenFilter} size="sm" />
          </div>
            <Link to="/client/find-lawyer" className="shrink-0">
              <Button className="shadow-md shadow-lk-accent/20">Find a lawyer</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-lk-muted">
              Manage client bookings — confirm requests, run consultations, and complete appointments.
            </p>
            <PremiumTabs
              tabs={[
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'past', label: 'Past' },
              ]}
              active={activeTab}
              onChange={setActiveTab}
              size="sm"
            />
          </div>
        )}
      </div>
      {!isLawyer && pendingPaymentCount > 0 && (
        <Card className="border border-amber-200/90 bg-gradient-to-r from-amber-50 to-white shadow-lk-card-md">
          <p className="text-sm font-medium leading-relaxed text-amber-950">
            Pay consultation fee to unlock chat at scheduled time.{' '}
            <span className="font-semibold">
              {pendingPaymentCount} appointment{pendingPaymentCount > 1 ? 's' : ''} need payment.
            </span>{' '}
            Use <span className="font-semibold">Pay consultation fee</span> on the booking below.
          </p>
        </Card>
      )}

      {/* Appointments List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="flex gap-4">
                <div className="h-14 w-14 rounded-full bg-slate-200" />
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 rounded w-1/3 mb-2" />
                  <div className="h-4 bg-slate-200 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : appointments.length === 0 ? (
        <Card className="border border-lk-border py-14 text-center shadow-lk-card-md">
          <FiCalendar className="mx-auto mb-4 text-5xl text-lk-border" />
          <h3 className="text-lg font-semibold text-lk-navy sm:text-xl">No appointments</h3>
          <p className="mx-auto mb-5 mt-2 max-w-md text-sm text-lk-muted">
            {isLawyer
              ? activeTab === 'upcoming'
                ? 'Upcoming client bookings will appear here.'
                : 'Completed and cancelled appointments appear in Past.'
              : 'Book verified counsel to see confirmations and payment steps here.'}
          </p>
          {!isLawyer && (
            <Link to="/client/find-lawyer">
              <Button>Find a lawyer</Button>
            </Link>
          )}
        </Card>
      ) : displayedAppointments.length === 0 ? (
        <Card className="border border-lk-border py-14 text-center shadow-lk-card-md">
          <FiCalendar className="mx-auto mb-4 text-5xl text-lk-border" />
          <h3 className="text-lg font-semibold text-lk-navy sm:text-xl">No results for this filter</h3>
          <p className="mx-auto mb-5 mt-2 max-w-md text-sm text-lk-muted">Try another status tab or view All.</p>
          <Button variant="outline" size="sm" onClick={() => setCitizenFilter('all')}>
            Show all
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayedAppointments.map((appointment, index) => {
            const otherPerson = isLawyer ? appointment.citizenId : appointment.lawyerId;
            const profile = isLawyer
              ? (otherPerson as any)?.citizenProfile
              : (otherPerson as any)?.lawyerProfile;

            const personName = profile?.fullName || (isLawyer ? 'Client' : 'Lawyer');
            const feeNote =
              typeof appointment.fee === 'number' && appointment.fee > 0 ? (
                <p className="text-sm text-lk-muted">
                  Consultation fee{' '}
                  <span className="font-semibold tabular-nums text-lk-navy">PKR {appointment.fee.toLocaleString()}</span>
                </p>
              ) : null;
            const metaNote = (
              <>
                {appointment.status === 'pending' ? (
                  <p className="text-xs leading-relaxed text-lk-muted">Awaiting lawyer confirmation before payment.</p>
                ) : null}
                {!isLawyer &&
                !appointment.isPaid &&
                appointment.status === 'confirmed' &&
                typeof appointment.fee === 'number' &&
                appointment.fee > 0 ? (
                  <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/50 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase text-amber-900">Escrow · payment required</p>
                    <p className="mt-0.5 text-xs text-amber-950">
                      Pay{' '}
                      <span className="font-semibold">
                        PKR {computeConsultationFeeBreakdown(appointment.fee).totalPayable.toLocaleString()}
                      </span>{' '}
                      (consultation + platform fee) to unlock consultation chat.
                    </p>
                  </div>
                ) : null}
                {isLawyer && appointment.status === 'confirmed' && !appointment.isPaid ? (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-950">
                    Awaiting client escrow payment before chat unlocks.
                  </div>
                ) : null}
              </>
            );

            return (
              <AppointmentCardShell
                key={String(appointment._id ?? appointment.id ?? index)}
                appointment={appointment}
                personName={personName}
                paymentLabel={!isLawyer ? consultationPaymentLabel(appointment) : undefined}
                statusLabel={isLawyer ? String(appointment.status) : undefined}
                profilePictureUrl={profile?.profilePictureUrl}
                feeNote={feeNote}
                metaNote={metaNote}
              >
                {!isLawyer ? (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">

                        {(() => {
                          const otherId = appointment.lawyerId;
                          const userId = otherId && typeof otherId === 'object' && '_id' in otherId ? (otherId as any)._id : otherId;
                          const idStr = userId != null ? String(userId) : '';
                          const gated = appointment.status === 'confirmed' && !appointment.isPaid;
                          return idStr ? (
                            gated ? (
                              <span
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-slate-50/80 px-3 text-lk-muted"
                                title="Payment required before consultation chat can start."
                              >
                                <FiMessageSquare className="h-4 w-4" />
                        </span>
                            ) : (
                              <Link
                                to={`${base}/messages?userId=${idStr}`}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#1a4570] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#174066]"
                                title="Open messages"
                              >
                                <FiMessageSquare className="h-4 w-4" /> Chat
                              </Link>
                            )
                          ) : null;
                        })()}
                        {['pending', 'confirmed'].includes(appointment.status) && (
                          <>
                            <Button
                              size="sm"
                              variant="warning"
                              onClick={() => {
                                setSelectedAppointment(appointment);
                                setShowRescheduleModal(true);
                              }}
                            >
                              Reschedule
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                setSelectedAppointment(appointment);
                                setShowCancelModal(true);
                              }}
                            >
                              <FiX className="mr-1" /> Cancel
                            </Button>
                          </>
                        )}
                        {!appointment.isPaid && appointment.status === 'confirmed' && (
                          <Link to={`/client/payments/checkout/${String(appointment._id ?? appointment.id ?? '')}`}>
                            <Button size="sm" variant="secondary">
                              Pay fee
                            </Button>
                          </Link>
                        )}
                        {appointment.status === 'completed' && !appointment.hasReview && (
                          <Button size="sm" variant="secondary" onClick={() => openReviewModal(appointment)}>
                            <FiStar className="mr-1" />
                            Review
                          </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {appointment.status === 'pending' && (
                        <Button size="sm" variant="secondary" onClick={() => openConfirmFlow(appointment)}>
                        <FiCheck className="mr-1" /> Confirm
                      </Button>
                    )}
                      {appointment.status === 'confirmed' && (
                        <Button size="sm" variant="secondary" onClick={() => handleComplete(appointment._id)}>
                        Complete
                      </Button>
                    )}
                    {['pending', 'confirmed'].includes(appointment.status) && (
                      <>
                        <Button
                          size="sm"
                            variant="warning"
                          onClick={() => {
                            setSelectedAppointment(appointment);
                            setShowRescheduleModal(true);
                          }}
                        >
                          Reschedule
                        </Button>
                        <Button
                          size="sm"
                            variant="danger"
                          onClick={() => {
                            setSelectedAppointment(appointment);
                            setShowCancelModal(true);
                          }}
                        >
                          <FiX className="mr-1" /> Cancel
                        </Button>
                      </>
                    )}
                    {(() => {
                        const otherId = appointment.citizenId;
                      const userId = otherId && typeof otherId === 'object' && '_id' in otherId ? (otherId as any)._id : otherId;
                      const idStr = userId != null ? String(userId) : '';
                      return idStr ? (
                        <Link to={`${base}/messages?userId=${idStr}`}>
                          <Button
                            size="sm"
                              variant="secondary"
                            disabled={appointment.status === 'confirmed' && !appointment.isPaid}
                            title={
                              appointment.status === 'confirmed' && !appointment.isPaid
                                ? 'Payment required before consultation chat can start.'
                                : 'Open chat'
                            }
                          >
                            <FiMessageSquare />
                          </Button>
                        </Link>
                      ) : null;
                    })()}
                  </div>
                )}
              </AppointmentCardShell>
            );
          })}
        </div>
      )}

      {/* Confirm appointment (optional meeting link for online) */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false);
          setConfirmMeetingLink('');
          setSelectedAppointment(null);
        }}
        title="Confirm appointment"
      >
        <div className="p-6">
          <p className="text-sm text-lk-muted">
            This is an online consultation. You may add a meeting link now or confirm without one and add it later.
          </p>
          <div className="mt-4">
            <Input
              label="Meeting link (optional)"
              type="url"
              placeholder="https://meet.google.com/..."
              value={confirmMeetingLink}
              onChange={(e) => setConfirmMeetingLink(e.target.value)}
            />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmModal(false);
                setConfirmMeetingLink('');
                setSelectedAppointment(null);
              }}
              disabled={confirmSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={() => void submitConfirmModal()} disabled={confirmSubmitting}>
              {confirmSubmitting ? 'Confirming…' : 'Confirm appointment'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setCancelReason('');
          setSelectedAppointment(null);
        }}
        title="Cancel Appointment"
      >
        <div className="p-6">
          <Textarea
            label="Reason for cancellation"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Please provide a reason..."
            rows={4}
            required
          />
          <div className="flex gap-3 mt-6">
            <Button
              variant="danger"
              onClick={handleCancel}
              disabled={!cancelReason}
              className="flex-1"
            >
              Cancel Appointment
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowCancelModal(false);
                setCancelReason('');
              }}
              className="flex-1"
            >
              Keep Appointment
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        isOpen={showRescheduleModal}
        onClose={() => {
          setShowRescheduleModal(false);
          setRescheduleDate('');
          setRescheduleTime('');
          setRescheduleReason('');
          setSelectedAppointment(null);
        }}
        title="Reschedule Appointment"
      >
        <div className="p-6 space-y-4">
          <Input
            label="New Date"
            type="date"
            value={rescheduleDate}
            onChange={(e) => setRescheduleDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            required
          />
          <Input
            label="New Time"
            type="time"
            value={rescheduleTime}
            onChange={(e) => setRescheduleTime(e.target.value)}
            required
          />
          <Textarea
            label="Reason for rescheduling"
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            placeholder="Please provide a reason..."
            rows={3}
            required
          />
          <div className="flex gap-3">
            <Button
              onClick={handleReschedule}
              disabled={!rescheduleDate || !rescheduleTime || !rescheduleReason}
              className="flex-1"
            >
              Reschedule
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowRescheduleModal(false);
                setRescheduleDate('');
                setRescheduleTime('');
                setRescheduleReason('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Leave Review Modal (citizen, completed appointment) */}
      <Modal
        isOpen={showReviewModal}
        onClose={() => {
          setShowReviewModal(false);
          setReviewAppointment(null);
        }}
        title="Leave a Review"
      >
        <div className="p-6 space-y-4">
          {reviewAppointment && (
            <>
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                Review is only available after your consultation is marked complete by the lawyer.
              </p>
              <p className="text-slate-600 text-sm">
                How was your consultation with{' '}
                <strong>
                  {(reviewAppointment.lawyerId as any)?.lawyerProfile?.fullName ||
                    (reviewAppointment.lawyerId as any)?.email ||
                    'this lawyer'}
                </strong>
                ?
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="text-2xl transition-colors p-1 rounded hover:bg-slate-100"
                    >
                      <FiStar
                        className={
                          star <= reviewRating ? 'fill-amber-500 text-amber-500' : 'text-slate-300'
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Comment (optional)
                </label>
                <Textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share your experience..."
                  rows={4}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSubmitReview}
                  disabled={reviewSubmitting}
                  className="flex-1"
                >
                  {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReviewModal(false);
                    setReviewAppointment(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
