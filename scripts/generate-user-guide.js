#!/usr/bin/env node
// Reads all PNGs from docs/user-guide/screenshots/user/ and generates
// docs/user-guide/user-guide.md with a table of contents and feature sections.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const screenshotDir = path.join(
  projectRoot,
  "docs/user-guide/screenshots/user"
);
const outputFile = path.join(projectRoot, "docs/user-guide/user-guide.md");

// ---------------------------------------------------------------------------
// Screen descriptions (derived from AC.md)
// ---------------------------------------------------------------------------
const descriptions = {
  // ---- Home ----
  home: `The home page is the main entry point for Quizymode. It shows a hero section with a link to a public sample collection you can explore immediately, a grid of subject-area category cards with artwork and descriptions, and a carousel of six featured sets linking directly to specific study scopes. The footer provides access to the User Guide, Feedback, Categories Map, and About from anywhere in the app.`,

  // ---- Browsing the taxonomy ----
  categories: `The Categories page lists all public subject areas available in Quizymode. You can search categories by name and sort by name, number of items, or average rating. Clicking a category opens its Sets view, where you can drill down through topics and subtopics to find exactly the items you want to study.`,

  "nav-geography": `Clicking a category card (here: Geography) opens the Sets view for that subject area. Each card represents a primary topic (rank-1 keyword) — for example Capitals, Physical Geography, or Flags. The breadcrumb at the top shows your current position in the hierarchy and lets you navigate back at any time.`,

  "nav-geography-capitals": `Selecting a primary topic (here: Capitals) shows the available subtopics (rank-2 keywords) for that scope — for example World, Europe, or Americas. These are the deepest navigable buckets in the hierarchy.`,

  "nav-geography-capitals-world": `Selecting a subtopic (here: World) reaches the leaf level and shows the actual quiz items. At this level the view automatically switches from Sets to **List** mode, showing each question, correct answer, and available actions. You can switch between List, Flashcards, and Quiz modes using the mode buttons at the top.`,

  "mode-flashcards": `**Flashcards mode** shows one item at a time as a card. The correct answer is shown first; clicking the card flips it to reveal the question and explanation. Use the arrow controls to move to the next or previous card. This mode is ideal for self-testing with spaced repetition.`,

  "mode-quiz": `**Quiz mode** presents each item as a multiple-choice question with the correct answer shuffled among the incorrect options. After answering, the app reveals whether you were right and shows the explanation. At the end of the set your score is displayed.`,

  // ---- Building your collection ----
  "items-add-to-collection": `Each item in study views includes collection controls. The folder button shows your current active collection, and the **+** button adds that item to it immediately with no confirmation. On list cards the controls sit to the right; in other study modes they appear beneath the item content.`,

  "items-collection-badges": `After adding items to your active collection, those items show a filled collection badge so you can see at a glance what is already included. While an item is already in the active collection, its **+** button is disabled until you remove it or switch to a different active collection.`,

  "items-collection-removed": `Clicking the **minus icon** removes an item from your active collection immediately. The filled collection badge disappears and the **+** button becomes available again, so you can add the item back later if needed.`,

  "active-collection-selector": `Your **active collection** is the collection that receives items when you click **+**. From any item, click the folder button or the active collection name beside it to open **Manage Collections**. There you can create another collection, mark it active with the radio button, and then continue adding items into that newly active collection.`,

  "collection-new": `Click **New collection** to create a second (or third, etc.) collection. Give it a name and an optional description, then save. Once created it appears in your collections list and you can set it as the active collection to start adding items to it.`,

  "collections-mine-two": `After creating a second collection, the **My Collections** tab shows both cards together. Each card shows the collection name, item count, and action icons for edit, active, copy link, and delete. The active collection uses a filled active icon so you can tell where one-click item adds will go.`,

  "keyword-filter": `Items in List mode show their keywords as small tags. Clicking a keyword tag instantly filters the list to show only items that share that tag. This is useful for focusing on a specific sub-topic (for example, only Western-Europe capitals) within a broader scope.`,

  "item-detail": `Clicking the **eye icon** on a list card opens the item detail page. This page shows extra information that is not visible in the regular list, flashcard, or quiz views, such as the full answer block, incorrect options, explanation, source, visibility, created metadata, keywords, and collections.`,

  "item-rating-five-stars": `On the item detail page, signed-in users can rate an item by clicking one of the five stars. The rating saves immediately; clicking the same star again removes your rating. The row also shows the current average rating and total rating count.`,

  "item-comment-added": `From the item detail page, the **Comments** button opens a drawer where you can read existing discussion and post your own note without losing your place. After you type a comment and click **Post Comment**, it appears in the thread right away with your name and timestamp.`,

  // ---- Collections ----
  "collection-detail": `Clicking a collection card opens that collection's study page. The page keeps **Collections** as the active navigation area and shows mode tabs for **List**, **Flashcards**, and **Quiz** so you can study the same collection in different ways. Owners can also remove items or manage which collection is currently active from here.`,

  "collection-detail-flashcards": `Collections support the same **Flashcards** mode as category pages. Each item in the collection is presented as a flip card — answer first, then question and explanation when flipped.`,

  "collection-detail-quiz": `Collections also support **Quiz** mode: each item is shown as a multiple-choice question. This is handy for testing yourself on a curated set of items you have assembled across different categories.`,

  "collection-settings-public": `From **My Collections**, click **Edit collection** on a card to open its settings modal. Turning on **Shared with others** and saving makes the collection public: it appears in Discover and anyone with the shareable link can study it. New collections start private by default.`,

  "collections-mine": `The **My Collections** tab shows all collections you own once the page finishes loading. Each card displays the collection name, description, item count, and sharing state, along with icon actions to edit it, make it active, copy its link, or delete it. You can also create a new collection from this tab.`,

  "collections-discover": `The Discover tab lets anyone browse and search public collections shared by other users. You can filter by text (collection name or description), subject category, primary topic, subtopic, and item tags. Signed-in users can bookmark collections for quick access and rate them with 1–5 stars. You can also open any collection directly by entering its ID.`,

  "collections-discover-public": `Once you make a collection public it immediately appears in the Discover tab alongside the built-in Sample collection. Other users can find it by searching, browse its items, and bookmark it.`,

  "collection-bookmark": `Clicking the **Bookmark** button on a collection card in Discover saves it to your Bookmarked Collections tab. Bookmarks are personal — they do not affect the collection or its owner. The bookmark button toggles: clicking it again removes the bookmark.`,

  "collections-bookmarked": `The **Bookmarked** tab shows all collections you have bookmarked. You can open any of them directly, study their items, or remove the bookmark. This is useful for keeping quick access to public collections you study regularly.`,

  // ---- Adding items ----
  "add-items": `The Add Items hub is the central starting point for creating new quiz content. It provides a Topic and tags block where you choose category, primary topic (rank 1), subtopic (rank 2), and optional extra keywords — the same scope is forwarded to whichever creation method you pick. From here you can open the single-item create form, the AI-assisted Bulk Create flow, or the Study Guide import wizard. If you have an active collection, a banner reminds you that newly created items will be added to it automatically.`,

  "add-items-prepopulated": `When you click the **Add** button while browsing a specific scope in Categories, the Add Items page opens with that scope already filled in: category, primary topic, and subtopic are pre-selected. The first time you visit you will see a brief content compliance notice; after clicking **I understand**, the page stays open with the selected scope ready for you to use.`,

  "add-new-item": `The Create Item form lets you write a single quiz item from scratch. Fill in the question, one correct answer, up to three incorrect answer options, an optional explanation, and a source URL. Category, primary topic, and subtopic are required and must be chosen from the taxonomy. You can add extra keywords. Successfully created items are automatically added to your active collection.`,

  "bulk-create-items": `The Bulk Create page (AI-assisted, no Study Guide) streamlines adding many items at once using an external AI assistant. Choose your category, primary topic, and subtopic; the app generates a structured prompt you copy into any AI tool (e.g. ChatGPT or Claude). Paste the AI response back and the app parses the JSON into a review list where you can accept or reject each item individually before anything is saved to the database.`,

  "bulk-create-prompt": `After choosing your scope and clicking **Generate Prompt**, the app builds a structured prompt asking an AI assistant to produce 10–15 quiz items for that category, primary topic, and subtopic. Copy the prompt text and paste it into ChatGPT, Claude, or any other AI tool.`,

  "bulk-create-paste": `Paste the AI assistant's raw JSON response into the text area and click **Import**. The app validates the JSON structure, checks each item's fields, and builds a review list. Invalid items are flagged; valid ones are ready for you to accept or reject.`,

  "bulk-create-review": `The review screen shows each parsed item as a card — question, correct answer, incorrect options, explanation, source, and any AI-suggested keywords. Click **Accept** to save an individual item (it is added to your active collection immediately) or **Reject** to discard it. **Accept All** saves every valid item at once.`,

  // ---- Study guide import ----
  "study-guide-no-guide": `Navigating to the Study Guide Import wizard before uploading a study guide shows a message prompting you to save a study guide first. Click the link to go to the My Study Guide page and paste your material there.`,

  "study-guide": `The My Study Guide page is a personal text editor where you paste or write the study material you want to turn into quiz items — lecture notes, textbook excerpts, documentation, or any reference text. Your study guide is saved per user and used as the source content for the Study Guide import wizard, which generates targeted questions from it using AI.`,

  "study-guide-content": `With your study guide text pasted in, click **Save**. The content is stored on your account and is now available to the import wizard. You can update or replace it at any time by editing the text and saving again.`,

  "study-guide-import": `The Study Guide import wizard turns your saved study guide text into quiz items in a guided multi-step flow. Select the category, primary topic, subtopic, and optional extra keywords; set the number of prompt sets (1–6); then click **Create prompt sets**.`,

  "study-guide-import-prompts": `After you save a study guide and click **Create prompt sets**, the wizard splits that saved guide into chunks and generates one AI prompt per chunk. Each prompt card shows the chunk title, its size in bytes, and the full prompt text. Copy each prompt into an AI assistant, then paste the JSON response back into the matching text area and click **Validate JSON**.`,

  "study-guide-import-first-prompt": `A prompt set contains the relevant excerpt from your study guide together with precise instructions for the AI — the exact category, primary topic, subtopic, output format, and field requirements. Paste this into any AI tool to get a structured batch of quiz items back.`,
};

// ---------------------------------------------------------------------------
// Ordered sections
// ---------------------------------------------------------------------------
const sections = [
  {
    title: "Home",
    slugs: ["home"],
  },
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
    slugs: ["about", "feedback"],
  },
];

// Human-readable label for a slug.
function label(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Relative path from the output file to a screenshot.
function relativeScreenshotPath(slug) {
  const abs = path.join(screenshotDir, `${slug}.png`);
  return path.relative(path.dirname(outputFile), abs).replace(/\\/g, "/");
}

// Gather available screenshots.
const available = new Set(
  fs.existsSync(screenshotDir)
    ? fs
        .readdirSync(screenshotDir)
        .filter((f) => f.endsWith(".png"))
        .map((f) => f.replace(/\.png$/, ""))
    : []
);

const lines = [];

lines.push("# Quizymode User Guide");
lines.push("");
lines.push(
  "This guide provides an overview of the main screens available to signed-in users."
);
lines.push(
  "_Screenshots are generated automatically — run `npx playwright test && node scripts/generate-user-guide.js` from the repo root to refresh them._"
);
lines.push("");

// Table of contents
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

// Sections
for (const section of sections) {
  lines.push(`## ${section.title}`);
  lines.push("");

  for (const slug of section.slugs) {
    if (!available.has(slug)) continue;
    lines.push(`### ${label(slug)}`);
    lines.push("");
    const desc = descriptions[slug];
    if (desc) {
      lines.push(desc);
      lines.push("");
    }
    lines.push(
      `![${label(slug)}](${relativeScreenshotPath(slug)} "${label(slug)}")`
    );
    lines.push("");
  }
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
console.log(`User guide written to ${outputFile}`);
