import { SEO } from "@/components/SEO";
import {
  BugAntIcon,
  SparklesIcon,
  CodeBracketIcon,
} from "@heroicons/react/24/outline";

const FeedbackPage = () => {
  return (
    <>
      <SEO
        title="Quizymode Feedback"
        description="Share your feedback, report bugs, or suggest features for Quizymode. Your input helps make the platform better for everyone."
        canonical="https://www.quizymode.com/feedback"
      />
      <div className="bg-white rounded-lg shadow-sm px-4 py-8 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">Quizymode Feedback</h1>
        
        <div className="prose prose-lg max-w-none mb-8">
          <p className="text-lg text-gray-700 leading-relaxed mb-8">
            Quizymode is built iteratively, and your feedback matters.
          </p>
          
          <p className="text-lg text-gray-700 leading-relaxed mb-8">
            If you've found a bug, have a feature request, or just want to share an idea, this is the place to do it.
          </p>
        </div>

        <div className="space-y-12 mb-8">
          {/* Report a Bug */}
          <div>
            <div className="flex items-center mb-4">
              <BugAntIcon className="h-8 w-8 text-red-600 mr-3" />
              <h2 className="text-2xl font-bold text-gray-900">🐞 Report a Bug</h2>
            </div>
            
            <p className="text-gray-700 mb-4">Please include:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 mb-6 ml-4">
              <li>What you were trying to do</li>
              <li>What happened instead</li>
              <li>Your browser/device (if known)</li>
            </ul>
            
            <a
              href="https://github.com/yanis-kr/Quizymode/issues/new?template=bug_report.md&labels=bug"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              <BugAntIcon className="h-5 w-5" />
              Report Bug on GitHub
            </a>
          </div>

          {/* Request a Feature */}
          <div>
            <div className="flex items-center mb-4">
              <SparklesIcon className="h-8 w-8 text-purple-600 mr-3" />
              <h2 className="text-2xl font-bold text-gray-900">✨ Request a Feature</h2>
            </div>
            
            <p className="text-gray-700 mb-4">
              Have an idea that would improve Quizymode?
            </p>
            
            <ul className="list-disc list-inside space-y-2 text-gray-700 mb-6 ml-4">
              <li>New learning modes</li>
              <li>Better organization</li>
              <li>Anything that would help you learn faster</li>
            </ul>
            
            <a
              href="https://github.com/yanis-kr/Quizymode/issues/new?template=feature_request.md&labels=enhancement"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
            >
              <SparklesIcon className="h-5 w-5" />
              Request Feature on GitHub
            </a>
          </div>

          {/* General Feedback */}
          <div>
            <div className="flex items-center mb-4">
              <CodeBracketIcon className="h-8 w-8 text-indigo-600 mr-3" />
              <h2 className="text-2xl font-bold text-gray-900">💬 General Feedback</h2>
            </div>
            
            <p className="text-gray-700 mb-6">
              Have general feedback or want to share your thoughts? You can open a general issue on GitHub or contribute to discussions.
            </p>
            
            <a
              href="https://github.com/yanis-kr/Quizymode/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors text-lg"
            >
              <CodeBracketIcon className="h-5 w-5" />
              Open General Issue on GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default FeedbackPage;
