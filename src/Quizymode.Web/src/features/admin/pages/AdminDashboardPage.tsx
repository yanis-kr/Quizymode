import { useAuth } from '@/contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';

const AdminDashboardPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
      <p className="text-gray-600 text-sm mb-6">
        Administrative tools for managing the application. Access review board, database monitoring, and audit logs.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/admin/review-board"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-2">Review Board</h3>
          <p className="text-sm text-gray-500">Review items pending approval</p>
        </Link>
        <Link
          to="/admin/database-size"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-2">Database Size</h3>
          <p className="text-sm text-gray-500">Monitor database size and usage</p>
        </Link>
        <Link
          to="/admin/audit-logs"
          className="bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-lg font-medium text-gray-900 mb-2">Audit Logs</h3>
          <p className="text-sm text-gray-500">View system audit logs with filters</p>
        </Link>
      </div>
    </div>
  );
};

export default AdminDashboardPage;

