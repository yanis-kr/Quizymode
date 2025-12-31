import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

// Audit action types matching the backend enum
const AUDIT_ACTIONS = [
  'UserCreated',
  'LoginSuccess',
  'LoginFailed',
  'CommentCreated',
  'CommentDeleted',
  'ItemCreated',
  'ItemUpdated',
  'ItemDeleted',
] as const;

type AuditAction = typeof AUDIT_ACTIONS[number];

const AuditLogsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [selectedActions, setSelectedActions] = useState<AuditAction[]>([]);
  const [filterMode, setFilterMode] = useState<"all" | "none" | "specific">("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Helper function to convert action value (number or string) to readable text
  const getActionText = (action: string | number): string => {
    // If it's already a string, return it
    if (typeof action === 'string') {
      return action;
    }
    
    // If it's a number, map it to the action name
    const actionMap: Record<number, string> = {
      0: 'UserCreated',
      1: 'LoginSuccess',
      2: 'LoginFailed',
      3: 'CommentCreated',
      4: 'CommentDeleted',
      5: 'ItemCreated',
      6: 'ItemUpdated',
      7: 'ItemDeleted',
    };
    
    return actionMap[action] || `Unknown (${action})`;
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['auditLogs', selectedActions, page],
    queryFn: () => adminApi.getAuditLogs(
      filterMode === "specific" && selectedActions.length > 0 ? selectedActions : undefined,
      page,
      pageSize
    ),
    enabled: isAuthenticated && isAdmin,
  });

  const handleFilterModeChange = (mode: "all" | "none" | "specific") => {
    setFilterMode(mode);
    if (mode === "all" || mode === "none") {
      setSelectedActions([]);
    }
    setPage(1);
  };

  const handleActionToggle = (action: AuditAction) => {
    setSelectedActions(prev =>
      prev.includes(action)
        ? prev.filter(a => a !== action)
        : [...prev, action]
    );
    setPage(1); // Reset to first page when filter changes
  };

  const clearFilters = () => {
    setFilterMode("all");
    setSelectedActions([]);
    setPage(1);
  };

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load audit logs" onRetry={() => refetch()} />;

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Audit Logs</h1>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Filters</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Event Types
            </label>
            <select
              value={filterMode}
              onChange={(e) => handleFilterModeChange(e.target.value as "all" | "none" | "specific")}
              className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Event Types</option>
              <option value="none">No Events (empty)</option>
              <option value="specific">Specific Types...</option>
            </select>
          </div>
          {filterMode === "specific" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Event Types (Select multiple)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {AUDIT_ACTIONS.map((action) => (
                  <label
                    key={action}
                    className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedActions.includes(action)}
                      onChange={() => handleActionToggle(action)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">{action}</span>
                  </label>
                ))}
              </div>
              {selectedActions.length > 0 && (
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-sm text-gray-600">
                    {selectedActions.length} type{selectedActions.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
              )}
            </div>
          )}
          {(filterMode !== "all" || selectedActions.length > 0) && (
            <div className="flex items-center space-x-2">
              <button
                onClick={clearFilters}
                className="text-sm text-indigo-600 hover:text-indigo-800 underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">
              Audit Logs
              {data && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({data.totalCount} total)
                </span>
              )}
            </h2>
          </div>
        </div>

        {data && data.logs.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date/Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entity ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(log.createdUtc)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.userEmail || <span className="text-gray-400">N/A</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                          {getActionText(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.ipAddress}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                        {log.entityId || <span className="text-gray-400">N/A</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing page {data.page} of {data.totalPages} ({data.totalCount} total entries)
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={data.page <= 1}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                    disabled={data.page >= data.totalPages}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No audit logs found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogsPage;

