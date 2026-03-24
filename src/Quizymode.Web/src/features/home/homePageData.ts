import { categoryThemes, getCategoryThemeBySlug } from "@/features/categories/categoryThemes";

const createFeaturedSetArt = ({
  label,
  primary,
  secondary,
  accent,
}: {
  label: string;
  primary: string;
  secondary: string;
  accent: string;
}) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg width="1200" height="720" viewBox="0 0 1200 720" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="720" gradientUnits="userSpaceOnUse">
          <stop stop-color="${primary}" />
          <stop offset="1" stop-color="${secondary}" />
        </linearGradient>
        <linearGradient id="beam" x1="180" y1="80" x2="760" y2="640" gradientUnits="userSpaceOnUse">
          <stop stop-color="${accent}" stop-opacity="0.9" />
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect width="1200" height="720" rx="44" fill="url(#bg)" />
      <circle cx="1032" cy="122" r="148" fill="${accent}" fill-opacity="0.18" />
      <circle cx="164" cy="602" r="188" fill="#FFFFFF" fill-opacity="0.08" />
      <path d="M-20 590L264 306L430 472L694 208L914 428L1220 122" stroke="url(#beam)" stroke-width="56" stroke-linecap="round" />
      <path d="M92 118H412" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="16" stroke-linecap="round" />
      <path d="M92 170H332" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="12" stroke-linecap="round" />
      <rect x="88" y="450" width="508" height="166" rx="28" fill="#081428" fill-opacity="0.26" />
      <path d="M88 530H596" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="2" />
      <text x="124" y="522" fill="#FFFFFF" fill-opacity="0.96" font-family="Arial, sans-serif" font-size="86" font-weight="700">${label}</text>
      <text x="128" y="586" fill="#FFFFFF" fill-opacity="0.58" font-family="Arial, sans-serif" font-size="28" letter-spacing="7">QUIZYMODE</text>
      <rect x="818" y="404" width="224" height="224" rx="36" fill="#FFFFFF" fill-opacity="0.1" />
      <rect x="856" y="442" width="148" height="148" rx="28" fill="${accent}" fill-opacity="0.22" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="3" />
      <path d="M884 552L930 494L966 530L1020 462" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M884 476H990" stroke="#FFFFFF" stroke-opacity="0.28" stroke-width="10" stroke-linecap="round" />
    </svg>
  `)}`;

export const HOME_SAMPLE_COLLECTION_ID = "8f9b8c14-8d30-4d94-9b20-4c7bb7f7f511";
export const HOME_SAMPLE_COLLECTION_NAME = "Sample Collection";

export interface HomeCategoryCard {
  slug: string;
  name: string;
  description: string;
  image: string;
}

export interface FeaturedSetCard {
  id: string;
  path: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
}

const categoryDescriptions = new Map<string, string>([
  ["exams", "Certification prep, standardized tests, and professional exam drills."],
  ["tech", "Programming, cloud, security, systems, and modern engineering topics."],
  ["business", "Finance, marketing, strategy, operations, and management frameworks."],
  ["science", "Astronomy, biology, chemistry, math, statistics, and lab skills."],
  ["history", "Ancient worlds, modern eras, wars, timelines, and major turning points."],
  ["geography", "Countries, capitals, regions, travel landmarks, and map-based study."],
  ["languages", "Spanish, French, grammar, ESL, travel phrases, and vocabulary review."],
  ["humanities", "Literature, philosophy, music, film, visual art, and culture."],
  ["civics", "Government, law, rights, institutions, citizenship, and public policy."],
  ["sports", "Rules, champions, events, teams, player roles, and competitive trivia."],
  ["nature", "Wildlife, ecosystems, camping, navigation, and survival knowledge."],
  ["trivia", "Movies, music, pop culture, brands, games, and high-energy fun facts."],
]);

export const homeCategoryCards: HomeCategoryCard[] = categoryThemes.map((theme) => ({
  slug: theme.slug,
  name: theme.name,
  description: categoryDescriptions.get(theme.slug) ?? "",
  image: getCategoryThemeBySlug(theme.slug).image,
}));

export const featuredSetCards: FeaturedSetCard[] = [
  {
    id: "aws-saa-c03",
    path: "/quiz/exams?nav=aws,saa-c03",
    eyebrow: "Cloud Cert",
    title: "AWS SAA-C03",
    description: "A fast set for architecture basics, S3, Lambda, and common cert patterns.",
    image: createFeaturedSetArt({
      label: "AWS SAA",
      primary: "#111827",
      secondary: "#1d4ed8",
      accent: "#60a5fa",
    }),
  },
  {
    id: "soccer-world-cup",
    path: "/quiz/sports?nav=soccer,world-cup",
    eyebrow: "Competition",
    title: "World Cup Starter",
    description: "Teams, substitutions, tournament rules, and a clean on-ramp into soccer quizzes.",
    image: createFeaturedSetArt({
      label: "WORLD CUP",
      primary: "#17240e",
      secondary: "#4d7c0f",
      accent: "#bef264",
    }),
  },
  {
    id: "tropical-island",
    path: "/quiz/nature?nav=survival,tropical-island",
    eyebrow: "Survival",
    title: "Tropical Island Survival",
    description: "Water, shelter, signaling, and the practical decisions that matter first.",
    image: createFeaturedSetArt({
      label: "SURVIVAL",
      primary: "#0a2415",
      secondary: "#15803d",
      accent: "#86efac",
    }),
  },
  {
    id: "solar-system",
    path: "/quiz/science?nav=astronomy,solar-system",
    eyebrow: "Space",
    title: "Solar System Sprint",
    description: "Planets, scale, motion, and the easy wins every astronomy round needs.",
    image: createFeaturedSetArt({
      label: "SOLAR",
      primary: "#120c2f",
      secondary: "#4338ca",
      accent: "#a78bfa",
    }),
  },
  {
    id: "world-capitals",
    path: "/quiz/geography?nav=capitals,world",
    eyebrow: "Maps",
    title: "World Capitals Express",
    description: "A quick route through major capitals and the country-city pairs worth knowing.",
    image: createFeaturedSetArt({
      label: "CAPITALS",
      primary: "#082032",
      secondary: "#0284c7",
      accent: "#7dd3fc",
    }),
  },
  {
    id: "spanish-vocab",
    path: "/quiz/languages?nav=spanish,vocab",
    eyebrow: "Language",
    title: "Spanish Core Vocab",
    description: "Greetings, everyday words, and beginner-friendly recall reps for quick practice.",
    image: createFeaturedSetArt({
      label: "SPANISH",
      primary: "#24124a",
      secondary: "#7c3aed",
      accent: "#c4b5fd",
    }),
  },
];
