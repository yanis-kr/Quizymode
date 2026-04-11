import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usersApi } from "@/api/users";
import { getUserGuideUrl } from "@/utils/userGuideLink";
import FeedbackDialog from "@/features/feedback/components/FeedbackDialog";
import UserProfileModal from "./UserProfileModal";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { isAuthenticated, logout, username, email, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userGuideUrl = getUserGuideUrl(window.navigator.userAgent);

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
  const headerDisplayName = displayName.slice(0, 10);
  const userIsAdmin = user?.isAdmin ?? isAdmin;
  const role = userIsAdmin ? "Admin" : "User";

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const isHomePage = location.pathname === "/";
  /** Pages that render their own full-bleed dark container (no white wrapper from Layout). */
  const isFullBleedPage =
    isHomePage ||
    location.pathname === "/categories" ||
    location.pathname === "/collections" ||
    location.pathname === "/items/add" ||
    location.pathname === "/ideas";

  const isPathActive = (basePath: string) => {
    const path = location.pathname;
    if (path === basePath) return true;
    if (path.startsWith(`${basePath}/`)) return true;
    // Treat explore/quiz collection routes as part of Collections
    if (
      basePath === "/collections" &&
      (path.startsWith("/explore/collections/") || path.startsWith("/quiz/collections/"))
    ) {
      return true;
    }
    return false;
  };

  const desktopNavLinkClass = (active: boolean) =>
    `inline-flex items-center px-1 pt-1 text-sm font-medium ${
      active ? "text-indigo-600" : "text-gray-900 hover:text-indigo-600"
    }`;

  const mobileNavLinkClass = (active: boolean) =>
    `block px-3 py-2 text-base font-medium ${
      active ? "text-indigo-600 bg-gray-50" : "text-gray-900 hover:text-indigo-600 hover:bg-gray-50"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,#1e3a8a_0%,#0f172a_34%,#020617_100%)]">
      <nav className="border-b border-slate-200/70 bg-white/95 shadow-sm backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex">
              <Link
                to="/"
                className={`flex items-center px-2 py-2 text-xl font-bold text-indigo-600 hover:text-indigo-700 border-b-2 -mb-px ${
                  isPathActive("/") ? "border-indigo-600" : "border-transparent"
                }`}
                onClick={closeMobileMenu}
                aria-current={isPathActive("/") ? "page" : undefined}
              >
                Quizymode
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/categories"
                  className={desktopNavLinkClass(isPathActive("/categories"))}
                >
                  Categories
                </Link>
                <Link
                  to="/collections"
                  className={desktopNavLinkClass(isPathActive("/collections"))}
                >
                  Collections
                </Link>
                {isAuthenticated && (
                  <>
                    <Link
                      to="/items/add"
                      className={desktopNavLinkClass(isPathActive("/items"))}
                    >
                      Add Items
                    </Link>
                    {userIsAdmin && (
                      <Link
                        to="/admin"
                        className={desktopNavLinkClass(isPathActive("/admin"))}
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
                className="sm:hidden inline-flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
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
              <div className="hidden sm:flex sm:items-center sm:gap-3">
                {isAuthenticated ? (
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => setShowProfileModal(true)}
                      className="text-right hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {headerDisplayName}
                      </div>
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
                className={mobileNavLinkClass(isPathActive("/categories"))}
                onClick={closeMobileMenu}
              >
                Categories
              </Link>
              <Link
                to="/collections"
                className={mobileNavLinkClass(isPathActive("/collections"))}
                onClick={closeMobileMenu}
              >
                Collections
              </Link>
              {isAuthenticated && (
                <>
                  <Link
                    to="/items/add"
                    className={mobileNavLinkClass(isPathActive("/items"))}
                    onClick={closeMobileMenu}
                  >
                    Add Items
                  </Link>
                  {userIsAdmin && (
                    <Link
                      to="/admin"
                      className={mobileNavLinkClass(isPathActive("/admin"))}
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
                      {headerDisplayName}
                    </div>
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
      <main
        className={
          isFullBleedPage
            ? "flex-1 py-0"
            : "mx-auto flex-1 w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
        }
      >
        {isFullBleedPage ? (
          children
        ) : (
          <div className="rounded-[32px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-2 text-slate-900 shadow-2xl shadow-slate-950/20 backdrop-blur sm:p-6 lg:p-8">
            {children}
          </div>
        )}
      </main>
      <footer className="mx-auto w-full max-w-7xl px-3 pb-3 pt-1 sm:px-6 lg:px-8">
        <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.7)_0%,rgba(2,6,23,0.64)_100%)] px-3 py-2.5 text-slate-100 shadow-xl shadow-slate-950/20 backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div className="hidden sm:block shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              Browse, Support &amp; Legal
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            <Link
              to="/about"
              className="inline-flex items-center justify-center rounded-md border border-white/12 bg-white/8 px-2.5 py-1.5 text-sm font-medium text-slate-100 transition hover:border-sky-300/35 hover:bg-white/12 hover:text-white"
            >
              About
            </Link>
            <a
              href={userGuideUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-white/12 bg-white/8 px-2.5 py-1.5 text-sm font-medium text-slate-100 transition hover:border-sky-300/35 hover:bg-white/12 hover:text-white"
            >
              User Guide
            </a>
            <button
              type="button"
              onClick={() => setShowFeedbackDialog(true)}
              className="inline-flex items-center justify-center rounded-md border border-white/12 bg-white/8 px-2.5 py-1.5 text-sm font-medium text-slate-100 transition hover:border-sky-300/35 hover:bg-white/12 hover:text-white"
            >
              Feedback
            </button>
            <Link
              to="/ideas"
              className="inline-flex items-center justify-center rounded-md border border-white/12 bg-white/8 px-2.5 py-1.5 text-sm font-medium text-slate-100 transition hover:border-sky-300/35 hover:bg-white/12 hover:text-white"
            >
              Ideas
            </Link>
            <Link
              to="/privacy"
              className="inline-flex items-center justify-center rounded-md border border-white/12 bg-white/8 px-2.5 py-1.5 text-sm font-medium text-slate-100 transition hover:border-sky-300/35 hover:bg-white/12 hover:text-white"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="inline-flex items-center justify-center rounded-md border border-white/12 bg-white/8 px-2.5 py-1.5 text-sm font-medium text-slate-100 transition hover:border-sky-300/35 hover:bg-white/12 hover:text-white"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
      <FeedbackDialog
        isOpen={showFeedbackDialog}
        onClose={() => setShowFeedbackDialog(false)}
        defaultEmail={user?.email || email}
      />
    </div>
  );
};

export default Layout;
