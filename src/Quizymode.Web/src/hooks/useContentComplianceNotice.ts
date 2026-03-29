import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/api/users";
import { useAuth } from "@/contexts/AuthContext";

const SETTING_KEY_CONTENT_COMPLIANCE_NOTICE =
  "ContentComplianceNoticeDismissedV1";

export const useContentComplianceNotice = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ["userSettings"],
    queryFn: () => usersApi.getSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const dismissed =
    isAuthenticated &&
    settingsData?.settings[SETTING_KEY_CONTENT_COMPLIANCE_NOTICE] === "true";

  const dismissMutation = useMutation({
    mutationFn: async () =>
      usersApi.updateSetting({
        key: SETTING_KEY_CONTENT_COMPLIANCE_NOTICE,
        value: "true",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userSettings"] });
    },
  });

  return {
    shouldShow: isAuthenticated && !dismissed,
    dismiss: () => dismissMutation.mutate(),
    isDismissing: dismissMutation.isPending,
  };
};

