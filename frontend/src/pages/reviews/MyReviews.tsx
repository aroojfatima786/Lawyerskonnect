import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FiStar, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { useAuth, useRole } from '../../context/AuthContext';
import { reviewApi, appointmentApi } from '../../services/api';
import { Button, Card, Modal, Textarea } from '../../components/ui';
import { PortalChrome } from '../../components/ui/PortalChrome';
import { ReviewPortalCard, reviewLabelFromAppointment } from '../../components/reviews/ReviewPortalCard';
import { useToast } from '../../components/ui/Toast';

const REVIEW_EDIT_WINDOW_MS = 2 * 60 * 1000;

function canEditReview(review: Review) {
  return Date.now() - new Date(review.createdAt).getTime() <= REVIEW_EDIT_WINDOW_MS;
}

function editTimeLeftLabel(review: Review) {
  const left = REVIEW_EDIT_WINDOW_MS - (Date.now() - new Date(review.createdAt).getTime());
  if (left <= 0) return '';
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, '0')} left to edit`;
}

interface Review {
  _id: string;
  rating: number;
  comment: string;
  createdAt: string;
  citizen?: {
    _id: string;
    citizenProfile?: {
      fullName?: string;
    };
    email: string;
  };
  lawyer?: {
    _id: string;
    lawyerProfile?: {
      fullName?: string;
    };
    email: string;
  };
  appointment?: {
    _id: string;
    scheduledAt: string;
  };
  citizenId?: any;
  lawyerId?: any;
}

export default function MyReviews() {
  const { user, isLoading: authLoading } = useAuth();
  const { isLawyer, isCitizen } = useRole();
  const toast = useToast();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);
  const [awaitingReview, setAwaitingReview] = useState<any[]>([]);
  const lastErrorToastRef = useRef<string>('');

  useEffect(() => {
    if (authLoading || !user?._id) return;
    fetchReviews();
  }, [authLoading, user?._id, isLawyer]);

  useEffect(() => {
    if (authLoading || !isCitizen || !user?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await appointmentApi.getCitizenAppointments({ limit: 30, status: 'completed' });
        const raw = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setAwaitingReview(raw.filter((a: any) => !a.hasReview));
      } catch {
        if (!cancelled) setAwaitingReview([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isCitizen, user?._id]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response: any = isLawyer
        ? await reviewApi.getMyLawyerReviews()
        : await reviewApi.getMyReviews();
      const rawList = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];
      const normalized = rawList.map((r: any) => ({
        ...r,
        citizen: r.citizen || r.citizenId,
        lawyer: r.lawyer || r.lawyerId,
      }));
      setReviews(normalized);
      lastErrorToastRef.current = '';
    } catch (error: any) {
      const message = error.message || 'Failed to fetch reviews';
      if (lastErrorToastRef.current !== message) {
        toast.error(message);
        lastErrorToastRef.current = message;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (review: Review) => {
    if (!canEditReview(review)) {
      toast.error('Edit window expired. Reviews can only be edited within 2 minutes.');
      return;
    }
    setEditingReview(review);
    setEditRating(review.rating);
    setEditComment(review.comment);
  };

  const handleUpdateReview = async () => {
    if (!editingReview) return;

    try {
      await reviewApi.update(editingReview._id, {
        rating: editRating,
        comment: editComment,
      });
      toast.success('Review updated successfully');
      setEditingReview(null);
      fetchReviews();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update review');
    }
  };

  const handleDeleteClick = (reviewId: string) => {
    setReviewToDelete(reviewId);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!reviewToDelete) return;

    try {
      await reviewApi.delete(reviewToDelete);
      toast.success('Review deleted successfully');
      setDeleteModalOpen(false);
      setReviewToDelete(null);
      fetchReviews();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete review');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate stats
  const averageRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';

  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    percentage: reviews.length > 0 ? Math.round((reviews.filter((r) => r.rating === star).length / reviews.length) * 100) : 0,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 overflow-x-hidden">
      {/* Stats + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex w-fit items-center rounded-full border border-slate-200/90 bg-gradient-to-r from-blue-50 to-slate-50 px-3.5 py-1.5 text-xs font-semibold text-lk-navy shadow-sm ring-1 ring-slate-100/80">
            {reviews.length} total
          </span>
      </div>

      {isCitizen && awaitingReview.length > 0 && (
        <Card className="lk-portal-card overflow-hidden rounded-2xl border-slate-200/90 shadow-lk-card-md ring-1 ring-slate-100/80">
          <PortalChrome label="Pending reviews">
            <p className="mb-3 text-sm text-lk-muted">
              Share brief feedback after completed consultations — it helps others choose counsel.
            </p>
            <ul className="space-y-2">
              {awaitingReview.slice(0, 4).map((a) => {
                const lp = (a.lawyerId as any)?.lawyerProfile;
                return (
                  <li
                    key={a._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm"
                  >
                    <div>
                      <span className="font-semibold text-lk-navy">{lp?.fullName || 'Lawyer'}</span>
                      {a.caseCategory ? (
                        <p className="text-[11px] text-lk-muted">{a.caseCategory}</p>
                      ) : null}
                    </div>
                    <Link to="/client/appointments">
                      <Button size="sm" variant="secondary">
                        Leave review
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </PortalChrome>
        </Card>
      )}

      {/* Compact Summary Panel */}
      <Card className="lk-portal-card overflow-hidden rounded-2xl border-slate-200/90 shadow-lk-card-lg ring-1 ring-slate-100/80">
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3 sm:gap-4 sm:p-6">
          <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-lk-muted">Reviews given</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-lk-navy">{reviews.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-lk-muted">Average rating given</p>
            <div className="mt-1 flex items-center gap-1.5">
              <p className="text-2xl font-bold tabular-nums text-lk-navy">{averageRating}</p>
              <FiStar className="text-lk-warning" aria-hidden />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 px-4 py-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-lk-muted">Pending reviews</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-lk-navy">{isCitizen ? awaitingReview.length : '—'}</p>
          </div>
        </div>
      </Card>

      {isLawyer && reviews.length > 0 && (
        <Card className="lk-portal-card border-lk-border shadow-lk-card-md">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-lk-muted">5-star share</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-lk-warning"
                style={{ width: `${ratingDistribution.find((r) => r.star === 5)?.percentage || 0}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs font-medium text-lk-muted">{ratingDistribution.find((r) => r.star === 5)?.count || 0}</span>
          </div>
        </Card>
      )}

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <Card className="lk-portal-card border-lk-border py-12 text-center shadow-lk-card-md">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-lk-border bg-[#F3F7FD]">
            <FiStar className="text-2xl text-lk-muted" />
          </div>
          <h3 className="text-lg font-semibold text-lk-navy">No reviews yet</h3>
          <p className="mt-1 text-sm text-lk-muted">
            {isLawyer ? 'You have not received any reviews from clients yet.' : 'You have not given any reviews yet.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const displayName = isLawyer
              ? (review as any).citizen?.citizenProfile?.fullName ||
                (review as any).citizen?.email?.split('@')[0] ||
                (review as any).citizenId?.citizenProfile?.fullName ||
                (review as any).citizenId?.email?.split('@')[0] ||
                'Client'
              : review.lawyer?.lawyerProfile?.fullName ||
                review.lawyer?.email?.split('@')[0] ||
                (review as any).lawyerId?.lawyerProfile?.fullName ||
                (review as any).lawyerId?.email?.split('@')[0] ||
                'Lawyer';
            const initial = displayName.charAt(0).toUpperCase();
            const apptId = review.appointment?._id || (review as any).appointmentId;
            const specialty = isLawyer ? 'Review from client' : 'Verified consultation';

            return (
              <ReviewPortalCard
                key={review._id}
                label={reviewLabelFromAppointment(apptId)}
                personName={displayName}
                personInitial={initial}
                specialty={specialty}
                rating={review.rating}
                comment={review.comment}
                dateLabel={formatDate(review.createdAt)}
                verifiedText={
                  apptId
                    ? `Verified · linked to ${reviewLabelFromAppointment(apptId)}`
                    : isLawyer
                      ? 'Verified client review'
                      : 'Your review on LawyersKonnect'
                }
                actions={
                  isCitizen ? (
                    <>
                      {canEditReview(review) ? (
                        <button
                          type="button"
                          onClick={() => handleEditClick(review)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-lk-accent"
                          title={editTimeLeftLabel(review) || 'Edit review'}
                        >
                          <FiEdit2 />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(review._id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 transition hover:bg-red-100"
                        title="Delete review"
                      >
                        <FiTrash2 />
                      </button>
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingReview}
        onClose={() => setEditingReview(null)}
        title="Edit review"
        subtitle={editingReview ? editTimeLeftLabel(editingReview) : undefined}
        size="sm"
      >
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-lk-navy">Rating</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setEditRating(star)}
                  className="text-2xl transition-colors"
                >
                  <FiStar
                    className={star <= editRating 
                      ? 'text-lk-warning fill-lk-warning' 
                      : 'text-slate-300'}
                  />
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="Comment"
            value={editComment}
            onChange={(e) => setEditComment(e.target.value)}
            rows={4}
            placeholder="Share your experience..."
          />

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditingReview(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateReview}>Save changes</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Review"
      >
        <div className="space-y-4">
          <p className="text-slate-600">
            Are you sure you want to delete this review? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
