import { SEO } from "@/components/SEO";

const AboutPage = () => {
  return (
    <>
      <SEO
        title="About Quizymode"
        description="QuizyMode is a place to study, review, and quiz yourself using public question banks and personal collections."
        canonical="https://www.quizymode.com/about"
      />
      <div className="mx-auto max-w-4xl rounded-lg bg-white px-4 py-8 shadow-sm sm:px-6 lg:px-8">
        <h1 className="mb-6 text-4xl font-bold text-gray-900">
          About QuizyMode
        </h1>

        <div className="prose prose-lg max-w-none">
          <p className="mb-6 text-lg leading-relaxed text-gray-700">
            QuizyMode is a place to study, review, and quiz yourself using
            public question banks and personal collections.
          </p>

          <p className="mb-6 text-lg leading-relaxed text-gray-700">
            It is designed to support different kinds of learning. It can be
            used for exam prep like AWS, ACT, or NCLEX, for school subjects
            like biology, algebra, history, or geography, for language practice
            like English idioms or French vocabulary, or just for a fun quiz at
            home or on a road trip.
          </p>

          <p className="mb-6 text-lg leading-relaxed text-gray-700">
            The app is organized around clear topic paths on purpose. Instead
            of mixing everything into one large pool of questions, QuizyMode
            tries to place most content into specific categories and subtopics
            so it is easier to browse, revisit later, and quiz from at
            different levels. The structure is a little opinionated, and that
            is intentional. When something does not fit neatly into the
            established categories, it can still go into broader buckets like
            General or Trivia.
          </p>

          <p className="mb-6 text-lg leading-relaxed text-gray-700">
            QuizyMode also supports creating and organizing your own material.
            Questions can be uploaded, grouped into collections, and shared. A
            teacher or tutor could upload a study guide, turn it into a
            collection, and share it with a class so students can review
            questions, see answers and explanations, and switch into quiz mode
            for extra practice. Content can also be submitted for review for
            possible public availability, and requests can be made for more
            questions in topics that need better coverage.
          </p>

          <p className="text-lg leading-relaxed text-gray-700">
            The main goal is simple: make it easier to find a topic, review it,
            and learn from it - whether that means exam prep, school subjects,
            languages, humanities, sports, or just fun trivia.
          </p>
        </div>
      </div>
    </>
  );
};

export default AboutPage;
