import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

const AboutPage = () => {
  return (
    <>
      <SEO
        title="About Quizymode"
        description="Quizymode is an interactive learning platform designed to help people learn faster using quizzes and flashcards. Built for learners who want clarity, flexibility, and control over how they study."
        canonical="https://www.quizymode.com/about"
      />
      <div className="bg-white rounded-lg shadow-sm px-4 py-8 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">Quizymode</h1>
        
        <div className="prose prose-lg max-w-none mb-8">
          <p className="text-lg text-gray-700 leading-relaxed mb-6">
            Quizymode is an interactive learning platform designed to help people learn faster using quizzes and flashcards.
          </p>
          
          <p className="text-lg text-gray-700 leading-relaxed mb-6">
            Unlike generic quiz apps, Quizymode focuses on active recall, simple organization, and practical learning. You can browse existing question sets, test your knowledge, or create your own collections tailored to your goals.
          </p>
          
          <p className="text-lg text-gray-700 leading-relaxed mb-6">
            Quizymode is built for learners who want clarity, flexibility, and control over how they study—whether that's preparing for exams, learning a new language, or reinforcing everyday knowledge.
          </p>
          
          <p className="text-lg text-gray-700 leading-relaxed mb-8">
            The platform is actively evolving, with new features and improvements added regularly based on real user feedback.
          </p>
        </div>

        <div className="border-t border-gray-200 pt-8 mt-8 space-y-4">
          <Link
            to="/roadmap"
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors text-lg"
          >
            👉 See what's coming next
            <ArrowRightIcon className="h-5 w-5" />
          </Link>
          
          <div>
            <Link
              to="/feedback"
              className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors text-lg"
            >
              👉 Report a bug or suggest a feature
              <ArrowRightIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default AboutPage;
