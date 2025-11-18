import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchAuthSession, signIn, signOut, signUp, confirmSignUp, getCurrentUser } from 'aws-amplify/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
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
    throw new Error('useAuth must be used within AuthProvider');
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
  const [isAdmin, setIsAdmin] = useState(false);

  const refreshAuth = async () => {
    try {
      const session = await fetchAuthSession();
      if (session.tokens?.accessToken) {
        const token = session.tokens.accessToken;
        const payload = JSON.parse(atob(token.toString().split('.')[1]));
        
        setIsAuthenticated(true);
        setUserId(payload.sub || null);
        
        // Check for admin group in token
        const groups = payload['cognito:groups'] || [];
        setIsAdmin(groups.some((g: string) => g.toLowerCase().startsWith('admin')));
        
        // Store tokens
        localStorage.setItem('accessToken', token.toString());
        if (session.tokens.idToken) {
          localStorage.setItem('idToken', session.tokens.idToken.toString());
        }
      } else {
        setIsAuthenticated(false);
        setUserId(null);
        setIsAdmin(false);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('idToken');
      }
    } catch (error) {
      console.error('Auth refresh error:', error);
      setIsAuthenticated(false);
      setUserId(null);
      setIsAdmin(false);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Wrap in try-catch to prevent errors from breaking the app
    refreshAuth().catch((error) => {
      console.error('Initial auth check failed:', error);
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
      console.error('Login error:', error);
      throw error;
    }
  };

  const signup = async (username: string, password: string, email: string) => {
    try {
      await signUp({
        username,
        password,
        options: {
          userAttributes: {
            email,
          },
        },
      });
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const confirmSignup = async (username: string, code: string) => {
    try {
      await confirmSignUp({ username, confirmationCode: code });
    } catch (error) {
      console.error('Confirm signup error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut();
      setIsAuthenticated(false);
      setUserId(null);
      setIsAdmin(false);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('idToken');
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        userId,
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

