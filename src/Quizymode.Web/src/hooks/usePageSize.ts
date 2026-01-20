import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_PAGE_SIZE = 10;
const SETTING_KEY_PAGE_SIZE = "PageSize";

/**
 * Custom hook to get and update the user's page size setting.
 * Returns the current page size (defaults to 10 if not set),
 * and a function to update it.
 * Only works for authenticated users - returns default for anonymous users.
 */
export const usePageSize = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user settings only if authenticated
  const { data: settingsData } = useQuery({
    queryKey: ["userSettings"],
    queryFn: () => usersApi.getSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    retry: false,
  });

  // Extract page size from settings, default to 10
  const pageSize = isAuthenticated && settingsData?.settings[SETTING_KEY_PAGE_SIZE]
    ? parseInt(settingsData.settings[SETTING_KEY_PAGE_SIZE], 10)
    : DEFAULT_PAGE_SIZE;

  // Ensure page size is valid (between 1 and 1000)
  const validPageSize = Math.max(1, Math.min(1000, pageSize || DEFAULT_PAGE_SIZE));

  // Mutation to update page size setting
  const updatePageSizeMutation = useMutation({
    mutationFn: async (newPageSize: number) => {
      // Ensure valid range
      const validSize = Math.max(1, Math.min(1000, newPageSize));
      return usersApi.updateSetting({
        key: SETTING_KEY_PAGE_SIZE,
        value: validSize.toString(),
      });
    },
    onSuccess: () => {
      // Invalidate settings query to refetch
      queryClient.invalidateQueries({ queryKey: ["userSettings"] });
    },
  });

  const updatePageSize = (newPageSize: number) => {
    if (isAuthenticated) {
      updatePageSizeMutation.mutate(newPageSize);
    }
  };

  return {
    pageSize: validPageSize,
    updatePageSize,
    isUpdating: updatePageSizeMutation.isPending,
  };
};
