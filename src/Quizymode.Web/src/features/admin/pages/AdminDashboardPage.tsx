import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';

const AdminDashboardPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/admin/bulk-create"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-2">Bulk Create Items</h3>
          <p className="text-sm text-gray-500">Import multiple items at once</p>
        </Link>
        <Link
          to="/admin/review-board"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-2">Review Board</h3>
          <p className="text-sm text-gray-500">Review items pending approval</p>
        </Link>
        <Link
          to="/items"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-2">Manage Items</h3>
          <p className="text-sm text-gray-500">View and manage all items</p>
        </Link>
      </div>
    </div>
  );
};

export default AdminDashboardPage;

