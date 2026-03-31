# Quizymode User Guide

This guide provides an overview of the main screens available to signed-in users.
_Screenshots are generated automatically — run `npx playwright test && node scripts/generate-user-guide.js` from the repo root to refresh them._

## Table of Contents

- [Home](#home)
- [Browsing the Taxonomy](#browsing-the-taxonomy)
- [Building Your Collection](#building-your-collection)
- [Collections](#collections)
- [Adding Items](#adding-items)
- [Study Guide Import](#study-guide-import)
- [Other Pages](#other-pages)

## Home

### Home

The home page is the main entry point for Quizymode. It shows a hero section with a link to a public sample collection you can explore immediately, a grid of subject-area category cards with artwork and descriptions, and a carousel of six featured sets linking directly to specific study scopes. The footer provides access to the User Guide, Feedback, Categories Map, and About from anywhere in the app.

![Home](screenshots/user/home.png "Home")

## Browsing the Taxonomy

### Categories

The Categories page lists all public subject areas available in Quizymode. You can search categories by name and sort by name, number of items, or average rating. Clicking a category opens its Sets view, where you can drill down through topics and subtopics to find exactly the items you want to study.

![Categories](screenshots/user/categories.png "Categories")

### Nav Geography

Clicking a category card (here: Geography) opens the Sets view for that subject area. Each card represents a primary topic (rank-1 keyword) — for example Capitals, Physical Geography, or Flags. The breadcrumb at the top shows your current position in the hierarchy and lets you navigate back at any time.

![Nav Geography](screenshots/user/nav-geography.png "Nav Geography")

### Nav Geography Capitals

Selecting a primary topic (here: Capitals) shows the available subtopics (rank-2 keywords) for that scope — for example World, Europe, or Americas. These are the deepest navigable buckets in the hierarchy.

![Nav Geography Capitals](screenshots/user/nav-geography-capitals.png "Nav Geography Capitals")

### Nav Geography Capitals World

Selecting a subtopic (here: World) reaches the leaf level and shows the actual quiz items. At this level the view automatically switches from Sets to **List** mode, showing each question, correct answer, and available actions. You can switch between List, Flashcards, and Quiz modes using the mode buttons at the top.

![Nav Geography Capitals World](screenshots/user/nav-geography-capitals-world.png "Nav Geography Capitals World")

### Mode Flashcards

**Flashcards mode** shows one item at a time as a card. The **question** is shown face-up; clicking the card flips it to reveal the **correct answer** and **explanation** (if any). Click again to flip back to the question. Use the arrow controls to move to the next or previous card (the card resets to the question). This mode is ideal for self-testing with spaced repetition.

![Mode Flashcards](screenshots/user/mode-flashcards.png "Mode Flashcards")

### Mode Quiz

**Quiz mode** presents each item as a multiple-choice question with the correct answer shuffled among the incorrect options. After answering, the app reveals whether you were right and shows the explanation. At the end of the set your score is displayed.

![Mode Quiz](screenshots/user/mode-quiz.png "Mode Quiz")

## Building Your Collection

### Items Add To Collection

Each item in List mode has a **+** button on the right. Clicking it adds that item to your currently active collection instantly — no confirmation required. The active collection name is shown in the notice banner at the top of the page.

![Items Add To Collection](screenshots/user/items-add-to-collection.png "Items Add To Collection")

### Items Collection Badges

After adding items to your active collection, each added item shows a filled collection indicator (a box icon). This lets you see at a glance which items from the current scope are already in your collection. You can add as many items as you like from the same or different scopes.

![Items Collection Badges](screenshots/user/items-collection-badges.png "Items Collection Badges")

### Items Collection Removed

Clicking the **−** button on an item that is already in your active collection removes it immediately. The collection indicator disappears and the + button returns, so you can re-add it later if needed.

![Items Collection Removed](screenshots/user/items-collection-removed.png "Items Collection Removed")

### Active Collection Selector

Your **active collection** is the collection that receives items when you click +. On the My Collections page you can change your active collection by clicking the "Set as active" button on any collection card. The currently active one is highlighted.

![Active Collection Selector](screenshots/user/active-collection-selector.png "Active Collection Selector")

### Collection New

Click **New collection** to create a second (or third, etc.) collection. Give it a name and an optional description, then save. Once created it appears in your collections list and you can set it as the active collection to start adding items to it.

![Collection New](screenshots/user/collection-new.png "Collection New")

### Collections Mine Two

After creating a second collection your My Collections list shows both. Each card displays the collection name, item count, and whether it is public or private. The active collection is highlighted. You can switch between them at any time.

![Collections Mine Two](screenshots/user/collections-mine-two.png "Collections Mine Two")

### Keyword Filter

Items in List mode show their keywords as small tags. Clicking a keyword tag instantly filters the list to show only items that share that tag. This is useful for focusing on a specific sub-topic (for example, only Western-Europe capitals) within a broader scope.

![Keyword Filter](screenshots/user/keyword-filter.png "Keyword Filter")

## Collections

### Collections Mine

The My Collections tab shows all collections you own. Each card displays the collection name, description, item count, and sharing status. You can set any collection as your active collection (used for the one-click add-to-collection control on item pages), edit name, description, or the "Shared with others" toggle, copy the shareable link, or delete the collection. Creating a new collection is available from this tab.

![Collections Mine](screenshots/user/collections-mine.png "Collections Mine")

### Collection Detail

A collection detail page shows the collection name, description, owner, and the full list of items it contains. You can switch between List, Flashcards, and Quiz modes using the mode buttons. Owners can add or remove items; non-owners with access (public collections) can study and rate but cannot modify.

![Collection Detail](screenshots/user/collection-detail.png "Collection Detail")

### Collection Detail Flashcards

Collections support the same **Flashcards** mode as category pages. Each item in the collection is presented as a flip card — **question** first, then **answer** and **explanation** when flipped.

![Collection Detail Flashcards](screenshots/user/collection-detail-flashcards.png "Collection Detail Flashcards")

### Collection Detail Quiz

Collections also support **Quiz** mode: each item is shown as a multiple-choice question. This is handy for testing yourself on a curated set of items you have assembled across different categories.

![Collection Detail Quiz](screenshots/user/collection-detail-quiz.png "Collection Detail Quiz")

### Collection Settings Public

Every collection has a **Shared with others** toggle in its settings. Turning it on makes the collection public — it will appear in the Discover tab and anyone with the shareable link can study it. The toggle is off by default, keeping new collections private.

![Collection Settings Public](screenshots/user/collection-settings-public.png "Collection Settings Public")

### Collections Discover Public

Once you make a collection public it immediately appears in the Discover tab alongside the built-in Sample collection. Other users can find it by searching, browse its items, and bookmark it.

![Collections Discover Public](screenshots/user/collections-discover-public.png "Collections Discover Public")

### Collection Bookmark

Clicking the **Bookmark** button on a collection card in Discover saves it to your Bookmarked Collections tab. Bookmarks are personal — they do not affect the collection or its owner. The bookmark button toggles: clicking it again removes the bookmark.

![Collection Bookmark](screenshots/user/collection-bookmark.png "Collection Bookmark")

### Collections Bookmarked

The **Bookmarked** tab shows all collections you have bookmarked. You can open any of them directly, study their items, or remove the bookmark. This is useful for keeping quick access to public collections you study regularly.

![Collections Bookmarked](screenshots/user/collections-bookmarked.png "Collections Bookmarked")

## Adding Items

### Add Items

The Add Items hub is the central starting point for creating new quiz content. It provides a Topic and tags block where you choose category, primary topic (rank 1), subtopic (rank 2), and optional extra keywords — the same scope is forwarded to whichever creation method you pick. From here you can open the single-item create form, the AI-assisted Bulk Create flow, or the Study Guide import wizard. If you have an active collection, a banner reminds you that newly created items will be added to it automatically.

![Add Items](screenshots/user/add-items.png "Add Items")

### Add Items Prepopulated

When you click the **Add** button while browsing a specific scope in Categories, the Add Items page opens with that scope already filled in — category, primary topic, and subtopic are pre-selected. You can adjust the scope or proceed straight to creating items. The first time you visit you will see a brief content compliance notice; clicking "I understand" dismisses it permanently.

![Add Items Prepopulated](screenshots/user/add-items-prepopulated.png "Add Items Prepopulated")

### Add New Item

The Create Item form lets you write a single quiz item from scratch. Fill in the question, one correct answer, up to three incorrect answer options, an optional explanation, and a source URL. Category, primary topic, and subtopic are required and must be chosen from the taxonomy. You can add extra keywords. Successfully created items are automatically added to your active collection.

![Add New Item](screenshots/user/add-new-item.png "Add New Item")

### Bulk Create Items

The Bulk Create page (AI-assisted, no Study Guide) streamlines adding many items at once using an external AI assistant. Choose your category, primary topic, and subtopic; the app generates a structured prompt you copy into any AI tool (e.g. ChatGPT or Claude). Paste the AI response back and the app parses the JSON into a review list where you can accept or reject each item individually before anything is saved to the database.

![Bulk Create Items](screenshots/user/bulk-create-items.png "Bulk Create Items")

### Bulk Create Prompt

After choosing your scope and clicking **Generate Prompt**, the app builds a structured prompt asking an AI assistant to produce 10–15 quiz items for that category, primary topic, and subtopic. Copy the prompt text and paste it into ChatGPT, Claude, or any other AI tool.

![Bulk Create Prompt](screenshots/user/bulk-create-prompt.png "Bulk Create Prompt")

### Bulk Create Paste

Paste the AI assistant's raw JSON response into the text area and click **Import**. The app validates the JSON structure, checks each item's fields, and builds a review list. Invalid items are flagged; valid ones are ready for you to accept or reject.

![Bulk Create Paste](screenshots/user/bulk-create-paste.png "Bulk Create Paste")

### Bulk Create Review

The review screen shows each parsed item as a card — question, correct answer, incorrect options, explanation, source, and any AI-suggested keywords. Click **Accept** to save an individual item (it is added to your active collection immediately) or **Reject** to discard it. **Accept All** saves every valid item at once.

![Bulk Create Review](screenshots/user/bulk-create-review.png "Bulk Create Review")

## Study Guide Import

### Study Guide No Guide

Navigating to the Study Guide Import wizard before uploading a study guide shows a message prompting you to save a study guide first. Click the link to go to the My Study Guide page and paste your material there.

![Study Guide No Guide](screenshots/user/study-guide-no-guide.png "Study Guide No Guide")

### Study Guide

The My Study Guide page is a personal text editor where you paste or write the study material you want to turn into quiz items — lecture notes, textbook excerpts, documentation, or any reference text. Your study guide is saved per user and used as the source content for the Study Guide import wizard, which generates targeted questions from it using AI.

![Study Guide](screenshots/user/study-guide.png "Study Guide")

### Study Guide Content

With your study guide text pasted in, click **Save**. The content is stored on your account and is now available to the import wizard. You can update or replace it at any time by editing the text and saving again.

![Study Guide Content](screenshots/user/study-guide-content.png "Study Guide Content")

### Study Guide Import

The Study Guide import wizard turns your saved study guide text into quiz items in a guided multi-step flow. Select the category, primary topic, subtopic, and optional extra keywords; set the number of prompt sets (1–6); then click **Create prompt sets**.

![Study Guide Import](screenshots/user/study-guide-import.png "Study Guide Import")

### Study Guide Import Prompts

The wizard splits your study guide into chunks and generates one AI prompt per chunk. Each prompt card shows the chunk title, its size in bytes, and the full prompt text. Copy each prompt and paste it into an AI assistant, then paste the AI's JSON response back into the corresponding text area and click **Validate JSON**.

![Study Guide Import Prompts](screenshots/user/study-guide-import-prompts.png "Study Guide Import Prompts")

### Study Guide Import First Prompt

A prompt set contains the relevant excerpt from your study guide together with precise instructions for the AI — the exact category, primary topic, subtopic, output format, and field requirements. Paste this into any AI tool to get a structured batch of quiz items back.

![Study Guide Import First Prompt](screenshots/user/study-guide-import-first-prompt.png "Study Guide Import First Prompt")

## Other Pages

### About

![About](screenshots/user/about.png "About")

### Feedback

![Feedback](screenshots/user/feedback.png "Feedback")
