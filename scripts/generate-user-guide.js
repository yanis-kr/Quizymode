#!/usr/bin/env node
// Generates desktop or mobile user guides from a screenshot directory.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, "..");

const refreshCommand =
  "`npx playwright test --project=screenshots --project=screenshots-mobile && node scripts/generate-user-guide.js --all`";

export function resolveScreenshotDir(guideKey) {
  const screenshotRoot = process.env.USER_GUIDE_SCREENSHOT_ROOT;
  if (screenshotRoot) {
    return path.resolve(
      screenshotRoot,
      guideKey === "mobile" ? "mobile" : "desktop"
    );
  }

  return path.join(
    projectRoot,
    guideKey === "mobile"
      ? "docs/user-guide/screenshots/mobile"
      : "docs/user-guide/screenshots/user"
  );
}

export function resolveGuideConfig(guideKey) {
  if (guideKey === "desktop") {
    return {
      key: "desktop",
      screenshotDir: resolveScreenshotDir("desktop"),
      outputFile: path.join(projectRoot, "docs/user-guide/user-guide.md"),
      title: "Quizymode User Guide",
      intro:
        "This guide provides an overview of the main screens available to signed-in users on desktop and larger screens.",
      refreshCommand,
    };
  }

  if (guideKey === "mobile") {
    return {
      key: "mobile",
      screenshotDir: resolveScreenshotDir("mobile"),
      outputFile: path.join(projectRoot, "docs/user-guide/user-guide.mobile.md"),
      title: "Quizymode Mobile User Guide",
      intro:
        "This guide mirrors the main signed-in Quizymode walkthrough on a phone-sized screen, highlighting mobile navigation, stacked layouts, and full-screen overlays.",
      refreshCommand,
    };
  }

  throw new Error(`Unknown guide "${guideKey}"`);
}

export function getGuideConfigs() {
  return {
    desktop: resolveGuideConfig("desktop"),
    mobile: resolveGuideConfig("mobile"),
  };
}

export const baseDescriptions = {
  home: `The home page is the main entry point for Quizymode. It shows a hero section with a link to a public sample collection you can explore immediately, a grid of subject-area category cards with artwork and descriptions, and a carousel of featured sets linking directly to specific study scopes. The footer provides access to the User Guide, Feedback, Categories Map, and About from anywhere in the app.`,
  categories: `The Categories page lists all public subject areas available in Quizymode. You can search categories by name and sort by name, number of items, or average rating. Clicking a category opens its Sets view, where you can drill down through topics and subtopics to find exactly the items you want to study.`,
  "nav-geography": `Clicking a category card (here: Geography) opens the Sets view for that subject area. Each card represents a primary topic (rank-1 keyword) such as Capitals, Physical Geography, or Flags. The breadcrumb at the top shows your current position in the hierarchy and lets you navigate back at any time.`,
  "nav-geography-capitals": `Selecting a primary topic (here: Capitals) shows the available subtopics (rank-2 keywords) for that scope such as World, Europe, or Americas. These are the deepest navigable buckets in the hierarchy.`,
  "nav-geography-capitals-world": `Selecting a subtopic (here: World) reaches the leaf level and shows the actual quiz items. At this level the view automatically switches from Sets to **List** mode, showing each question, correct answer, and available actions. You can switch between List, Flashcards, and Quiz modes using the mode buttons at the top.`,
  "mode-flashcards": `**Flashcards mode** shows one item at a time as a card. The correct answer is shown first; clicking the card flips it to reveal the question and explanation. Use the arrow controls to move to the next or previous card. This mode is ideal for self-testing with spaced repetition.`,
  "mode-quiz": `**Quiz mode** presents each item as a multiple-choice question with the correct answer shuffled among the incorrect options. After answering, the app reveals whether you were right and shows the explanation. At the end of the set your score is displayed.`,
  "items-add-to-collection": `Each item in study views includes collection controls. The folder button shows your current active collection, and the **+** button adds that item to it immediately with no confirmation. On list cards the controls sit to the right; in other study modes they appear beneath the item content.`,
  "items-collection-badges": `After adding items to your active collection, those items show a filled collection badge so you can see at a glance what is already included. While an item is already in the active collection, its **+** button is disabled until you remove it or switch to a different active collection.`,
  "items-collection-removed": `Clicking the **minus icon** removes an item from your active collection immediately. The filled collection badge disappears and the **+** button becomes available again, so you can add the item back later if needed.`,
  "active-collection-selector": `Your **active collection** is the collection that receives items when you click **+**. From any item, click the folder button or the active collection name beside it to open **Manage Collections**. There you can create another collection, mark it active with the radio button, and then continue adding items into that newly active collection.`,
  "collection-new": `Click **New collection** to create another collection. Give it a name and an optional description, then save. Once created it appears in your collections list and you can set it as the active collection to start adding items to it.`,
  "collections-mine-two": `After creating a second collection, the **My Collections** tab shows both cards together. Each card shows the collection name, item count, and action icons for edit, active, copy link, and delete. The active collection uses a filled active icon so you can tell where one-click item adds will go.`,
  "keyword-filter": `Items in List mode show their keywords as small tags. Clicking a keyword tag instantly filters the list to show only items that share that tag. This is useful for focusing on a specific sub-topic within a broader scope.`,
  "item-detail": `Clicking the **eye icon** on a list card opens the item detail page. This page shows extra information that is not visible in the regular list, flashcard, or quiz views, such as the full answer block, incorrect options, explanation, source, visibility, created metadata, keywords, and collections.`,
  "item-rating-five-stars": `On the item detail page, signed-in users can rate an item by clicking one of the five stars. The rating saves immediately; clicking the same star again removes your rating. The row also shows the current average rating and total rating count.`,
  "item-comment-added": `From the item detail page, the **Comments** button opens a drawer where you can read existing discussion and post your own note without losing your place. After you type a comment and click **Post Comment**, it appears in the thread immediately with your name and timestamp.`,
  ideas: `The **Ideas** board at \`/ideas\` is a public product planning surface where anyone can browse feature requests and improvement proposals. Ideas are grouped by lifecycle status (Proposed, Planned, In Progress, Shipped, Archived). Signed-in users can submit new ideas, rate published ones, and follow discussion threads. New submissions go through moderation before appearing publicly on the board.`,
  "collections-mine": `The **My Collections** tab shows all collections you own once the page finishes loading. Each card displays the collection name, description, item count, and sharing state, along with icon actions to edit it, make it active, copy its link, or delete it. You can also create a new collection from this tab.`,
  "collection-detail": `Clicking a collection card opens that collection's study page. The page keeps **Collections** as the active navigation area and shows mode tabs for **List**, **Flashcards**, and **Quiz** so you can study the same collection in different ways. Owners can also remove items or manage which collection is currently active from here.`,
  "collection-detail-flashcards": `Collections support the same **Flashcards** mode as category pages. Each item in the collection is presented as a flip card: answer first, then question and explanation when flipped.`,
  "collection-detail-quiz": `Collections also support **Quiz** mode: each item is shown as a multiple-choice question. This is handy for testing yourself on a curated set of items you have assembled across different categories.`,
  "collection-settings-public": `From **My Collections**, click **Edit collection** on a card to open its settings modal. Turning on **Shared with others** and saving makes the collection public: it appears in Discover and anyone with the shareable link can study it. New collections start private by default.`,
  "collections-discover-public": `Once you make a collection public it immediately appears in the Discover tab alongside the built-in Sample collection. Other users can find it by searching, browse its items, and bookmark it.`,
  "collection-bookmark": `Clicking the **Bookmark** button on a collection card in Discover saves it to your Bookmarked Collections tab. Bookmarks are personal: they do not affect the collection or its owner. The bookmark button toggles, so clicking it again removes the bookmark.`,
  "collections-bookmarked": `The **Bookmarked** tab shows all collections you have bookmarked. You can open any of them directly, study their items, or remove the bookmark. This is useful for keeping quick access to public collections you study regularly.`,
  "add-items": `The Add Items hub is the central starting point for creating new quiz content. It provides a Topic and tags block where you choose category, primary topic (rank 1), subtopic (rank 2), and optional extra keywords. The same scope is forwarded to whichever creation method you pick. From here you can open the single-item create form, the AI-assisted Bulk Create flow, or the Study Guide import wizard. If you have an active collection, a banner reminds you that newly created items will be added to it automatically.`,
  "add-items-prepopulated": `When you click the **Add** button while browsing a specific scope in Categories, the Add Items page opens with that scope already filled in: category, primary topic, and subtopic are pre-selected. The first time you visit you will see a brief content compliance notice; after clicking **I understand**, the page stays open with the selected scope ready for you to use.`,
  "add-new-item": `The Create Item form lets you write a single quiz item from scratch. Fill in the question, one correct answer, up to three incorrect answer options, an optional explanation, and a source URL. Category, primary topic, and subtopic are required and must be chosen from the taxonomy. You can add extra keywords. Successfully created items are automatically added to your active collection.`,
  "bulk-create-items": `The Bulk Create page (AI-assisted, no Study Guide) streamlines adding many items at once using an external AI assistant. Choose your category, primary topic, and subtopic; the app generates a structured prompt you copy into any AI tool. Paste the AI response back and the app parses the JSON into a review list where you can accept or reject each item individually before anything is saved to the database.`,
  "bulk-create-prompt": `After choosing your scope and clicking **Generate Prompt**, the app builds a structured prompt asking an AI assistant to produce quiz items for that category, primary topic, and subtopic. Copy the prompt text and paste it into ChatGPT, Claude, or any other AI tool.`,
  "bulk-create-paste": `Paste the AI assistant's raw JSON response into the text area and click **Import**. The app validates the JSON structure, checks each item's fields, and builds a review list. Invalid items are flagged; valid ones are ready for you to accept or reject.`,
  "bulk-create-review": `The review screen shows each parsed item as a card with the question, correct answer, incorrect options, explanation, source, and any AI-suggested keywords. Click **Accept** to save an individual item or **Reject** to discard it. **Accept All** saves every valid item at once.`,
  "study-guide-no-guide": `Navigating to the Study Guide Import wizard before uploading a study guide shows a message prompting you to save a study guide first. Click the link to go to the My Study Guide page and paste your material there.`,
  "study-guide": `The My Study Guide page is a personal text editor where you paste or write the study material you want to turn into quiz items such as lecture notes, textbook excerpts, documentation, or any reference text. Your study guide is saved per user and used as the source content for the Study Guide import wizard, which generates targeted questions from it using AI.`,
  "study-guide-content": `With your study guide text pasted in, click **Save**. The content is stored on your account and is now available to the import wizard. You can update or replace it at any time by editing the text and saving again.`,
  "study-guide-import": `The Study Guide import wizard turns your saved study guide text into quiz items in a guided multi-step flow. Select the category, primary topic, subtopic, and optional extra keywords; set the number of prompt sets; then click **Create prompt sets**.`,
  "study-guide-import-prompts": `After you save a study guide and click **Create prompt sets**, the wizard splits that saved guide into chunks and generates one AI prompt per chunk. Each prompt card shows the chunk title, its size in bytes, and the full prompt text. Copy each prompt into an AI assistant, then paste the JSON response back into the matching text area and click **Validate JSON**.`,
  "study-guide-import-first-prompt": `A prompt set contains the relevant excerpt from your study guide together with precise instructions for the AI: the exact category, primary topic, subtopic, output format, and field requirements. Paste this into any AI tool to get a structured batch of quiz items back.`,
};

export const mobileDescriptionOverrides = {
  home: `On mobile, the home page keeps the same hero and discovery content but compresses it into a narrow, scroll-first layout. The primary navigation moves behind the hamburger menu, so the screen emphasizes the category cards, featured sets, and footer actions rather than the full desktop nav bar.`,
  categories: `The Categories page keeps the same search and sort tools on mobile, but the controls stack vertically and the results fill the screen one card at a time. This makes category browsing feel more like a feed, with each tap moving deeper into the taxonomy.`,
  "nav-geography": `On mobile, opening Geography keeps the breadcrumb trail but the topic cards stack and wrap to fit the narrow screen. The focus shifts to one tap target at a time, which makes drilling into the taxonomy easier with a thumb.`,
  "nav-geography-capitals": `At the subtopic level, mobile keeps the same hierarchy but presents the choices in a tighter stacked grid. You still navigate by tapping a subtopic card, but the layout is optimized for narrow-width browsing.`,
  "nav-geography-capitals-world": `At the leaf level, the item view switches into the same **List** mode as desktop, but the mode controls and action buttons may wrap across multiple lines. The narrow layout keeps the question content readable while still exposing the study-mode switcher.`,
  "mode-flashcards": `On mobile, flashcards stay focused on one item at a time, with the card taking most of the viewport. Navigation controls sit close to the card so you can flip and advance without leaving the screen.`,
  "mode-quiz": `Quiz mode on mobile keeps the same multiple-choice flow, but the question, answers, and progress stack vertically for easier thumb interaction. The layout prioritizes answer selection and feedback without requiring sideways scanning.`,
  "items-add-to-collection": `Collection controls remain available in mobile study views, but they compress beneath or alongside the content depending on space. The goal is the same one-tap add flow, with the controls adapted to a tighter card layout.`,
  "items-collection-badges": `After you add items on mobile, the filled collection badges remain visible directly on the compact item cards. This makes it clear which items are already in the active collection without needing extra panels.`,
  "items-collection-removed": `Removing an item from the active collection works the same on mobile. The item card updates in place, freeing the add button again and keeping the workflow quick on a narrow screen.`,
  "active-collection-selector": `The active collection workflow is still available on mobile, but the management dialog becomes more sheet-like and space-efficient. You can create or switch collections without leaving the current study context.`,
  "collection-new": `Creating a new collection on mobile uses the same form fields, but the modal stacks vertically and fills more of the screen. This keeps the create flow readable without relying on a wide dialog.`,
  "collections-mine-two": `With multiple collections on mobile, the **My Collections** view turns into a vertical stack of cards. Actions remain on each card, but the layout favors readable summaries over wide side-by-side tiles.`,
  "keyword-filter": `Keyword filtering still works with one tap on mobile, though the tag row may wrap into multiple lines. That compressed layout helps keep filtering available even in narrow list views.`,
  "item-detail": `The item detail page on mobile shows the same information as desktop, but the sections stack into a single-column reading flow. This makes long answer, explanation, and metadata blocks easier to scan vertically.`,
  "item-rating-five-stars": `Rating on mobile keeps the same immediate-save behavior, but the stars are placed in a tighter row within the stacked item detail layout. The interaction remains quick and touch-friendly.`,
  "item-comment-added": `On mobile, the comments experience opens as a full-screen overlay rather than a side drawer. You can read and post comments without navigating away, while still keeping the focus entirely on the discussion thread.`,
  "collections-mine": `The **My Collections** tab uses the same data on mobile, but each collection becomes a full-width card in a vertical list. This makes the page easier to browse without shrinking controls or metadata too aggressively.`,
  "collection-detail": `A collection's study page keeps the same modes on mobile, but the controls wrap and the content flows vertically. The screen is optimized for reading and swiping through one collection at a time.`,
  "collection-detail-flashcards": `Collection flashcards on mobile keep the answer-first card interaction, but the card and navigation controls dominate the viewport. This makes the study session feel more like a dedicated handheld practice mode.`,
  "collection-detail-quiz": `Collection quiz mode keeps the same scoring and answer flow on mobile, with content stacked for touch interaction. The narrow layout preserves focus on the current question instead of surrounding chrome.`,
  "collection-settings-public": `Collection settings on mobile use the same fields and sharing toggle, but the edit dialog is more vertically arranged. That keeps the sharing workflow usable without a desktop-width modal.`,
  "collections-discover-public": `Discover still shows newly public collections on mobile, but the browse experience becomes a vertical stream of cards. Search and filtering stay available while the card layout remains easy to read on small screens.`,
  "collection-bookmark": `Bookmarking a public collection works the same on mobile with a single tap, and the card updates in place. The interaction stays lightweight even in the compact Discover layout.`,
  "collections-bookmarked": `Bookmarked collections are shown as a mobile-friendly stacked list. You can open or remove bookmarks directly from the narrow card layout.`,
  "add-items": `The Add Items hub keeps the same branching workflow on mobile, but the scope controls, notices, and action buttons stack into a single-column layout. This makes the create options easier to scan on a phone.`,
  "add-items-prepopulated": `When Add Items opens from a scoped category on mobile, the same category and keyword selections are pre-filled. The difference is mostly layout: the scope controls and compliance notice stack for narrow screens.`,
  "add-new-item": `The Create Item form becomes a long, single-column form on mobile, with fields and actions stacked top to bottom. This keeps every required input accessible without shrinking the form controls.`,
  "bulk-create-items": `The Bulk Create entry screen uses the same workflow on mobile, but the scope controls and helper text stack vertically. That makes the AI-assisted flow easier to follow on a handheld screen.`,
  "bulk-create-prompt": `The generated AI prompt remains the same on mobile, but the prompt area and surrounding controls are compressed into a narrower reading column. Expect more vertical scrolling when reviewing or copying the prompt.`,
  "bulk-create-paste": `Pasting the AI response on mobile keeps the same validation workflow, with the large textarea and import action arranged for a narrow screen. The stacked layout makes the JSON review flow workable without desktop width.`,
  "bulk-create-review": `The review step on mobile turns each parsed item into a tall stacked card. Accept and reject actions remain available per item, but the layout favors vertical scanning instead of wide comparisons.`,
  "study-guide-no-guide": `If you open Study Guide Import on mobile before saving a guide, the same empty-state prompt appears in a narrow, centered layout. The next action still sends you to the study guide editor first.`,
  "study-guide": `The study guide editor on mobile keeps the same personal note-taking workflow, but the title, editor, and actions stack into a tall single-column screen. This makes longer study material easier to edit in place.`,
  "study-guide-content": `After saving study guide content on mobile, the editor remains in the same stacked reading and editing flow. You can keep refining the text without leaving the page.`,
  "study-guide-import": `The import wizard keeps the same guided flow on mobile, but each setup control and step section stacks vertically. This preserves the multi-step workflow while fitting the full setup onto a phone screen.`,
  "study-guide-import-prompts": `Prompt cards in the import wizard become tall mobile panels showing the chunk details, prompt text, response box, and validation actions in one vertical flow. This makes the workflow slower to scan than desktop, but still complete on a phone.`,
  "study-guide-import-first-prompt": `On mobile, a single prompt set fills most of the screen as a narrow, scrollable block of instructions and source text. The screenshot highlights how the generated prompt remains usable even when the viewport is constrained.`,
  ideas: `The Ideas board on mobile stacks status groups and idea cards into a single-column scroll view. The submit and rating actions remain accessible, but the layout shifts from a wide grid to a more focused vertical feed.`,
};

export const sections = [
  { title: "Home", slugs: ["home"] },
  {
    title: "Browsing the Taxonomy",
    slugs: [
      "categories",
      "nav-geography",
      "nav-geography-capitals",
      "nav-geography-capitals-world",
      "mode-flashcards",
      "mode-quiz",
    ],
  },
  {
    title: "Building Your Collection",
    slugs: [
      "items-add-to-collection",
      "items-collection-badges",
      "items-collection-removed",
      "active-collection-selector",
      "collection-new",
      "collections-mine-two",
      "keyword-filter",
      "item-detail",
      "item-rating-five-stars",
      "item-comment-added",
    ],
  },
  {
    title: "Collections",
    slugs: [
      "collections-mine",
      "collection-detail",
      "collection-detail-flashcards",
      "collection-detail-quiz",
      "collection-settings-public",
      "collections-discover-public",
      "collection-bookmark",
      "collections-bookmarked",
    ],
  },
  {
    title: "Adding Items",
    slugs: [
      "add-items",
      "add-items-prepopulated",
      "add-new-item",
      "bulk-create-items",
      "bulk-create-prompt",
      "bulk-create-paste",
      "bulk-create-review",
    ],
  },
  {
    title: "Study Guide Import",
    slugs: [
      "study-guide-no-guide",
      "study-guide",
      "study-guide-content",
      "study-guide-import",
      "study-guide-import-prompts",
      "study-guide-import-first-prompt",
    ],
  },
  {
    title: "Other Pages",
    slugs: ["about", "feedback", "ideas"],
  },
];

export function parseArgs(argv) {
  let guide = "desktop";
  let all = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") {
      all = true;
      continue;
    }

    if (arg === "--guide" && argv[index + 1]) {
      guide = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--guide=")) {
      guide = arg.slice("--guide=".length);
    }
  }

  return { all, guide };
}

export function label(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function relativeScreenshotPath(outputFile, screenshotDir, slug) {
  const abs = path.join(screenshotDir, `${slug}.png`);
  return path.relative(path.dirname(outputFile), abs).replace(/\\/g, "/");
}

export function gatherAvailableScreenshots(screenshotDir) {
  return new Set(
    fs.existsSync(screenshotDir)
      ? fs
          .readdirSync(screenshotDir)
          .filter((file) => file.endsWith(".png"))
          .map((file) => file.replace(/\.png$/, ""))
      : []
  );
}

export function getDescription(guideKey, slug) {
  if (guideKey === "mobile" && mobileDescriptionOverrides[slug]) {
    return mobileDescriptionOverrides[slug];
  }

  return baseDescriptions[slug] ?? "";
}

export function buildGuide(config) {
  const available = gatherAvailableScreenshots(config.screenshotDir);
  const lines = [];

  lines.push(`# ${config.title}`);
  lines.push("");
  lines.push(config.intro);
  lines.push(
    `_Screenshots are generated automatically - run ${config.refreshCommand} from the repo root to refresh both guides._`
  );
  lines.push("");
  lines.push("## Table of Contents");
  lines.push("");

  for (const section of sections) {
    const anchor = section.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    lines.push(`- [${section.title}](#${anchor})`);
  }

  lines.push("");

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push("");

    for (const slug of section.slugs) {
      if (!available.has(slug)) {
        continue;
      }

      lines.push(`### ${label(slug)}`);
      lines.push("");

      const description = getDescription(config.key, slug);
      if (description) {
        lines.push(description);
        lines.push("");
      }

      lines.push(
        `![${label(slug)}](${relativeScreenshotPath(config.outputFile, config.screenshotDir, slug)} "${label(slug)}")`
      );
      lines.push("");
    }
  }

  fs.mkdirSync(path.dirname(config.outputFile), { recursive: true });
  fs.writeFileSync(config.outputFile, lines.join("\n"), "utf8");
  console.log(`User guide written to ${config.outputFile}`);
}

const args = parseArgs(process.argv.slice(2));

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  const guideConfigs = getGuideConfigs();

  if (args.all) {
    buildGuide(guideConfigs.desktop);
    buildGuide(guideConfigs.mobile);
    process.exit(0);
  }

  const config = guideConfigs[args.guide];
  if (!config) {
    console.error(
      `Unknown guide "${args.guide}". Expected one of: ${Object.keys(guideConfigs).join(", ")}`
    );
    process.exit(1);
  }

  buildGuide(config);
}
