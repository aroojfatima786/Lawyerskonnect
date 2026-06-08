import { useState, useEffect } from 'react';
import { FiClock, FiSave, FiCheck } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { lawyerApi } from '../../services/api';
import { Card, Button, lkNativeSelectClassName } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import { authStorage } from '../../utils/authStorage';

interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

// Generate time options from 00:00 to 23:30 in 30 min intervals
const generateTimeOptions = () => {
  const options = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      options.push(time);
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

export default function Availability() {
  const { user, updateUser } = useAuth();
  const toast = useToast();

  const [saving, setSaving] = useState(false);

  // Initialize all days with default values
  const getInitialAvailability = (): AvailabilitySlot[] => {
    if (user?.lawyerProfile?.availability && user.lawyerProfile.availability.length > 0) {
      // Make sure all days exist
      const existingDays = user.lawyerProfile.availability.map(s => s.day);
      const missingDays = DAYS_OF_WEEK.filter(d => !existingDays.includes(d));
      
      return [
        ...user.lawyerProfile.availability,
        ...missingDays.map(day => ({
          day,
          startTime: '09:00',
          endTime: '17:00',
          isAvailable: false,
        }))
      ].sort((a, b) => DAYS_OF_WEEK.indexOf(a.day) - DAYS_OF_WEEK.indexOf(b.day));
    }
    
    // Default: Mon-Fri on, Sat-Sun off
    return DAYS_OF_WEEK.map(day => ({
      day,
      startTime: '09:00',
      endTime: '17:00',
      isAvailable: !['Saturday', 'Sunday'].includes(day),
    }));
  };

  const [availability, setAvailability] = useState<AvailabilitySlot[]>(getInitialAvailability);

  // Re-initialize when user changes
  useEffect(() => {
    setAvailability(getInitialAvailability());
  }, [user?.lawyerProfile?.availability]);

  const handleToggleDay = (day: string) => {
    setAvailability(prev => 
      prev.map(slot => 
        slot.day === day 
          ? { ...slot, isAvailable: !slot.isAvailable }
          : slot
      )
    );
  };

  const handleTimeChange = (day: string, field: 'startTime' | 'endTime', value: string) => {
    setAvailability(prev => 
      prev.map(slot => 
        slot.day === day 
          ? { ...slot, [field]: value }
          : slot
      )
    );
  };

  const handleSave = async () => {
    // Validate time slots
    for (const slot of availability) {
      if (slot.isAvailable && slot.startTime >= slot.endTime) {
        toast.error(`Invalid time for ${slot.day}. End time must be after start time.`);
        return;
      }
    }

    console.log('[Availability] Saving availability:', availability);

    try {
      setSaving(true);
      const response = await lawyerApi.updateAvailability(availability);
      console.log('[Availability] Save response:', response);
      
      // Update local user state
      if (user) {
        const updatedUser = {
          ...user,
          lawyerProfile: {
            ...(user.lawyerProfile || {}),
            availability,
          },
        };
        updateUser(updatedUser);
        // Keep auth storage in sync with updated profile data
        authStorage.setUser(updatedUser as unknown as Record<string, unknown>);
      }
      
      toast.success('Availability saved!');
    } catch (error: any) {
      console.error('[Availability] Save error:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const calculateHours = (startTime: string, endTime: string): number => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return Math.max(0, (endMinutes - startMinutes) / 60);
  };

  const totalWeeklyHours = availability
    .filter(slot => slot.isAvailable)
    .reduce((total, slot) => total + calculateHours(slot.startTime, slot.endTime), 0);

  const availableDaysCount = availability.filter(s => s.isAvailable).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
        <Button 
          onClick={handleSave} 
          isLoading={saving}
          className="flex items-center gap-2"
        >
          <FiSave />
          Save Changes
        </Button>
      </div>

      {/* Quick Info */}
      <Card className="p-4 bg-blue-50 border-blue-100">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <FiClock className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-blue-900">How it works</h3>
            <p className="text-sm text-blue-700 mt-1">
              Toggle days ON/OFF and set your preferred time. Clients can only book during your available hours.
            </p>
          </div>
        </div>
      </Card>

      {/* Availability Grid */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-800">Weekly Schedule</h2>
        </div>
        
        <div className="divide-y divide-slate-100">
          {availability.map((slot) => (
            <div 
              key={slot.day} 
              className={`p-4 transition-colors ${slot.isAvailable ? 'bg-white' : 'bg-slate-50/50'}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Day Toggle */}
                <div className="flex items-center gap-3 sm:w-44">
                  <button
                    type="button"
                    onClick={() => handleToggleDay(slot.day)}
                    className={`h-7 w-12 rounded-full transition-all duration-200 relative flex-shrink-0 ${
                      slot.isAvailable 
                        ? 'bg-green-500 shadow-inner' 
                        : 'bg-slate-300'
                    }`}
                  >
                    <span 
                      className={`absolute top-1 h-5 w-5 bg-white rounded-full shadow-md transition-all duration-200 ${
                        slot.isAvailable ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                  <span className={`font-semibold text-sm ${slot.isAvailable ? 'text-slate-800' : 'text-slate-400'}`}>
                    {slot.day}
                  </span>
                </div>

                {/* Time Selectors */}
                {slot.isAvailable ? (
                  <div className="flex flex-wrap items-center gap-3 flex-1">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-500 min-w-[40px]">From:</label>
                      <select
                        value={slot.startTime}
                        onChange={(e) => handleTimeChange(slot.day, 'startTime', e.target.value)}
                        className={`${lkNativeSelectClassName} min-h-[40px] min-w-[120px] py-2 text-sm`}
                      >
                        {TIME_OPTIONS.map(time => (
                          <option key={time} value={time}>{formatTime(time)}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-500 min-w-[25px]">To:</label>
                      <select
                        value={slot.endTime}
                        onChange={(e) => handleTimeChange(slot.day, 'endTime', e.target.value)}
                        className={`${lkNativeSelectClassName} min-h-[40px] min-w-[120px] py-2 text-sm`}
                      >
                        {TIME_OPTIONS.map(time => (
                          <option key={time} value={time}>{formatTime(time)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="text-sm text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full">
                      {calculateHours(slot.startTime, slot.endTime)} hrs
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 text-sm text-slate-400 italic">
                    Not available - Click toggle to enable
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Available Days</p>
              <p className="text-2xl font-bold text-slate-800">{availableDaysCount}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center">
              <FiCheck className="text-green-600 text-xl" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Weekly Hours</p>
              <p className="text-2xl font-bold text-slate-800">{totalWeeklyHours}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <FiClock className="text-blue-600 text-xl" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Consultation Fee</p>
              <p className="text-2xl font-bold text-slate-800">
                PKR {(user?.lawyerProfile?.consultationFee || 0).toLocaleString()}
              </p>
            </div>
            <div className="h-12 w-12 bg-[#fde9c7] rounded-xl flex items-center justify-center">
              <span className="text-lk-accent text-xl font-bold">₨</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailability(prev => prev.map(slot => ({ ...slot, isAvailable: true })));
            }}
          >
            Enable All Days
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailability(prev => prev.map(slot => ({ ...slot, isAvailable: false })));
            }}
          >
            Disable All Days
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailability(prev => prev.map(slot => ({
                ...slot,
                isAvailable: !['Saturday', 'Sunday'].includes(slot.day)
              })));
            }}
          >
            Weekdays Only
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAvailability(prev => prev.map(slot => ({
                ...slot,
                startTime: '09:00',
                endTime: '17:00'
              })));
            }}
          >
            Set All to 9AM-5PM
          </Button>
        </div>
      </Card>
    </div>
  );
}
