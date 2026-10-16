import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  fetchAuthSession,
  signIn,
  signOut,
  signUp,
  confirmSignUp,
  autoSignIn,
  resendSignUpCode,
} from "aws-amplify/auth";
import { usersApi } from "@/api/users";
import {
  clearPendingPolicyAcceptances,
  getPendingPolicyAcceptancesForEmail,
} from "@/features/legal/policyAcceptanceStorage";
import { hasToken, setTokens, clearTokens } from "@/utils/tokenStorage";
import { authApi } from "@/api/auth";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, email: string) => Promise<void>;
  /** Resolves true only when confirmation completed AND a real session was verified (auto-sign-in succeeded). */
  confirmSignup: (username: string, code: string) => Promise<boolean>;
  resendConfirmationCode: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Resolves true only when a verified authenticated session was established. */
  refreshAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const syncPendingPolicyAcceptances = useCallback(
    async (resolvedEmail: string | null) => {
      const pendingAcceptances = getPendingPolicyAcceptancesForEmail(
        resolvedEmail
      );

      if (pendingAcceptances.length === 0) {
        return;
      }

      try {
        await usersApi.recordPolicyAcceptances({
          acceptances: pendingAcceptances,
        });
        clearPendingPolicyAcceptances();
      } catch (error) {
        console.error("Failed to sync pending policy acceptances:", error);
      }
    },
    []
  );

  // Helper function to clear all auth state
  const clearAuthState = useCallback(() => {
    setIsAuthenticated(false);
    setUserId(null);
    setUsername(null);
    setEmail(null);
    setIsAdmin(false);
    clearTokens();
  }, []);

  /** Returns true only when a verified, unexpired authenticated session was established. */
  const refreshAuth = useCallback(async (): Promise<boolean> => {
    try {
      // Use forceRefresh to ensure we get fresh tokens if refresh token is available
      const session = await fetchAuthSession({ forceRefresh: false });
      if (session.tokens?.accessToken) {
        const token = session.tokens.accessToken;
        const payload = JSON.parse(atob(token.toString().split(".")[1]));

        // Validate token expiration before setting authenticated state
        const exp = payload.exp;
        const now = Math.floor(Date.now() / 1000);
        if (exp && exp < now) {
          // Token expired - try to refresh if possible
          try {
            const refreshedSession = await fetchAuthSession({ forceRefresh: true });
            if (refreshedSession.tokens?.accessToken) {
              // Use refreshed tokens
              const refreshedToken = refreshedSession.tokens.accessToken;
              const refreshedPayload = JSON.parse(atob(refreshedToken.toString().split(".")[1]));
              const refreshedExp = refreshedPayload.exp;
              
              if (refreshedExp && refreshedExp < now) {
                // Still expired after refresh - clear auth state
                console.warn("Token still expired after refresh, clearing auth state");
                clearAuthState();
                return false;
              }
              
              // Use refreshed token
              const refreshedIdToken = refreshedSession.tokens.idToken?.toString() || null;
              setTokens(refreshedToken.toString(), refreshedIdToken);
              
              setIsAuthenticated(true);
              setUserId(refreshedPayload.sub || null);
              setUsername(refreshedPayload["cognito:username"] || refreshedPayload.username || null);
              let resolvedEmail =
                refreshedPayload.email ||
                refreshedPayload["cognito:username"] ||
                refreshedPayload.username ||
                null;
              setEmail(resolvedEmail);
              
              // Extract groups and check admin status
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const extractGroups = (tokenPayload: any): string[] => {
                const groupsClaim = tokenPayload["cognito:groups"];
                if (Array.isArray(groupsClaim)) {
                  return groupsClaim;
                } else if (typeof groupsClaim === "string") {
                  return [groupsClaim];
                }
                return [];
              };

              const groups = extractGroups(refreshedPayload);
              let isUserAdmin = groups.some((g: string) =>
                g.toLowerCase().startsWith("admin")
              );
              
              if (refreshedSession.tokens.idToken) {
                const idTokenValue = refreshedSession.tokens.idToken;
                const idPayload = JSON.parse(
                  atob(idTokenValue.toString().split(".")[1])
                );
                
                if (!resolvedEmail && idPayload.email) {
                  resolvedEmail = idPayload.email;
                  setEmail(resolvedEmail);
                }
                
                if (!isUserAdmin) {
                  const idGroups = extractGroups(idPayload);
                  isUserAdmin = idGroups.some((g: string) =>
                    g.toLowerCase().startsWith("admin")
                  );
                }
              }
              
              setIsAdmin(isUserAdmin);
              await syncPendingPolicyAcceptances(resolvedEmail);
              return true;
            } else {
              // No tokens after refresh - clear auth state
              clearAuthState();
              return false;
            }
          } catch (refreshError) {
            // Refresh failed - clear auth state
            console.warn("Token refresh failed:", refreshError);
            clearAuthState();
            return false;
          }
        }

        setIsAuthenticated(true);
        setUserId(payload.sub || null);
        setUsername(payload["cognito:username"] || payload.username || null);
        let resolvedEmail =
          payload.email || payload["cognito:username"] || payload.username || null;
        setEmail(resolvedEmail);

        // Helper function to extract groups from a token payload
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extractGroups = (tokenPayload: any): string[] => {
          const groupsClaim = tokenPayload["cognito:groups"];
          if (Array.isArray(groupsClaim)) {
            return groupsClaim;
          } else if (typeof groupsClaim === "string") {
            return [groupsClaim];
          }
          return [];
        };

        // Check for admin group in access token
        const groups = extractGroups(payload);
        let isUserAdmin = groups.some((g: string) =>
          g.toLowerCase().startsWith("admin")
        );

        // Store tokens
        const idToken = session.tokens.idToken?.toString() || null;
        setTokens(token.toString(), idToken);

        if (session.tokens.idToken) {
          const idTokenValue = session.tokens.idToken;
          const idPayload = JSON.parse(
            atob(idTokenValue.toString().split(".")[1])
          );

          // Also validate ID token expiration
          const idExp = idPayload.exp;
          if (idExp && idExp < now) {
            // ID token expired - try to refresh
            try {
              const refreshedSession = await fetchAuthSession({ forceRefresh: true });
              if (refreshedSession.tokens?.idToken) {
                const refreshedIdToken = refreshedSession.tokens.idToken.toString();
                const refreshedIdPayload = JSON.parse(
                  atob(refreshedIdToken.split(".")[1])
                );
                const refreshedIdExp = refreshedIdPayload.exp;
                
                if (refreshedIdExp && refreshedIdExp < now) {
                  // Still expired - clear auth state
                  console.warn("ID token still expired after refresh, clearing auth state");
                  clearAuthState();
                  return false;
                }
                
                // Use refreshed ID token
                const refreshedAccessToken = refreshedSession.tokens.accessToken?.toString() || token.toString();
                setTokens(refreshedAccessToken, refreshedIdToken);
                
                if (!resolvedEmail && refreshedIdPayload.email) {
                  resolvedEmail = refreshedIdPayload.email;
                  setEmail(resolvedEmail);
                }
                
                if (!isUserAdmin) {
                  const idGroups = extractGroups(refreshedIdPayload);
                  isUserAdmin = idGroups.some((g: string) =>
                    g.toLowerCase().startsWith("admin")
                  );
                }
              } else {
                // No ID token after refresh - clear auth state
                clearAuthState();
                return false;
              }
            } catch (refreshError) {
              // Refresh failed - clear auth state
              console.warn("ID token refresh failed:", refreshError);
              clearAuthState();
              return false;
            }
          } else {
            // Get email from idToken if not in accessToken
            if (!resolvedEmail && idPayload.email) {
              resolvedEmail = idPayload.email;
              setEmail(resolvedEmail);
            }

            // Check for admin group in ID token if not found in access token
            if (!isUserAdmin) {
              const idGroups = extractGroups(idPayload);
              isUserAdmin = idGroups.some((g: string) =>
                g.toLowerCase().startsWith("admin")
              );
            }
          }
        }

        setIsAdmin(isUserAdmin);
        await syncPendingPolicyAcceptances(resolvedEmail);
        return true;
      } else {
        clearAuthState();
        return false;
      }
    } catch (error) {
      console.error("Auth refresh error:", error);
      clearAuthState();
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [clearAuthState, syncPendingPolicyAcceptances]);

  useEffect(() => {
    // Wrap in try-catch to prevent errors from breaking the app
    refreshAuth().catch((error) => {
      console.error("Initial auth check failed:", error);
      setIsLoading(false);
    });
  }, [refreshAuth]);

  useEffect(() => {
    const refreshAuthWhenVisible = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (!isAuthenticated && !hasToken()) {
        return;
      }

      refreshAuth().catch((error) => {
        console.error("Foreground auth refresh failed:", error);
      });
    };

    window.addEventListener("focus", refreshAuthWhenVisible);
    document.addEventListener("visibilitychange", refreshAuthWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshAuthWhenVisible);
      document.removeEventListener("visibilitychange", refreshAuthWhenVisible);
    };
  }, [isAuthenticated, refreshAuth]);

  /**
   * Resolves only when the provider reports completed sign-in AND the app has
   * verified an authenticated session via refreshAuth -- a resolved signIn
   * promise alone (e.g. isSignedIn: false pending another step) is not
   * sufficient evidence to navigate. "Already signed in" is detected via
   * Amplify's typed exception name, not by matching error message text.
   */
  const login = async (username: string, password: string) => {
    try {
      const { isSignedIn, nextStep } = await signIn({ username, password });
      if (!isSignedIn) {
        throw new Error(`Sign-in requires an additional step: ${nextStep.signInStep}`);
      }
      const established = await refreshAuth();
      if (!established) {
        throw new Error("Sign-in succeeded but the session could not be established.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "UserAlreadyAuthenticatedException") {
        const established = await refreshAuth();
        if (established) return;
        throw error;
      }
      console.error("Login error:", error);
      throw error;
    }
  };

  const signup = async (username: string, password: string, email: string) => {
    try {
      // Cognito requires username to be email format if configured that way
      // So we use email as the Cognito username and store the display username in the 'name' attribute
      await signUp({
        username: email, // Use email as Cognito username (required by Cognito configuration)
        password,
        options: {
          userAttributes: {
            email,
            name: username, // Store the display username in the 'name' attribute
          },
          autoSignIn: true,
        },
      });
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  };

  /**
   * Confirmation completion alone does not establish an authenticated
   * session. When the provider reports COMPLETE_AUTO_SIGN_IN, this calls
   * autoSignIn() and then verifies the real session via refreshAuth before
   * resolving -- callers must not infer success from confirmSignUp alone.
   */
  const confirmSignup = async (username: string, code: string): Promise<boolean> => {
    try {
      const { nextStep } = await confirmSignUp({ username, confirmationCode: code });
      if (nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
        await autoSignIn();
      }
      return await refreshAuth();
    } catch (error) {
      console.error("Confirm signup error:", error);
      throw error;
    }
  };

  const resendConfirmationCode = async (username: string): Promise<void> => {
    try {
      await resendSignUpCode({ username });
    } catch (error) {
      console.error("Resend confirmation code error:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logoutAudit();
      await signOut();
      clearAuthState();
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        userId,
        username,
        email,
        isAdmin,
        login,
        signup,
        confirmSignup,
        resendConfirmationCode,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
