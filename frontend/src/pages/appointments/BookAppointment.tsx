import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCalendar, FiVideo } from 'react-icons/fi';
import { lawyerApi, appointmentApi } from '../../services/api';
import { Card, Button, Input, Textarea, Select, Avatar, Badge } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export default function BookAppointment() {
  const { lawyerId } = useParams<{ lawyerId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [lawyer, setLawyer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  // Form state
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<
    Array<{ time: string; status: 'available' | 'booked' | 'past' }>
  >([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const consultationType = 'online';
  const [description, setDescription] = useState('');
  const [caseCategory, setCaseCategory] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [pastSlotBlocked, setPastSlotBlocked] = useState(false);

  const formatPkTime12Hour = (time24: string) => {
    const [hourRaw, minuteRaw] = (time24 || '').split(':').map((v) => parseInt(v, 10));
    const hour = Number.isFinite(hourRaw) ? hourRaw : 0;
    const minute = Number.isFinite(minuteRaw) ? minuteRaw : 0;
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.toLocaleTimeString('en-PK', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Karachi',
    });
  };

  useEffect(() => {
    loadLawyer();
  }, [lawyerId]);

  useEffect(() => {
    if (!lawyer) return;
    const areas: string[] = lawyer.lawyerProfile?.practiceAreas ?? [];
    if (caseCategory && areas.length > 0 && !areas.includes(caseCategory)) {
      setCaseCategory('');
    }
  }, [lawyer]);

  useEffect(() => {
    if (selectedDate && lawyerId) {
      loadAvailability();
    }
  }, [selectedDate, lawyerId]);

  const loadLawyer = async () => {
    try {
      const response: any = await lawyerApi.getById(lawyerId!);
      setLawyer(response.data);
    } catch (error) {
      console.error('Failed to load lawyer:', error);
      toast.error('Failed to load lawyer details');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    setLoadingSlots(true);
    setAvailableSlots([]);
    setTimeSlots([]);
    setSelectedSlot('');
    try {
      console.log(`[BookAppointment] Loading availability for lawyer ${lawyerId} on ${selectedDate}`);
      const response: any = await lawyerApi.getAvailability(lawyerId!, selectedDate);
      console.log('[BookAppointment] Availability response:', response);
      const slots = response.timeSlots || [];
      setTimeSlots(slots);
      setAvailableSlots(
        slots.length
          ? slots.filter((s: { status: string }) => s.status === 'available').map((s: { time: string }) => s.time)
          : response.availableSlots || [],
      );
      setPastSlotBlocked(false);
      if (response.message) {
        console.log('[BookAppointment] Message:', response.message);
      }
    } catch (error) {
      console.error('[BookAppointment] Failed to load availability:', error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDate || !selectedSlot) {
      toast.error('Please select a date and time');
      return;
    }

    const nowPk = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    const [hh, mm] = selectedSlot.split(':').map((v) => Number(v || 0));
    const selectedPk = new Date(`${selectedDate}T00:00:00`);
    selectedPk.setHours(hh, mm, 0, 0);
    if (selectedPk.getTime() <= nowPk.getTime()) {
      setPastSlotBlocked(true);
      toast.error('This time has already passed. Please select a future slot.');
      return;
    }

    const lawyerAreas: string[] = lawyer?.lawyerProfile?.practiceAreas ?? [];
    if (lawyerAreas.length > 0) {
      if (!caseCategory || !lawyerAreas.includes(caseCategory)) {
        toast.error('Please select a practice area from this lawyer\'s profile');
        return;
      }
    }

    setBooking(true);
    try {
      await appointmentApi.create({
        lawyerId: lawyerId!,
        appointmentDate: selectedDate,
        startTime: selectedSlot,
        consultationType,
        description,
        caseCategory,
      });

      toast.success('Appointment booked successfully! Wait for the lawyer to confirm. You can pay after confirmation.');
      navigate('/client/appointments');
    } catch (error: any) {
      toast.error(error.message || 'Failed to book appointment');
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-lk-accent border-t-transparent" />
      </div>
    );
  }

  if (!lawyer) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-700">Lawyer not found</h2>
        <Button onClick={() => navigate('/client/find-lawyer')} className="mt-4">
          Find Lawyers
        </Button>
      </div>
    );
  }

  const profile = lawyer.lawyerProfile;
  const lawyerPracticeAreas: string[] = profile?.practiceAreas ?? [];
  const practiceAreaOptions = [
    { value: '', label: lawyerPracticeAreas.length ? 'Select practice area' : 'No areas on profile' },
    ...lawyerPracticeAreas.map((area: string) => ({ value: area, label: area })),
  ];
  const minDate = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Booking Form */}
        <div className="lg:col-span-2">
          <Card>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date Selection */}
              <Input
                label="Select Date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={minDate}
                required
                leftIcon={<FiCalendar />}
              />

              {/* Time Slots */}
              {selectedDate && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Available Time Slots
                  </label>
                  {loadingSlots ? (
                    <div className="flex items-center gap-2 text-slate-500">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-lk-accent border-t-transparent" />
                      <span>Loading available slots...</span>
                    </div>
                  ) : (timeSlots.length === 0 && availableSlots.length === 0) ? (
                    <p className="text-slate-500">No slots for this date. Please try another date.</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {(timeSlots.length
                        ? timeSlots
                        : availableSlots.map((time) => ({ time, status: 'available' as const }))
                      ).map((slot) => {
                        const disabled = slot.status !== 'available';
                        const title =
                          slot.status === 'past'
                            ? 'This time has passed'
                            : slot.status === 'booked'
                              ? 'Already booked'
                              : undefined;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            title={title}
                            disabled={disabled}
                            onClick={() => {
                              if (!disabled) setSelectedSlot(slot.time);
                            }}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                              disabled
                                ? 'cursor-not-allowed bg-slate-50 text-slate-400 line-through opacity-70'
                                : selectedSlot === slot.time
                                  ? 'bg-lk-accent text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {formatPkTime12Hour(slot.time)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {pastSlotBlocked && (
                    <p className="mt-2 text-xs text-red-600">
                      Selected slot is in the past for today. Please choose a later time.
                    </p>
                  )}
                </div>
              )}

              {/* Consultation Type (policy: online only) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Consultation Type
                </label>
                <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                  <FiVideo className="text-slate-600" />
                  <span>Online</span>
                </div>
              </div>

              {/* Practice area — only lawyer profile specializations */}
              <Select
                label="Practice area"
                value={caseCategory}
                onChange={(e) => setCaseCategory(e.target.value)}
                required={lawyerPracticeAreas.length > 0}
                disabled={lawyerPracticeAreas.length === 0}
                options={practiceAreaOptions}
                helperText={
                  lawyerPracticeAreas.length > 0
                    ? 'You can only choose from areas this lawyer listed on their profile.'
                    : 'This lawyer has not added practice areas yet. Contact them or try another lawyer.'
                }
              />

              {/* Description */}
              <Textarea
                label="Describe Your Case (Optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe your legal issue..."
                rows={4}
                helperText="This will help the lawyer prepare for your consultation"
              />

              <Button
                type="submit"
                className="w-full"
                size="lg"
                isLoading={booking}
                disabled={!selectedDate || !selectedSlot}
              >
                Book Appointment
              </Button>
            </form>
          </Card>
        </div>

        {/* Lawyer Summary */}
        <div>
          <Card className="sticky top-4">
            <div className="flex items-center gap-4 mb-4">
              <Avatar
                src={profile?.profilePictureUrl}
                name={profile?.fullName}
                size="lg"
              />
              <div>
                <h3 className="font-bold text-slate-800">{profile?.fullName}</h3>
                <p className="text-sm text-slate-500">{profile?.city}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {profile?.practiceAreas?.slice(0, 3).map((area: string) => (
                <Badge key={area} variant="secondary" size="sm">{area}</Badge>
              ))}
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Consultation Fee</span>
                <span className="font-bold text-slate-800">
                  PKR {(profile?.consultationFee || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Duration</span>
                <span className="font-medium text-slate-800">
                  {profile?.consultationDuration || 30} minutes
                </span>
              </div>
              {selectedDate && selectedSlot && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Date</span>
                    <span className="font-medium text-slate-800">
                      {new Date(selectedDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Time</span>
                    <span className="font-medium text-slate-800">{formatPkTime12Hour(selectedSlot)}</span>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
