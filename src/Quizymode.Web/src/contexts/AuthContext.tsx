import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  fetchAuthSession,
  signIn,
  signOut,
  signUp,
  confirmSignUp,
} from "aws-amplify/auth";
import { setTokens, clearTokens } from "@/utils/tokenStorage";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  username: string | null;
  email: string | null;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, email: string) => Promise<void>;
  confirmSignup: (username: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  // Helper function to clear all auth state
  const clearAuthState = () => {
    setIsAuthenticated(false);
    setUserId(null);
    setUsername(null);
    setEmail(null);
    setIsAdmin(false);
    clearTokens();
  };

  const refreshAuth = async () => {
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
                return;
              }
              
              // Use refreshed token
              const refreshedIdToken = refreshedSession.tokens.idToken?.toString() || null;
              setTokens(refreshedToken.toString(), refreshedIdToken);
              
              setIsAuthenticated(true);
              setUserId(refreshedPayload.sub || null);
              setUsername(refreshedPayload["cognito:username"] || refreshedPayload.username || null);
              setEmail(refreshedPayload.email || null);
              
              // Extract groups and check admin status
              const extractGroups = (tokenPayload: any): string[] => {
                const groupsClaim = tokenPayload["cognito:groups"];
                if (Array.isArray(groupsClaim)) {
                  return groupsClaim;
                } else if (typeof groupsClaim === "string") {
                  return [groupsClaim];
                }
                return [];
              };
              
              let groups = extractGroups(refreshedPayload);
              let isUserAdmin = groups.some((g: string) =>
                g.toLowerCase().startsWith("admin")
              );
              
              if (refreshedSession.tokens.idToken) {
                const idTokenValue = refreshedSession.tokens.idToken;
                const idPayload = JSON.parse(
                  atob(idTokenValue.toString().split(".")[1])
                );
                
                if (!refreshedPayload.email && idPayload.email) {
                  setEmail(idPayload.email);
                }
                
                if (!isUserAdmin) {
                  const idGroups = extractGroups(idPayload);
                  isUserAdmin = idGroups.some((g: string) =>
                    g.toLowerCase().startsWith("admin")
                  );
                }
              }
              
              setIsAdmin(isUserAdmin);
              return;
            } else {
              // No tokens after refresh - clear auth state
              clearAuthState();
              return;
            }
          } catch (refreshError) {
            // Refresh failed - clear auth state
            console.warn("Token refresh failed:", refreshError);
            clearAuthState();
            return;
          }
        }

        setIsAuthenticated(true);
        setUserId(payload.sub || null);
        setUsername(payload["cognito:username"] || payload.username || null);
        setEmail(payload.email || null);

        // Helper function to extract groups from a token payload
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
        let groups = extractGroups(payload);
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
                  return;
                }
                
                // Use refreshed ID token
                const refreshedAccessToken = refreshedSession.tokens.accessToken?.toString() || token.toString();
                setTokens(refreshedAccessToken, refreshedIdToken);
                
                if (!payload.email && refreshedIdPayload.email) {
                  setEmail(refreshedIdPayload.email);
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
                return;
              }
            } catch (refreshError) {
              // Refresh failed - clear auth state
              console.warn("ID token refresh failed:", refreshError);
              clearAuthState();
              return;
            }
          } else {
            // Get email from idToken if not in accessToken
            if (!payload.email && idPayload.email) {
              setEmail(idPayload.email);
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
      } else {
        clearAuthState();
      }
    } catch (error) {
      console.error("Auth refresh error:", error);
      clearAuthState();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Wrap in try-catch to prevent errors from breaking the app
    refreshAuth().catch((error) => {
      console.error("Initial auth check failed:", error);
      setIsLoading(false);
    });
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const { isSignedIn } = await signIn({ username, password });
      if (isSignedIn) {
        await refreshAuth();
      }
    } catch (error) {
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
        },
      });
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  };

  const confirmSignup = async (username: string, code: string) => {
    try {
      await confirmSignUp({ username, confirmationCode: code });
    } catch (error) {
      console.error("Confirm signup error:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
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
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
