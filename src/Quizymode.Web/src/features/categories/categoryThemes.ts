import { categoryNameToSlug } from "@/utils/categorySlug";

export interface CategoryTheme {
  slug: string;
  name: string;
  image: string;
  accent: string;
  accentSoft: string;
}

function createSceneArt({
  skyTop,
  skyBottom,
  glow,
  surface,
  accent,
  scene,
}: {
  skyTop: string;
  skyBottom: string;
  glow: string;
  surface: string;
  accent: string;
  scene: string;
}) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg width="1200" height="720" viewBox="0 0 1200 720" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="720" gradientUnits="userSpaceOnUse">
          <stop stop-color="${skyTop}" />
          <stop offset="1" stop-color="${skyBottom}" />
        </linearGradient>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(880 124) rotate(128) scale(468 416)">
          <stop stop-color="${glow}" stop-opacity="0.72" />
          <stop offset="1" stop-color="${glow}" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="ground" x1="0" y1="480" x2="0" y2="720" gradientUnits="userSpaceOnUse">
          <stop stop-color="${surface}" stop-opacity="0.2" />
          <stop offset="1" stop-color="${surface}" stop-opacity="0.88" />
        </linearGradient>
      </defs>
      <rect width="1200" height="720" rx="44" fill="url(#bg)" />
      <rect width="1200" height="720" rx="44" fill="url(#glow)" />
      <circle cx="190" cy="122" r="84" fill="#FFFFFF" fill-opacity="0.08" />
      <circle cx="1016" cy="152" r="54" fill="#FFFFFF" fill-opacity="0.06" />
      <path d="M0 508C172 440 346 430 520 462C714 498 908 538 1200 454V720H0V508Z" fill="url(#ground)" />
      <path d="M0 574C190 522 388 528 580 560C822 602 980 612 1200 552V720H0V574Z" fill="${surface}" fill-opacity="0.48" />
      <path d="M0 0H1200V720H0Z" fill="url(#grain)" opacity="0.04"/>
      <defs>
        <pattern id="grain" x="0" y="0" width="180" height="180" patternUnits="userSpaceOnUse">
          <circle cx="16" cy="18" r="1.4" fill="#FFFFFF" />
          <circle cx="96" cy="44" r="1.2" fill="#FFFFFF" />
          <circle cx="152" cy="132" r="1.3" fill="#FFFFFF" />
          <circle cx="48" cy="128" r="1" fill="#FFFFFF" />
          <circle cx="122" cy="92" r="0.9" fill="#FFFFFF" />
        </pattern>
      </defs>
      ${scene}
      <rect x="0.5" y="0.5" width="1199" height="719" rx="43.5" stroke="#FFFFFF" stroke-opacity="0.14" />
      <rect x="40" y="40" width="1120" height="640" rx="34" stroke="${accent}" stroke-opacity="0.12" />
    </svg>
  `)}`;
}

const sceneMarkup = {
  exams: `
    <rect x="170" y="280" width="460" height="244" rx="28" fill="#10192F" fill-opacity="0.58" />
    <rect x="224" y="198" width="330" height="222" rx="20" fill="#F8FAFC" fill-opacity="0.92" />
    <rect x="258" y="246" width="208" height="18" rx="9" fill="#93C5FD" fill-opacity="0.9" />
    <rect x="258" y="286" width="248" height="12" rx="6" fill="#CBD5E1" />
    <rect x="258" y="324" width="220" height="12" rx="6" fill="#CBD5E1" />
    <path d="M670 236L748 314L670 392L592 314L670 236Z" fill="#FBBF24" fill-opacity="0.9" />
    <circle cx="670" cy="314" r="46" fill="#FEF3C7" />
    <path d="M646 314L662 330L694 296" stroke="#A16207" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M826 252L926 490L1000 306L1062 430" stroke="#7DD3FC" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
  `,
  tech: `
    <rect x="176" y="258" width="468" height="278" rx="30" fill="#071922" fill-opacity="0.62" />
    <rect x="220" y="194" width="382" height="226" rx="24" fill="#081F2C" stroke="#5EEAD4" stroke-opacity="0.4" stroke-width="4" />
    <rect x="248" y="226" width="174" height="12" rx="6" fill="#67E8F9" />
    <rect x="248" y="258" width="226" height="10" rx="5" fill="#0EA5E9" fill-opacity="0.9" />
    <path d="M276 344H424M276 378H372M474 260L560 314L474 370" stroke="#5EEAD4" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="292" y="448" width="236" height="18" rx="9" fill="#082F49" />
    <path d="M742 234L826 280L904 222L980 286L1062 246" stroke="#A7F3D0" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />
    <circle cx="826" cy="280" r="12" fill="#CCFBF1" />
    <circle cx="904" cy="222" r="12" fill="#CCFBF1" />
    <circle cx="980" cy="286" r="12" fill="#CCFBF1" />
  `,
  business: `
    <rect x="134" y="420" width="76" height="128" rx="12" fill="#1F2937" fill-opacity="0.76" />
    <rect x="234" y="368" width="92" height="180" rx="12" fill="#111827" fill-opacity="0.78" />
    <rect x="352" y="330" width="112" height="218" rx="12" fill="#1E293B" fill-opacity="0.8" />
    <rect x="488" y="278" width="124" height="270" rx="12" fill="#0F172A" fill-opacity="0.82" />
    <rect x="646" y="362" width="94" height="186" rx="12" fill="#1E293B" fill-opacity="0.78" />
    <path d="M788 450L878 364L946 410L1056 284" stroke="#FCD34D" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M1010 284H1056V330" stroke="#FCD34D" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="188" y="234" width="220" height="122" rx="22" fill="#FFF7ED" fill-opacity="0.78" />
    <path d="M226 320L280 282L326 302L370 254" stroke="#EA580C" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="280" cy="282" r="8" fill="#FDBA74" />
    <circle cx="326" cy="302" r="8" fill="#FDBA74" />
    <circle cx="370" cy="254" r="8" fill="#FDBA74" />
  `,
  science: `
    <circle cx="328" cy="268" r="116" fill="#C4B5FD" fill-opacity="0.28" />
    <circle cx="328" cy="268" r="76" fill="#DDD6FE" fill-opacity="0.52" />
    <path d="M184 268C226 200 430 190 478 268C430 346 226 336 184 268Z" stroke="#E9D5FF" stroke-width="10" opacity="0.9" />
    <path d="M258 190C332 214 404 344 360 416C286 392 214 262 258 190Z" stroke="#A78BFA" stroke-width="10" opacity="0.9" />
    <circle cx="764" cy="258" r="26" fill="#BFDBFE" />
    <circle cx="866" cy="226" r="20" fill="#BFDBFE" />
    <circle cx="930" cy="310" r="24" fill="#BFDBFE" />
    <path d="M764 258L866 226L930 310L836 380L764 258Z" stroke="#E0F2FE" stroke-width="10" opacity="0.88" />
    <path d="M560 478H1028" stroke="#CBD5E1" stroke-width="10" opacity="0.55" />
    <path d="M642 478V360H720L768 244L814 478H892L938 330L980 478" stroke="#E2E8F0" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.86" />
  `,
  history: `
    <ellipse cx="388" cy="462" rx="196" ry="72" fill="#FDE68A" fill-opacity="0.2" />
    <path d="M180 462C180 320 280 240 416 240C552 240 652 320 652 462" fill="#A16207" fill-opacity="0.26" />
    <path d="M230 462C230 348 306 284 416 284C526 284 602 348 602 462" fill="#FDE68A" fill-opacity="0.48" />
    <rect x="248" y="382" width="38" height="118" rx="10" fill="#FFFBEB" fill-opacity="0.72" />
    <rect x="316" y="356" width="38" height="144" rx="10" fill="#FFFBEB" fill-opacity="0.72" />
    <rect x="384" y="338" width="38" height="162" rx="10" fill="#FFFBEB" fill-opacity="0.72" />
    <rect x="452" y="356" width="38" height="144" rx="10" fill="#FFFBEB" fill-opacity="0.72" />
    <rect x="520" y="382" width="38" height="118" rx="10" fill="#FFFBEB" fill-opacity="0.72" />
    <path d="M736 432L830 302L924 366L1020 242" stroke="#FDBA74" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.86" />
    <circle cx="1020" cy="242" r="18" fill="#FFE7C2" />
  `,
  geography: `
    <circle cx="368" cy="312" r="164" fill="#E0F2FE" fill-opacity="0.3" />
    <circle cx="368" cy="312" r="124" fill="#BAE6FD" fill-opacity="0.5" />
    <path d="M286 274C312 236 378 228 420 256C440 292 410 312 420 350C388 370 330 368 300 336C278 320 264 298 286 274Z" fill="#16A34A" fill-opacity="0.8" />
    <path d="M356 228C430 222 484 264 486 320C450 302 438 284 410 288C394 264 368 258 356 228Z" fill="#22C55E" fill-opacity="0.72" />
    <path d="M244 314H492M368 186C324 228 324 396 368 438M290 226C414 264 414 358 290 396M446 226C322 264 322 358 446 396" stroke="#E0F2FE" stroke-width="8" opacity="0.55" />
    <path d="M760 472L844 280L926 472" stroke="#F8FAFC" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.84" />
    <path d="M814 360H934" stroke="#F8FAFC" stroke-width="18" stroke-linecap="round" opacity="0.8" />
    <circle cx="876" cy="210" r="42" fill="#7DD3FC" fill-opacity="0.28" />
  `,
  languages: `
    <rect x="170" y="238" width="250" height="170" rx="28" fill="#FDF4FF" fill-opacity="0.72" />
    <path d="M220 304H356M220 338H330" stroke="#A855F7" stroke-width="14" stroke-linecap="round" />
    <path d="M260 408L286 366H340" stroke="#F5D0FE" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="428" y="286" width="226" height="152" rx="28" fill="#EDE9FE" fill-opacity="0.8" />
    <path d="M478 338H598M478 372H560" stroke="#7C3AED" stroke-width="14" stroke-linecap="round" />
    <path d="M566 438L594 398H636" stroke="#C4B5FD" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="760" y="210" width="204" height="282" rx="24" fill="#FFF7ED" fill-opacity="0.76" />
    <rect x="798" y="250" width="126" height="18" rx="9" fill="#FB923C" />
    <rect x="798" y="292" width="98" height="12" rx="6" fill="#FCD34D" />
    <rect x="798" y="328" width="118" height="12" rx="6" fill="#FCD34D" />
    <circle cx="906" cy="428" r="24" fill="#FDBA74" fill-opacity="0.68" />
  `,
  humanities: `
    <rect x="156" y="188" width="258" height="316" rx="20" fill="#0F172A" fill-opacity="0.44" />
    <rect x="194" y="226" width="182" height="240" rx="14" fill="#F8FAFC" fill-opacity="0.92" />
    <path d="M286 264C320 264 348 290 348 324V378C348 404 326 426 300 426H272C246 426 224 404 224 378V324C224 290 252 264 286 264Z" fill="#D4D4D8" />
    <path d="M234 422H338V446H234V422Z" fill="#A1A1AA" />
    <rect x="510" y="212" width="186" height="240" rx="12" fill="#FEF3C7" fill-opacity="0.84" />
    <rect x="558" y="260" width="90" height="144" rx="8" fill="#F59E0B" fill-opacity="0.48" />
    <rect x="770" y="240" width="226" height="198" rx="20" fill="#111827" fill-opacity="0.48" />
    <path d="M820 388L878 320L926 364L980 286" stroke="#FDE68A" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.84" />
  `,
  civics: `
    <path d="M254 456V360H586V456" stroke="#F8FAFC" stroke-width="18" stroke-linecap="round" />
    <path d="M284 360C284 286 342 232 420 232C498 232 556 286 556 360" fill="#E0E7FF" fill-opacity="0.62" />
    <path d="M244 456H598" stroke="#CBD5E1" stroke-width="18" stroke-linecap="round" />
    <rect x="288" y="370" width="36" height="112" rx="10" fill="#EFF6FF" fill-opacity="0.84" />
    <rect x="352" y="370" width="36" height="112" rx="10" fill="#EFF6FF" fill-opacity="0.84" />
    <rect x="416" y="370" width="36" height="112" rx="10" fill="#EFF6FF" fill-opacity="0.84" />
    <rect x="480" y="370" width="36" height="112" rx="10" fill="#EFF6FF" fill-opacity="0.84" />
    <path d="M760 454L838 312L912 370L1004 244" stroke="#93C5FD" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.86" />
    <circle cx="1004" cy="244" r="16" fill="#DBEAFE" />
  `,
  sports: `
    <ellipse cx="340" cy="474" rx="244" ry="94" fill="#84CC16" fill-opacity="0.22" />
    <path d="M130 474C176 378 250 322 340 322C430 322 504 378 550 474" fill="#65A30D" fill-opacity="0.36" />
    <path d="M148 474C194 396 260 350 340 350C420 350 486 396 532 474" stroke="#D9F99D" stroke-width="12" />
    <path d="M250 474C280 430 316 408 340 408C364 408 400 430 430 474" stroke="#ECFCCB" stroke-width="12" />
    <circle cx="840" cy="330" r="98" fill="#FDBA74" fill-opacity="0.88" />
    <path d="M744 330H936M840 234C820 268 820 392 840 426M772 272C826 304 854 356 908 388M908 272C854 304 826 356 772 388" stroke="#7C2D12" stroke-width="12" opacity="0.65" />
  `,
  nature: `
    <path d="M116 470L274 252L430 470H116Z" fill="#14532D" fill-opacity="0.7" />
    <path d="M244 470L408 204L602 470H244Z" fill="#166534" fill-opacity="0.78" />
    <path d="M428 470L612 236L820 470H428Z" fill="#15803D" fill-opacity="0.82" />
    <path d="M288 330L410 204L480 292L548 240L666 402" stroke="#D1FAE5" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
    <rect x="824" y="246" width="22" height="214" rx="11" fill="#78350F" />
    <circle cx="836" cy="226" r="72" fill="#4ADE80" fill-opacity="0.56" />
    <circle cx="902" cy="286" r="58" fill="#22C55E" fill-opacity="0.48" />
    <circle cx="778" cy="294" r="54" fill="#86EFAC" fill-opacity="0.4" />
  `,
  trivia: `
    <rect x="184" y="220" width="258" height="176" rx="26" fill="#FDF2F8" fill-opacity="0.82" transform="rotate(-10 184 220)" />
    <rect x="284" y="244" width="258" height="176" rx="26" fill="#FCE7F3" fill-opacity="0.82" transform="rotate(6 284 244)" />
    <circle cx="324" cy="314" r="36" fill="#FB7185" fill-opacity="0.86" />
    <path d="M322 276L332 304H362L338 322L348 352L322 334L296 352L306 322L282 304H312L322 276Z" fill="#FFF1F2" />
    <rect x="714" y="198" width="286" height="208" rx="28" fill="#4C0519" fill-opacity="0.34" />
    <path d="M748 268H966M748 324H922" stroke="#F9A8D4" stroke-width="18" stroke-linecap="round" opacity="0.88" />
    <circle cx="768" cy="232" r="8" fill="#FDE68A" />
    <circle cx="820" cy="232" r="8" fill="#FDE68A" />
    <circle cx="872" cy="232" r="8" fill="#FDE68A" />
    <circle cx="924" cy="232" r="8" fill="#FDE68A" />
    <circle cx="976" cy="232" r="8" fill="#FDE68A" />
  `,
} as const;

export const categoryThemes: CategoryTheme[] = [
  {
    slug: "exams",
    name: "Exams",
    accent: "#60A5FA",
    accentSoft: "#DBEAFE",
    image: createSceneArt({
      skyTop: "#0F172A",
      skyBottom: "#1D4ED8",
      glow: "#60A5FA",
      surface: "#020617",
      accent: "#60A5FA",
      scene: sceneMarkup.exams,
    }),
  },
  {
    slug: "tech",
    name: "Tech",
    accent: "#5EEAD4",
    accentSoft: "#CCFBF1",
    image: createSceneArt({
      skyTop: "#071B1A",
      skyBottom: "#0F766E",
      glow: "#2DD4BF",
      surface: "#042F2E",
      accent: "#5EEAD4",
      scene: sceneMarkup.tech,
    }),
  },
  {
    slug: "business",
    name: "Business",
    accent: "#FBBF24",
    accentSoft: "#FEF3C7",
    image: createSceneArt({
      skyTop: "#27170E",
      skyBottom: "#B45309",
      glow: "#F59E0B",
      surface: "#431407",
      accent: "#FBBF24",
      scene: sceneMarkup.business,
    }),
  },
  {
    slug: "science",
    name: "Science",
    accent: "#C4B5FD",
    accentSoft: "#EDE9FE",
    image: createSceneArt({
      skyTop: "#0F172A",
      skyBottom: "#4338CA",
      glow: "#A78BFA",
      surface: "#1E1B4B",
      accent: "#C4B5FD",
      scene: sceneMarkup.science,
    }),
  },
  {
    slug: "history",
    name: "History",
    accent: "#FDBA74",
    accentSoft: "#FFEDD5",
    image: createSceneArt({
      skyTop: "#2C180E",
      skyBottom: "#9A3412",
      glow: "#FDBA74",
      surface: "#431407",
      accent: "#FDBA74",
      scene: sceneMarkup.history,
    }),
  },
  {
    slug: "geography",
    name: "Geography",
    accent: "#7DD3FC",
    accentSoft: "#E0F2FE",
    image: createSceneArt({
      skyTop: "#0B223D",
      skyBottom: "#0284C7",
      glow: "#7DD3FC",
      surface: "#082F49",
      accent: "#7DD3FC",
      scene: sceneMarkup.geography,
    }),
  },
  {
    slug: "languages",
    name: "Languages",
    accent: "#C4B5FD",
    accentSoft: "#F5D0FE",
    image: createSceneArt({
      skyTop: "#24143A",
      skyBottom: "#7C3AED",
      glow: "#C084FC",
      surface: "#4C1D95",
      accent: "#C4B5FD",
      scene: sceneMarkup.languages,
    }),
  },
  {
    slug: "humanities",
    name: "Humanities",
    accent: "#FDE68A",
    accentSoft: "#FEF3C7",
    image: createSceneArt({
      skyTop: "#211B0D",
      skyBottom: "#A16207",
      glow: "#FACC15",
      surface: "#713F12",
      accent: "#FDE68A",
      scene: sceneMarkup.humanities,
    }),
  },
  {
    slug: "civics",
    name: "Civics",
    accent: "#93C5FD",
    accentSoft: "#DBEAFE",
    image: createSceneArt({
      skyTop: "#11263D",
      skyBottom: "#2563EB",
      glow: "#60A5FA",
      surface: "#1E3A8A",
      accent: "#93C5FD",
      scene: sceneMarkup.civics,
    }),
  },
  {
    slug: "sports",
    name: "Sports",
    accent: "#BEF264",
    accentSoft: "#ECFCCB",
    image: createSceneArt({
      skyTop: "#18210E",
      skyBottom: "#4D7C0F",
      glow: "#84CC16",
      surface: "#365314",
      accent: "#BEF264",
      scene: sceneMarkup.sports,
    }),
  },
  {
    slug: "nature",
    name: "Nature",
    accent: "#86EFAC",
    accentSoft: "#D1FAE5",
    image: createSceneArt({
      skyTop: "#0E1E12",
      skyBottom: "#15803D",
      glow: "#4ADE80",
      surface: "#14532D",
      accent: "#86EFAC",
      scene: sceneMarkup.nature,
    }),
  },
  {
    slug: "trivia",
    name: "Trivia",
    accent: "#F9A8D4",
    accentSoft: "#FCE7F3",
    image: createSceneArt({
      skyTop: "#2A1125",
      skyBottom: "#BE185D",
      glow: "#EC4899",
      surface: "#831843",
      accent: "#F9A8D4",
      scene: sceneMarkup.trivia,
    }),
  },
];

const categoryThemeBySlug = new Map(
  categoryThemes.map((theme) => [theme.slug, theme] as const)
);

export const defaultCategoryTheme = categoryThemes[0];

export function getCategoryThemeBySlug(slug?: string | null) {
  if (!slug) return defaultCategoryTheme;
  return categoryThemeBySlug.get(slug) ?? defaultCategoryTheme;
}

export function getCategoryThemeByName(name?: string | null) {
  if (!name) return defaultCategoryTheme;
  return getCategoryThemeBySlug(categoryNameToSlug(name));
}
