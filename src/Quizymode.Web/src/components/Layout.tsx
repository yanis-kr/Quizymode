import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi } from "@/api/users";
import UserProfileModal from "./UserProfileModal";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, logout, username, email, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch user data when authenticated to get full profile info
  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => usersApi.getCurrent(),
    enabled: isAuthenticated, // Fetch when authenticated
    retry: false, // Don't retry on 401 errors
    // Silently handle 401 errors - they're expected if token is expired
    // The interceptor will handle redirects for protected routes
  });

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // Use user data from API if available, otherwise fall back to AuthContext values
  const displayName = user?.name || user?.email || username || email || "User";
  const userIsAdmin = user?.isAdmin ?? isAdmin;
  const role = userIsAdmin ? "Admin" : "User";

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link
                to="/"
                className="flex items-center px-2 py-4 text-xl font-bold text-indigo-600"
                onClick={closeMobileMenu}
              >
                Quizymode
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/categories"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-indigo-600"
                >
                  Categories
                </Link>
                {isAuthenticated && (
                  <>
                    <Link
                      to="/my-items"
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-indigo-600"
                    >
                      My Items
                    </Link>
                    <Link
                      to="/collections"
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-indigo-600"
                    >
                      Collections
                    </Link>
                    {userIsAdmin && (
                      <Link
                        to="/admin"
                        className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-indigo-600"
                      >
                        Admin
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center">
              {/* Mobile menu button */}
              <button
                type="button"
                className="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded="false"
              >
                <span className="sr-only">Open main menu</span>
                {mobileMenuOpen ? (
                  <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                ) : (
                  <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                )}
              </button>

              {/* Desktop menu */}
              <div className="hidden sm:flex sm:items-center">
                {isAuthenticated ? (
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => setShowProfileModal(true)}
                      className="text-right hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {displayName}
                      </div>
                      {user?.email && user.name && (
                        <div className="text-xs text-gray-500">
                          {user.email}
                        </div>
                      )}
                      <div className="text-xs text-gray-500">{role}</div>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="ml-4 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="ml-4 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Sign In
                    </Link>
                    <Link
                      to="/signup"
                      className="ml-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden">
            <div className="pt-2 pb-3 space-y-1">
              <Link
                to="/categories"
                className="block px-3 py-2 text-base font-medium text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
                onClick={closeMobileMenu}
              >
                Categories
              </Link>
              {isAuthenticated && (
                <>
                  <Link
                    to="/my-items"
                    className="block px-3 py-2 text-base font-medium text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
                    onClick={closeMobileMenu}
                  >
                    My Items
                  </Link>
                  <Link
                    to="/collections"
                    className="block px-3 py-2 text-base font-medium text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
                    onClick={closeMobileMenu}
                  >
                    Collections
                  </Link>
                  {userIsAdmin && (
                    <Link
                      to="/admin"
                      className="block px-3 py-2 text-base font-medium text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
                      onClick={closeMobileMenu}
                    >
                      Admin
                    </Link>
                  )}
                </>
              )}
            </div>
            <div className="pt-4 pb-3 border-t border-gray-200">
              {isAuthenticated ? (
                <>
                  <div className="px-4 mb-3">
                    <div className="text-base font-medium text-gray-900">
                      {displayName}
                    </div>
                    {user?.email && user.name && (
                      <div className="text-sm text-gray-500">{user.email}</div>
                    )}
                    <div className="text-sm text-gray-500">{role}</div>
                  </div>
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        setShowProfileModal(true);
                        closeMobileMenu();
                      }}
                      className="block w-full text-left px-4 py-2 text-base font-medium text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        handleLogout();
                        closeMobileMenu();
                      }}
                      className="block w-full text-left px-4 py-2 text-base font-medium text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <Link
                    to="/login"
                    className="block px-4 py-2 text-base font-medium text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
                    onClick={closeMobileMenu}
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="block px-4 py-2 text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 mx-3 rounded-md text-center"
                    onClick={closeMobileMenu}
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div>
  );
};

export default Layout;
