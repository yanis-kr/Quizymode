import { SEO } from "@/components/SEO";

const AboutPage = () => {
  return (
    <>
      <SEO
        title="About Quizymode"
        description="QuizyMode is a place to study, review, and quiz yourself using public question banks and personal collections."
        canonical="https://www.quizymode.com/about"
      />
      <div className="mx-auto max-w-2xl px-2 py-4 sm:px-4">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">
          About QuizyMode
        </h1>

        {/* Markdown content from docs/about.md */}
        <div
          className="prose prose-sm max-w-none
            prose-headings:font-semibold prose-headings:text-slate-800
            prose-h2:mt-5 prose-h2:mb-2 prose-h2:text-base
            prose-p:text-slate-600 prose-p:leading-relaxed prose-p:my-2
            prose-ul:my-2 prose-li:text-slate-600 prose-li:my-0.5
            prose-strong:text-slate-700"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: __ABOUT_HTML__ }}
        />

        {/* Version — small, unobtrusive, at the bottom */}
        <p className="mt-6 text-xs text-slate-400">
          Version {__APP_VERSION__}
        </p>
      </div>
    </>
  );
};

export default AboutPage;
