import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Edit, Trash2, Shield, CheckCircle, XCircle } from 'lucide-react';
import { createUser, deleteUser, getUsers, updateUser } from '../api/client';
import type { User } from '../api/types';

export function UserManagement() {
  const roleOptions: User['role'][] = ['admin', 'doctor', 'clinician', 'auditor'];
  const roleFilters = ['all', ...roleOptions];
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [users, setUsers] = useState<User[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    role: 'clinician' as User['role'],
    password: '',
  });
  const [editFormData, setEditFormData] = useState({
    username: '',
    email: '',
    role: 'clinician' as User['role'],
    isActive: true,
  });

  useEffect(() => {
    let isMounted = true;

    getUsers()
      .then((loadedUsers) => {
        if (isMounted) {
          setUsers(loadedUsers);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUsers([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && user.isActive) ||
      (filterStatus === 'inactive' && !user.isActive);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const roleCounts = useMemo(() => {
    return roleOptions.reduce<Record<string, number>>((acc, role) => {
      acc[role] = users.filter(u => u.role === role).length;
      return acc;
    }, {});
  }, [roleOptions, users]);

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    try {
      const createdUser = await createUser({
        username: formData.username.trim(),
        email: formData.email.trim(),
        role: formData.role,
        password: formData.password,
      });
      setUsers((current) => [createdUser, ...current]);
      setIsCreateOpen(false);
      setFormData({
        username: '',
        email: '',
        role: 'clinician',
        password: '',
      });
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to create user.');
      } else {
        setErrorMessage('Failed to create user.');
      }
    }
  };

  const handleEditClick = (user: User) => {
    setErrorMessage('');
    setEditingUserId(user.userId);
    setEditFormData({
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: Boolean(user.isActive),
    });
    setIsEditOpen(true);
  };

  const handleEditUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingUserId === null) {
      return;
    }
    setErrorMessage('');
    try {
      const updatedUser = await updateUser(editingUserId, {
        username: editFormData.username.trim(),
        email: editFormData.email.trim(),
        role: editFormData.role,
        isActive: editFormData.isActive,
      });
      setUsers((current) => current.map((user) => (user.userId === editingUserId ? updatedUser : user)));
      setIsEditOpen(false);
      setEditingUserId(null);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to update user.');
      } else {
        setErrorMessage('Failed to update user.');
      }
    }
  };

  const handleDeleteUser = async (user: User) => {
    setErrorMessage('');
    const shouldDelete = window.confirm(`Deactivate user "${user.username}"?`);
    if (!shouldDelete) {
      return;
    }
    try {
      await deleteUser(user.userId);
      setUsers((current) =>
        current.map((existingUser) =>
          existingUser.userId === user.userId ? { ...existingUser, isActive: false } : existingUser
        )
      );
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to deactivate user.');
      } else {
        setErrorMessage('Failed to deactivate user.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h1>User Management</h1>
            <p className="text-gray-600 mt-1">{filteredUsers.length} users</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setErrorMessage('');
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Add User</span>
        </button>
      </div>

      {isCreateOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Username</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData((current) => ({ ...current, username: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((current) => ({ ...current, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData((current) => ({ ...current, role: e.target.value as User['role'] }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="admin">Admin</option>
                <option value="doctor">Doctor</option>
                <option value="clinician">Clinician</option>
                <option value="auditor">Auditor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Password</label>
              <input
                type="password"
                minLength={6}
                value={formData.password}
                onChange={(e) => setFormData((current) => ({ ...current, password: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create User
              </button>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isEditOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <form onSubmit={handleEditUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Username</label>
              <input
                type="text"
                value={editFormData.username}
                onChange={(e) => setEditFormData((current) => ({ ...current, username: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData((current) => ({ ...current, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Role</label>
              <select
                value={editFormData.role}
                onChange={(e) => setEditFormData((current) => ({ ...current, role: e.target.value as User['role'] }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="admin">Admin</option>
                <option value="doctor">Doctor</option>
                <option value="clinician">Clinician</option>
                <option value="auditor">Auditor</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Status</label>
              <select
                value={editFormData.isActive ? 'active' : 'inactive'}
                onChange={(e) => setEditFormData((current) => ({ ...current, isActive: e.target.value === 'active' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditOpen(false);
                  setEditingUserId(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, username, or email..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {roleFilters.map(role => (
                <option key={role} value={role}>
                  {role === 'all' ? 'All Roles' : role.charAt(0).toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Role Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {roleOptions.map(role => (
          <div key={role} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-600 capitalize mb-1">{role}s</p>
            <p className="text-2xl">{roleCounts[role] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm">{user.fullName}</p>
                      <p className="text-xs text-gray-600">{user.username}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs capitalize ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'doctor' ? 'bg-blue-100 text-blue-700' :
                      user.role === 'clinician' ? 'bg-green-100 text-green-700' :
                      user.role === 'auditor' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.isActive ? (
                      <span className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle className="w-4 h-4" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-sm text-gray-500">
                        <XCircle className="w-4 h-4" />
                        <span>Inactive</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditClick(user)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No users found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>

      {/* Security Info */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="text-sm">
              Users with access to patient data must complete HIPAA training and sign compliance agreements.
              Multi-factor authentication (MFA) is required for all clinical and administrative users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
