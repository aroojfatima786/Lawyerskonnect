import { useEffect, useState } from 'react';
import { FiStar, FiTrash2, FiEyeOff, FiEye } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { reviewApi } from '../../services/api';
import { Card, Button, Select, Rating, Avatar, Modal } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export default function AdminReviews() {
  const toast = useToast();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ rating: '', isVisible: '' });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [reviewToDelete, setReviewToDelete] = useState<any>(null);

  useEffect(() => {
    loadReviews();
  }, [filters, pagination.page]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const response: any = await adminApi.getReviews({
        ...filters,
        page: pagination.page,
        limit: 20,
      });
      setReviews(response.data || []);
      setPagination(response.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (error) {
      console.error('Failed to load reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = async (reviewId: string) => {
    try {
      await reviewApi.toggleReviewVisibility(reviewId);
      toast.success('Review visibility updated');
      loadReviews();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update visibility');
    }
  };

  const handleDeleteClick = (review: any) => {
    setReviewToDelete(review);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!reviewToDelete) return;
    try {
      await adminApi.deleteReview(reviewToDelete._id);
      toast.success('Review deleted');
      setDeleteModalOpen(false);
      setReviewToDelete(null);
      loadReviews();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete review');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Review Management</h1>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <Select
            value={filters.rating}
            onChange={(e) => setFilters({ ...filters, rating: e.target.value })}
            options={[
              { value: '', label: 'All Ratings' },
              { value: '5', label: '5 Stars' },
              { value: '4', label: '4 Stars' },
              { value: '3', label: '3 Stars' },
              { value: '2', label: '2 Stars' },
              { value: '1', label: '1 Star' },
            ]}
          />
          <Select
            value={filters.isVisible}
            onChange={(e) => setFilters({ ...filters, isVisible: e.target.value })}
            options={[
              { value: '', label: 'All Visibility' },
              { value: 'true', label: 'Visible' },
              { value: 'false', label: 'Hidden' },
            ]}
          />
          <Button onClick={loadReviews}>Filter</Button>
        </div>
      </Card>

      {/* Reviews List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded-full bg-slate-200" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/4 mb-2" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card className="text-center py-12">
          <FiStar className="mx-auto text-5xl text-slate-300 mb-4" />
          <h3 className="text-xl font-semibold text-slate-700 mb-2">No reviews found</h3>
          <p className="text-slate-500">Reviews will appear here once submitted</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review._id}>
              <div className="flex flex-col md:flex-row gap-4">
                {/* Reviewer Info */}
                <div className="flex items-start gap-3 md:w-1/4">
                  <Avatar
                    name={(review.citizenId as any)?.citizenProfile?.fullName}
                    size="md"
                  />
                  <div>
                    <div className="font-medium text-slate-800">
                      {(review.citizenId as any)?.citizenProfile?.fullName || 'Anonymous'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Review Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-slate-500">Reviewed:</span>
                    <span className="font-medium">
                      {(review.lawyerId as any)?.lawyerProfile?.fullName || 'Lawyer'}
                    </span>
                  </div>
                  <Rating value={review.rating} size="sm" showValue />
                  {review.comment && (
                    <p className="text-slate-600 mt-2">{review.comment}</p>
                  )}
                  {!review.isVisible && (
                    <div className="mt-2 text-sm text-red-500">
                      Hidden: {review.adminNote || 'No reason provided'}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 md:flex-col">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleVisibility(review._id)}
                    title={review.isVisible ? 'Hide' : 'Show'}
                  >
                    {review.isVisible ? <FiEyeOff /> : <FiEye />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteClick(review)}
                    className="text-red-500"
                  >
                    <FiTrash2 />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setReviewToDelete(null); }}
        title="Delete Review"
      >
        <div className="p-5 space-y-4">
          <p className="text-slate-600">
            Are you sure you want to delete this review? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setDeleteModalOpen(false); setReviewToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setPagination({ ...pagination, page })}
              className={`h-10 w-10 rounded-lg font-medium ${
                page === pagination.page
                  ? 'bg-gradient-to-r from-lk-navy to-[#1e3a8f] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
