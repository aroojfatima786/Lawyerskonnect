import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  FiMapPin, FiBriefcase, FiCalendar, FiMessageSquare,
  FiCheck, FiStar, FiArrowLeft, FiVideo, FiUser
} from 'react-icons/fi';
import { lawyerApi, reviewApi } from '../../services/api';
import { useAuth, useRole } from '../../context/AuthContext';
import { Navbar, Footer } from '../../components/layouts';
import { Button, Card, CardHeader, Rating, Avatar, Badge } from '../../components/ui';
import { VerificationStatus } from '../../types';

export default function LawyerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { isCitizen } = useRole();
  const isInDashboard = location.pathname.startsWith('/client/');
  const backToSearchPath = isInDashboard ? '/client/find-lawyer' : '/lawyers';
  
  const [lawyer, setLawyer] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [ratingDistribution, setRatingDistribution] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadLawyerProfile();
      loadReviews();
    }
  }, [id]);

  const loadLawyerProfile = async () => {
    try {
      const response: any = await lawyerApi.getById(id!);
      setLawyer(response.data);
    } catch (error) {
      console.error('Failed to load lawyer:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    try {
      const response: any = await reviewApi.getLawyerReviews(id!, 1, 5);
      setReviews(response.data || []);
      setRatingDistribution(response.ratingDistribution || {});
    } catch (error) {
      console.error('Failed to load reviews:', error);
    }
  };

  const handleBookAppointment = () => {
    if (!isAuthenticated) {
      navigate('/auth/citizen/login');
      return;
    }
    navigate(`/client/appointments/book/${id}`);
  };

  const handleMessage = () => {
    if (!isAuthenticated) {
      navigate('/auth/citizen/login');
      return;
    }
    navigate(`/client/messages?userId=${id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-lk-canvas">
        {!isInDashboard && <Navbar />}
        <div className="flex items-center justify-center h-64">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-lk-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!lawyer) {
    return (
      <div className="min-h-screen bg-lk-canvas">
        {!isInDashboard && <Navbar />}
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-lk-navy">Lawyer not found</h2>
          <Link to={backToSearchPath} className="mt-4 inline-block font-semibold text-lk-accent hover:underline">
            Back to search
          </Link>
        </div>
      </div>
    );
  }

  const profile = lawyer.lawyerProfile;

  return (
    <div className="min-h-screen bg-lk-canvas">
      {!isInDashboard && <Navbar />}

      <div className="mx-auto max-w-content px-4 py-8 lg:max-w-wide lg:px-8">
        <Link
          to={backToSearchPath}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-lk-muted hover:text-lk-navy"
        >
          <FiArrowLeft />
          <span>Back to search</span>
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="shadow-lk-card-md">
              <div className="flex flex-col gap-6 md:flex-row">
                <Avatar
                  src={profile?.profilePictureUrl}
                  name={profile?.fullName}
                  size="xl"
                  className="mx-auto md:mx-0"
                />
                <div className="flex-1 text-center md:text-left">
                  <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
                    <h1 className="text-2xl font-bold tracking-tight text-lk-navy sm:text-3xl">{profile?.fullName}</h1>
                    {profile?.verificationStatus === VerificationStatus.VERIFIED && (
                      <Badge variant="success">
                        <FiCheck className="mr-1" /> Verified
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm text-lk-muted md:justify-start">
                    <div className="flex items-center gap-1">
                      <FiMapPin />
                      <span>{profile?.city || 'Pakistan'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FiBriefcase />
                      <span>{profile?.yearsOfExperience || 0} years experience</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-2 md:justify-start">
                    <Rating
                      value={profile?.averageRating || 0}
                      showValue
                      reviewCount={profile?.totalReviews}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
                    {profile?.practiceAreas?.map((area: string) => (
                      <Badge key={area} variant="secondary">{area}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="shadow-lk-card-md">
              <CardHeader title="About" />
              <p className="whitespace-pre-line leading-relaxed text-lk-muted">
                {profile?.bio || 'No bio provided.'}
              </p>

              {profile?.education && (
                <div className="mt-4 border-t border-lk-border pt-4">
                  <h4 className="mb-2 font-semibold text-lk-navy">Education</h4>
                  <p className="text-lk-muted">{profile.education}</p>
                </div>
              )}

              {profile?.courtAssociations?.length > 0 && (
                <div className="mt-4 border-t border-lk-border pt-4">
                  <h4 className="mb-2 font-semibold text-lk-navy">Court associations</h4>
                  <div className="flex flex-wrap gap-2">
                    {profile.courtAssociations.map((court: string) => (
                      <Badge key={court}>{court}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {profile?.languages?.length > 0 && (
                <div className="mt-4 border-t border-lk-border pt-4">
                  <h4 className="mb-2 font-semibold text-lk-navy">Languages</h4>
                  <p className="text-lk-muted">{profile.languages.join(', ')}</p>
                </div>
              )}
            </Card>

            <Card className="shadow-lk-card-md">
              <CardHeader title="Reviews" subtitle={`${profile?.totalReviews || 0} total reviews`} />

              <div className="mb-6 flex flex-col gap-6 border-b border-lk-border pb-6 sm:flex-row sm:items-center">
                <div className="text-center sm:text-left">
                  <div className="text-4xl font-bold tabular-nums text-lk-navy">
                    {profile?.averageRating?.toFixed(1) || '0.0'}
                  </div>
                  <Rating value={profile?.averageRating || 0} size="sm" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => (
                    <div key={star} className="flex items-center gap-2">
                      <span className="w-3 text-sm text-lk-muted">{star}</span>
                      <FiStar className="text-amber-500" />
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-amber-500"
                          style={{
                            width: `${
                              ((ratingDistribution[star] || 0) / (profile?.totalReviews || 1)) * 100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-sm tabular-nums text-lk-muted">
                        {ratingDistribution[star] || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review List */}
              {reviews.length === 0 ? (
                <p className="py-8 text-center text-lk-muted">No reviews yet</p>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review._id} className="border-b border-lk-border pb-4 last:border-0">
                      <div className="mb-2 flex items-center gap-3">
                        <Avatar
                          name={(review.citizenId as any)?.citizenProfile?.fullName}
                          size="sm"
                        />
                        <div>
                          <div className="font-medium text-lk-navy">
                            {(review.citizenId as any)?.citizenProfile?.fullName || 'Anonymous'}
                          </div>
                          <div className="flex items-center gap-2">
                            <Rating value={review.rating} size="sm" />
                            <span className="text-sm text-lk-muted">
                              {new Date(review.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-sm leading-relaxed text-lk-muted">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            {profile?.verificationStatus === VerificationStatus.VERIFIED && (
              <Card className="border-emerald-100 bg-emerald-50/50 shadow-lk-card">
                <CardHeader title="Credentials & verification" />
                <p className="text-sm leading-relaxed text-emerald-950">
                  This profile completed LawyersKonnect verification. Always confirm scope of representation directly with your lawyer.
                </p>
              </Card>
            )}

            <Card className="sticky top-6 shadow-lk-card-lg lg:top-24">
              <div className="mb-4 text-center">
                <div className="text-3xl font-bold tabular-nums text-lk-navy">
                  PKR {(profile?.consultationFee || 0).toLocaleString()}
                </div>
                <p className="text-sm text-lk-muted">{profile?.consultationDuration || 30} min consultation</p>
              </div>

              <div className="mb-6 space-y-3">
                {profile?.acceptsOnlineConsultation && (
                  <div className="flex items-center gap-3 text-sm text-lk-muted">
                    <FiVideo className="text-lk-accent" />
                    <span>Online consultation available</span>
                  </div>
                )}
                {profile?.acceptsInPersonConsultation && (
                  <div className="flex items-center gap-3 text-sm text-lk-muted">
                    <FiUser className="text-lk-accent" />
                    <span>In-person consultation available</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Button onClick={handleBookAppointment} className="w-full" size="lg">
                  <FiCalendar className="mr-2" />
                  Book Appointment
                </Button>
                <Button onClick={handleMessage} variant="outline" className="w-full" size="lg">
                  <FiMessageSquare className="mr-2" />
                  Send Message
                </Button>
                {isAuthenticated && isCitizen && (
                  <p className="pt-1 text-center text-xs leading-relaxed text-lk-muted">
                    After your consultation, leave a review from{' '}
                    <Link to="/client/appointments" className="font-semibold text-lk-accent hover:underline">
                      My Appointments
                    </Link>{' '}
                    (Past tab).
                  </p>
                )}
              </div>
            </Card>

            {/* Bar Council Info */}
            {profile?.barCouncilNumber && (
              <Card className="shadow-lk-card">
                <CardHeader title="Bar council" />
                <p className="text-lk-muted">
                  Registration: <strong>{profile.barCouncilNumber}</strong>
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
      {!isInDashboard && <Footer />}
    </div>
  );
}
