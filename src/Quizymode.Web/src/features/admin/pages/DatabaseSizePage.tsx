import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

const DatabaseSizePage = () => {
  const { isAuthenticated, isAdmin } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['databaseSize'],
    queryFn: () => adminApi.getDatabaseSize(),
    enabled: isAuthenticated && isAdmin,
    refetchInterval: 60000, // Refetch every minute
  });

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Failed to load database size" onRetry={() => refetch()} />;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getUsageColor = (percentage: number): string => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 75) return 'text-orange-600';
    return 'text-green-600';
  };

  const getProgressBarColor = (percentage: number): string => {
    if (percentage >= 90) return 'bg-red-600';
    if (percentage >= 75) return 'bg-orange-600';
    return 'bg-green-600';
  };

  if (!data) return null;

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Database Size</h1>
      
      <div className="bg-white shadow rounded-lg p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Current Usage</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Database Size:</span>
                <span className="font-medium">{formatBytes(data.sizeBytes)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Free Tier Limit:</span>
                <span className="font-medium">{data.freeTierLimitMegabytes} MB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Usage:</span>
                <span className={`font-medium ${getUsageColor(data.usagePercentage)}`}>
                  {data.usagePercentage.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Progress</span>
              <span className={`font-medium ${getUsageColor(data.usagePercentage)}`}>
                {data.sizeMegabytes.toFixed(2)} MB / {data.freeTierLimitMegabytes} MB
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className={`h-4 rounded-full ${getProgressBarColor(data.usagePercentage)} transition-all duration-300`}
                style={{ width: `${Math.min(data.usagePercentage, 100)}%` }}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Size in Bytes:</span>
                <span className="ml-2 font-mono">{data.sizeBytes.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-600">Size in MB:</span>
                <span className="ml-2 font-mono">{data.sizeMegabytes.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-600">Size in GB:</span>
                <span className="ml-2 font-mono">{data.sizeGigabytes.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-gray-600">Remaining:</span>
                <span className={`ml-2 font-mono ${getUsageColor(data.usagePercentage)}`}>
                  {(data.freeTierLimitMegabytes - data.sizeMegabytes).toFixed(2)} MB
                </span>
              </div>
            </div>
          </div>

          {data.usagePercentage >= 90 && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Warning: Database size is approaching the free tier limit
                  </h3>
                  <p className="mt-2 text-sm text-red-700">
                    You are using {data.usagePercentage.toFixed(2)}% of your 500MB free tier limit.
                    Consider cleaning up old data or upgrading your plan.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseSizePage;

