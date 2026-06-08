import { useEffect, useState } from 'react';
import { FiSearch, FiCheck, FiX, FiTrash2, FiEye } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, Button, Input, Select, StatusBadge, Badge, Avatar, Modal } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ role: '', isActive: '', search: '' });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);

  useEffect(() => {
    loadUsers();
  }, [filters, pagination.page]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response: any = await adminApi.getUsers({
        ...filters,
        page: pagination.page,
        limit: 20,
      });
      setUsers(response.data || []);
      setPagination(response.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await adminApi.updateUserStatus(userId, !currentStatus);
      toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'}`);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const handleDeleteClick = (user: any) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    try {
      await adminApi.deleteUser(userToDelete._id);
      toast.success('User deleted');
      setDeleteModalOpen(false);
      setUserToDelete(null);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete user');
    }
  };

  const getProfile = (user: any) => {
    return user.role === 'lawyer' ? user.lawyerProfile : user.citizenProfile;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">User Management</h1>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by name or email..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              leftIcon={<FiSearch />}
            />
          </div>
          <Select
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            options={[
              { value: '', label: 'All Roles' },
              { value: 'citizen', label: 'Citizens' },
              { value: 'lawyer', label: 'Lawyers' },
              { value: 'admin', label: 'Admins' },
            ]}
          />
          <Select
            value={filters.isActive}
            onChange={(e) => setFilters({ ...filters, isActive: e.target.value })}
            options={[
              { value: '', label: 'All Status' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
          />
          <Button onClick={loadUsers}>Search</Button>
        </div>
      </Card>

      {/* Users Table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">User</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Email</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Role</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Status</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Joined</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">No users found</td>
                </tr>
              ) : (
                users.map((user) => {
                  const profile = getProfile(user);
                  return (
                    <tr key={user._id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={profile?.fullName} size="sm" />
                          <span className="font-medium text-slate-800">
                            {profile?.fullName || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">{user.email}</td>
                      <td className="py-3 px-4">
                        <Badge variant={user.role === 'admin' ? 'danger' : user.role === 'lawyer' ? 'info' : 'secondary'}>
                          {user.role}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={user.isActive ? 'success' : 'danger'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                            title="View"
                          >
                            <FiEye />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(user._id, user.isActive)}
                            className={`p-2 hover:bg-slate-100 rounded-lg ${
                              user.isActive ? 'text-red-500' : 'text-green-500'
                            }`}
                            title={user.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {user.isActive ? <FiX /> : <FiCheck />}
                          </button>
                          {user.role !== 'admin' && (
                            <button
                              onClick={() => handleDeleteClick(user)}
                              className="p-2 hover:bg-slate-100 rounded-lg text-red-500"
                              title="Delete"
                            >
                              <FiTrash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-slate-100">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setPagination({ ...pagination, page })}
                className={`h-8 w-8 rounded-lg text-sm font-medium ${
                  page === pagination.page
                    ? 'bg-gradient-to-r from-lk-navy to-[#1e3a8f] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setUserToDelete(null); }}
        title="Delete User"
      >
        <div className="p-5 space-y-4">
          <p className="text-slate-600">
            Are you sure you want to delete <strong>{userToDelete ? (getProfile(userToDelete)?.fullName || userToDelete.email) : ''}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setDeleteModalOpen(false); setUserToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* User Detail Modal */}
      <Modal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="User Details"
        size="lg"
      >
        {selectedUser && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={getProfile(selectedUser)?.fullName} size="xl" />
              <div>
                <h3 className="text-xl font-bold">{getProfile(selectedUser)?.fullName || 'N/A'}</h3>
                <p className="text-slate-500">{selectedUser.email}</p>
                <div className="flex gap-2 mt-2">
                  <Badge>{selectedUser.role}</Badge>
                  <Badge variant={selectedUser.isActive ? 'success' : 'danger'}>
                    {selectedUser.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <label className="text-sm text-slate-500">Phone</label>
                <p className="font-medium">{getProfile(selectedUser)?.phoneNumber || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm text-slate-500">City</label>
                <p className="font-medium">{getProfile(selectedUser)?.city || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm text-slate-500">CNIC</label>
                <p className="font-medium">{getProfile(selectedUser)?.cnic || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm text-slate-500">Joined</label>
                <p className="font-medium">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {selectedUser.role === 'lawyer' && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Lawyer Info</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Bar Council</label>
                    <p className="font-medium">{selectedUser.lawyerProfile?.barCouncilNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Experience</label>
                    <p className="font-medium">{selectedUser.lawyerProfile?.yearsOfExperience || 0} years</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Verification</label>
                    <StatusBadge status={selectedUser.lawyerProfile?.verificationStatus || 'pending'} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
