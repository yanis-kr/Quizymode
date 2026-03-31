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
          className="max-w-none text-sm text-slate-600
            [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-800
            [&_p]:my-2 [&_p]:leading-relaxed
            [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5
            [&_li]:my-0.5
            [&_strong]:font-semibold [&_strong]:text-slate-700"
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
