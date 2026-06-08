import React, { useEffect, useState } from 'react';
import { FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { adminApi } from '../../services/api';
import { Card, Button, Input, Modal, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';

export default function AdminCategories() {
  const toast = useToast();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', description: '', icon: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response: any = await adminApi.getCategories();
      setCategories(response.data || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedCategories = async () => {
    try {
      await adminApi.seedCategories();
      toast.success('Default categories added');
      loadCategories();
    } catch (error: any) {
      toast.error(error.message || 'Failed to seed categories');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    setSaving(true);
    try {
      if (editingCategory) {
        await adminApi.updateCategory(editingCategory._id, formData);
        toast.success('Category updated');
      } else {
        await adminApi.createCategory(formData);
        toast.success('Category created');
      }
      setShowModal(false);
      setFormData({ name: '', description: '', icon: '' });
      setEditingCategory(null);
      loadCategories();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '',
    });
    setShowModal(true);
  };

  const handleDeleteClick = (category: any) => {
    setCategoryToDelete(category);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;
    try {
      await adminApi.deleteCategory(categoryToDelete._id);
      toast.success('Category deleted');
      setDeleteModalOpen(false);
      setCategoryToDelete(null);
      loadCategories();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete category');
    }
  };

  const handleToggleActive = async (category: any) => {
    try {
      await adminApi.updateCategory(category._id, { isActive: !category.isActive });
      toast.success(`Category ${!category.isActive ? 'activated' : 'deactivated'}`);
      loadCategories();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update category');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Category Management</h1>
        <div className="flex gap-2">
          {categories.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeedCategories}>
              Seed Default
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setEditingCategory(null);
              setFormData({ name: '', description: '', icon: '' });
              setShowModal(true);
            }}
            leftIcon={<FiPlus />}
          >
            Add Category
          </Button>
        </div>
      </div>

      {/* Category boxes grid */}
      {loading ? (
        <Card className="py-10 text-center text-slate-500 text-base">Loading...</Card>
      ) : categories.length === 0 ? (
        <Card className="py-10 text-center text-slate-500 text-base">
          No categories. Click &quot;Seed Default&quot; to add some.
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {categories.map((category) => (
            <Card key={category._id} className="p-3 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-800 text-sm truncate" title={category.name}>
                  {category.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2" title={category.description || ''}>
                  {category.description || 'No description'}
                </p>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium ${(category.lawyerCount ?? 0) > 0 ? 'text-lk-navy' : 'text-slate-500'}`}>
                    {(category.lawyerCount ?? 0) === 1 ? '1 lawyer' : `${category.lawyerCount ?? 0} lawyers`}
                  </span>
                  <button
                    onClick={() => handleToggleActive(category)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      category.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {category.isActive ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => handleEdit(category)}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    title="Edit"
                  >
                    <FiEdit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(category)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-500 transition-colors"
                    title="Delete"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setCategoryToDelete(null); }}
        title="Delete Category"
      >
        <div className="p-5 space-y-4">
          <p className="text-slate-600">
            Are you sure you want to delete <strong>{categoryToDelete?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setDeleteModalOpen(false); setCategoryToDelete(null); }}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCategory(null);
          setFormData({ name: '', description: '', icon: '' });
        }}
        title={editingCategory ? 'Edit Category' : 'Add Category'}
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <Input
            label="Category Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Family Law"
            required
          />
          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this category..."
            rows={3}
          />
          <Input
            label="Icon (optional)"
            value={formData.icon}
            onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
            placeholder="Icon name or URL"
          />
          <div className="flex gap-3 pt-4">
            <Button type="submit" isLoading={saving} className="flex-1">
              {editingCategory ? 'Update' : 'Create'} Category
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowModal(false);
                setEditingCategory(null);
                setFormData({ name: '', description: '', icon: '' });
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
