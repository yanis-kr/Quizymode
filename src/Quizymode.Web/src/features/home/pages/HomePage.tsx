import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  AcademicCapIcon,
  BookOpenIcon,
  PlusCircleIcon,
  FolderIcon,
  StarIcon,
  ArrowRightIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";

const HomePage = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-5xl font-bold mb-6">Welcome to Quizymode</h1>
            <p className="text-xl mb-8 text-indigo-100 max-w-2xl mx-auto">
              Your interactive learning platform for exploring and creating quiz
              content. Browse questions, test your knowledge, and build your own
              quiz collections.
            </p>
            <div className="flex gap-4 justify-center">
              {isAuthenticated ? (
                <>
                  <Link
                    to="/categories"
                    className="bg-white text-indigo-600 px-6 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors inline-flex items-center gap-2"
                  >
                    Browse Categories
                    <ArrowRightIcon className="h-5 w-5" />
                  </Link>
                  <Link
                    to="/my-items"
                    className="bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-800 transition-colors inline-flex items-center gap-2"
                  >
                    My Items
                    <ArrowRightIcon className="h-5 w-5" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/categories"
                    className="bg-white text-indigo-600 px-6 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors inline-flex items-center gap-2"
                  >
                    Start Exploring
                    <ArrowRightIcon className="h-5 w-5" />
                  </Link>
                  <Link
                    to="/signup"
                    className="bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-800 transition-colors inline-flex items-center gap-2"
                  >
                    Sign Up Free
                    <ArrowRightIcon className="h-5 w-5" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
          What You Can Do
        </h2>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Anonymous Users */}
          <div className="bg-white rounded-lg shadow-lg p-8 border-2 border-gray-100">
            <div className="flex items-center mb-4">
              <BookOpenIcon className="h-8 w-8 text-indigo-600 mr-3" />
              <h3 className="text-2xl font-bold text-gray-900">For Everyone</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Explore quiz content without signing up. Perfect for learning and
              testing your knowledge.
            </p>
            <ul className="space-y-3">
              <li className="flex items-start">
                <AcademicCapIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Browse Categories</strong> - Explore questions by topic
                </span>
              </li>
              <li className="flex items-start">
                <BookOpenIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Explore Mode</strong> - View questions and answers
                  with detailed explanations
                </span>
              </li>
              <li className="flex items-start">
                <AcademicCapIcon className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Quiz Mode</strong> - Test your knowledge with
                  multiple-choice questions and track your score
                </span>
              </li>
            </ul>
            <div className="mt-6">
              <Link
                to="/categories"
                className="text-indigo-600 font-semibold hover:text-indigo-700 inline-flex items-center gap-1"
              >
                Browse Categories
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Signed-in Users */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow-lg p-8 border-2 border-indigo-200">
            <div className="flex items-center mb-4">
              <StarIcon className="h-8 w-8 text-purple-600 mr-3" />
              <h3 className="text-2xl font-bold text-gray-900">For Members</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Sign up to unlock powerful features for creating and managing your
              own quiz content.
            </p>
            <ul className="space-y-3">
              <li className="flex items-start">
                <PlusCircleIcon className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Create Items</strong> - Add your own questions with
                  answers and explanations
                </span>
              </li>
              <li className="flex items-start">
                <FolderIcon className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Collections</strong> - Organize items into custom
                  collections for easy access
                </span>
              </li>
              <li className="flex items-start">
                <StarIcon className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Rate & Comment</strong> - Share feedback and
                  contribute to the community
                </span>
              </li>
              <li className="flex items-start">
                <AcademicCapIcon className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Private Items</strong> - Keep your personal quiz items
                  private or share them publicly
                </span>
              </li>
            </ul>
            <div className="mt-6">
              {isAuthenticated ? (
                <Link
                  to="/my-items"
                  className="text-purple-600 font-semibold hover:text-purple-700 inline-flex items-center gap-1"
                >
                  Go to My Items
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              ) : (
                <Link
                  to="/signup"
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700 transition-colors inline-flex items-center gap-1"
                >
                  Sign Up Now
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-gray-50 rounded-lg p-8 mt-12">
          <h3 className="text-2xl font-bold text-center mb-8 text-gray-900">
            How It Works
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-indigo-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-indigo-600">1</span>
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Choose a Category
              </h4>
              <p className="text-gray-600 text-sm">
                Browse available categories and subcategories to find topics
                that interest you
              </p>
            </div>
            <div className="text-center">
              <div className="bg-indigo-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-indigo-600">2</span>
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Select Your Mode
              </h4>
              <p className="text-gray-600 text-sm">
                Choose between Explore mode to learn or Quiz mode to test your
                knowledge
              </p>
            </div>
            <div className="text-center">
              <div className="bg-indigo-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-indigo-600">3</span>
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">
                Learn & Create
              </h4>
              <p className="text-gray-600 text-sm">
                Study questions, track your progress, and create your own quiz
                content
              </p>
            </div>
          </div>
        </div>

        {/* Open Source Section */}
        <div className="mt-16 pt-8 border-t border-gray-200">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Open Source
            </h3>
            <p className="text-gray-600 mb-4">
              Quizymode is open source and available on GitHub. Check out the
              source code, contribute, or report issues.
            </p>
            <a
              href="https://github.com/yanis-kr/Quizymode"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
            >
              <CodeBracketIcon className="h-5 w-5" />
              View on GitHub
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Build Timestamp Footer */}
      {typeof __BUILD_TIME__ !== "undefined" && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-500">
            Built {new Date(__BUILD_TIME__).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
};

export default HomePage;
