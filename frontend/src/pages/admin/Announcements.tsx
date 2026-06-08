import React, { useState } from 'react';
import { FiSend } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, CardHeader, Button, Input, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export default function AdminAnnouncements() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  type TargetRole = 'citizen' | 'lawyer' | 'admin' | 'all';
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    targetRole: 'all' as TargetRole,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('Title and message are required');
      return;
    }

    setLoading(true);
    try {
      const data = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        ...(formData.targetRole && { targetRole: formData.targetRole }),
      };

      await adminApi.createAnnouncement(data);
      toast.success('Announcement sent successfully');

      // Reset form
      setFormData({ title: '', message: '', targetRole: 'all' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to send announcement');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">System Announcements</h1>
      </div>

      <Card>
        <CardHeader
          title="Send Announcement"
          subtitle="Broadcast system announcements to users. This will create in-app notifications and may trigger email/SMS if configured."
        />

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <Input
              type="text"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter announcement title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message *
            </label>
            <Textarea
              value={formData.message}
              onChange={(e) => handleInputChange('message', e.target.value)}
              placeholder="Enter announcement message"
              rows={4}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Audience (Optional)
            </label>
            <Select
              value={formData.targetRole}
              onChange={(e) => setFormData((prev) => ({ ...prev, targetRole: e.target.value as TargetRole }))}
              options={[
                { value: 'all', label: 'All Users' },
                { value: 'citizen', label: 'Citizens Only' },
                { value: 'lawyer', label: 'Lawyers Only' },
                { value: 'admin', label: 'Admins Only' },
              ]}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to send to all users
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2"
            >
              <FiSend className="w-4 h-4" />
              {loading ? 'Sending...' : 'Send Announcement'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}