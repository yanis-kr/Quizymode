# Quizymode Mobile User Guide

This guide mirrors the main signed-in Quizymode walkthrough on a phone-sized screen, highlighting mobile navigation, stacked layouts, and full-screen overlays.
_Screenshots are generated automatically - run `npx playwright test --project=screenshots --project=screenshots-mobile && node scripts/generate-user-guide.js --all` from the repo root to refresh both guides._

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

On mobile, the home page keeps the same hero and discovery content but compresses it into a narrow, scroll-first layout. The primary navigation moves behind the hamburger menu, so the screen emphasizes the category cards, featured sets, and footer actions rather than the full desktop nav bar.

![Home](screenshots/mobile/home.png "Home")

## Browsing the Taxonomy

### Categories

The Categories page keeps the same search and sort tools on mobile, but the controls stack vertically and the results fill the screen one card at a time. This makes category browsing feel more like a feed, with each tap moving deeper into the taxonomy.

![Categories](screenshots/mobile/categories.png "Categories")

### Nav Geography

On mobile, opening Geography keeps the breadcrumb trail but the topic cards stack and wrap to fit the narrow screen. The focus shifts to one tap target at a time, which makes drilling into the taxonomy easier with a thumb.

![Nav Geography](screenshots/mobile/nav-geography.png "Nav Geography")

### Nav Geography Capitals

At the subtopic level, mobile keeps the same hierarchy but presents the choices in a tighter stacked grid. You still navigate by tapping a subtopic card, but the layout is optimized for narrow-width browsing.

![Nav Geography Capitals](screenshots/mobile/nav-geography-capitals.png "Nav Geography Capitals")

### Mode Flashcards

On mobile, flashcards stay focused on one item at a time, with the card taking most of the viewport. Navigation controls sit close to the card so you can flip and advance without leaving the screen.

![Mode Flashcards](screenshots/mobile/mode-flashcards.png "Mode Flashcards")

### Mode Quiz

Quiz mode on mobile keeps the same multiple-choice flow, but the question, answers, and progress stack vertically for easier thumb interaction. The layout prioritizes answer selection and feedback without requiring sideways scanning.

![Mode Quiz](screenshots/mobile/mode-quiz.png "Mode Quiz")

## Building Your Collection

### Collection New

Creating a new collection on mobile uses the same form fields, but the modal stacks vertically and fills more of the screen. This keeps the create flow readable without relying on a wide dialog.

![Collection New](screenshots/mobile/collection-new.png "Collection New")

### Collections Mine Two

With multiple collections on mobile, the **My Collections** view turns into a vertical stack of cards. Actions remain on each card, but the layout favors readable summaries over wide side-by-side tiles.

![Collections Mine Two](screenshots/mobile/collections-mine-two.png "Collections Mine Two")

### Keyword Filter

Keyword filtering still works with one tap on mobile, though the tag row may wrap into multiple lines. That compressed layout helps keep filtering available even in narrow list views.

![Keyword Filter](screenshots/mobile/keyword-filter.png "Keyword Filter")

### Item Detail

The item detail page on mobile shows the same information as desktop, but the sections stack into a single-column reading flow. This makes long answer, explanation, and metadata blocks easier to scan vertically.

![Item Detail](screenshots/mobile/item-detail.png "Item Detail")

### Item Rating Five Stars

Rating on mobile keeps the same immediate-save behavior, but the stars are placed in a tighter row within the stacked item detail layout. The interaction remains quick and touch-friendly.

![Item Rating Five Stars](screenshots/mobile/item-rating-five-stars.png "Item Rating Five Stars")

### Item Comment Added

On mobile, the comments experience opens as a full-screen overlay rather than a side drawer. You can read and post comments without navigating away, while still keeping the focus entirely on the discussion thread.

![Item Comment Added](screenshots/mobile/item-comment-added.png "Item Comment Added")

## Collections

### Collections Mine

The **My Collections** tab uses the same data on mobile, but each collection becomes a full-width card in a vertical list. This makes the page easier to browse without shrinking controls or metadata too aggressively.

![Collections Mine](screenshots/mobile/collections-mine.png "Collections Mine")

### Collection Detail

A collection's study page keeps the same modes on mobile, but the controls wrap and the content flows vertically. The screen is optimized for reading and swiping through one collection at a time.

![Collection Detail](screenshots/mobile/collection-detail.png "Collection Detail")

### Collection Detail Flashcards

Collection flashcards on mobile keep the answer-first card interaction, but the card and navigation controls dominate the viewport. This makes the study session feel more like a dedicated handheld practice mode.

![Collection Detail Flashcards](screenshots/mobile/collection-detail-flashcards.png "Collection Detail Flashcards")

### Collection Detail Quiz

Collection quiz mode keeps the same scoring and answer flow on mobile, with content stacked for touch interaction. The narrow layout preserves focus on the current question instead of surrounding chrome.

![Collection Detail Quiz](screenshots/mobile/collection-detail-quiz.png "Collection Detail Quiz")

### Collection Settings Public

Collection settings on mobile use the same fields and sharing toggle, but the edit dialog is more vertically arranged. That keeps the sharing workflow usable without a desktop-width modal.

![Collection Settings Public](screenshots/mobile/collection-settings-public.png "Collection Settings Public")

### Collections Discover Public

Discover still shows newly public collections on mobile, but the browse experience becomes a vertical stream of cards. Search and filtering stay available while the card layout remains easy to read on small screens.

![Collections Discover Public](screenshots/mobile/collections-discover-public.png "Collections Discover Public")

### Collection Bookmark

Bookmarking a public collection works the same on mobile with a single tap, and the card updates in place. The interaction stays lightweight even in the compact Discover layout.

![Collection Bookmark](screenshots/mobile/collection-bookmark.png "Collection Bookmark")

### Collections Bookmarked

Bookmarked collections are shown as a mobile-friendly stacked list. You can open or remove bookmarks directly from the narrow card layout.

![Collections Bookmarked](screenshots/mobile/collections-bookmarked.png "Collections Bookmarked")

## Adding Items

### Add Items

The Add Items hub keeps the same branching workflow on mobile, but the scope controls, notices, and action buttons stack into a single-column layout. This makes the create options easier to scan on a phone.

![Add Items](screenshots/mobile/add-items.png "Add Items")

### Add Items Prepopulated

When Add Items opens from a scoped category on mobile, the same category and keyword selections are pre-filled. The difference is mostly layout: the scope controls and compliance notice stack for narrow screens.

![Add Items Prepopulated](screenshots/mobile/add-items-prepopulated.png "Add Items Prepopulated")

### Add New Item

The Create Item form becomes a long, single-column form on mobile, with fields and actions stacked top to bottom. This keeps every required input accessible without shrinking the form controls.

![Add New Item](screenshots/mobile/add-new-item.png "Add New Item")

### Bulk Create Items

The Bulk Create entry screen uses the same workflow on mobile, but the scope controls and helper text stack vertically. That makes the AI-assisted flow easier to follow on a handheld screen.

![Bulk Create Items](screenshots/mobile/bulk-create-items.png "Bulk Create Items")

### Bulk Create Prompt

The generated AI prompt remains the same on mobile, but the prompt area and surrounding controls are compressed into a narrower reading column. Expect more vertical scrolling when reviewing or copying the prompt.

![Bulk Create Prompt](screenshots/mobile/bulk-create-prompt.png "Bulk Create Prompt")

### Bulk Create Paste

Pasting the AI response on mobile keeps the same validation workflow, with the large textarea and import action arranged for a narrow screen. The stacked layout makes the JSON review flow workable without desktop width.

![Bulk Create Paste](screenshots/mobile/bulk-create-paste.png "Bulk Create Paste")

### Bulk Create Review

The review step on mobile turns each parsed item into a tall stacked card. Accept and reject actions remain available per item, but the layout favors vertical scanning instead of wide comparisons.

![Bulk Create Review](screenshots/mobile/bulk-create-review.png "Bulk Create Review")

## Study Guide Import

### Study Guide No Guide

If you open Study Guide Import on mobile before saving a guide, the same empty-state prompt appears in a narrow, centered layout. The next action still sends you to the study guide editor first.

![Study Guide No Guide](screenshots/mobile/study-guide-no-guide.png "Study Guide No Guide")

### Study Guide

The study guide editor on mobile keeps the same personal note-taking workflow, but the title, editor, and actions stack into a tall single-column screen. This makes longer study material easier to edit in place.

![Study Guide](screenshots/mobile/study-guide.png "Study Guide")

### Study Guide Content

After saving study guide content on mobile, the editor remains in the same stacked reading and editing flow. You can keep refining the text without leaving the page.

![Study Guide Content](screenshots/mobile/study-guide-content.png "Study Guide Content")

### Study Guide Import

The import wizard keeps the same guided flow on mobile, but each setup control and step section stacks vertically. This preserves the multi-step workflow while fitting the full setup onto a phone screen.

![Study Guide Import](screenshots/mobile/study-guide-import.png "Study Guide Import")

### Study Guide Import Prompts

Prompt cards in the import wizard become tall mobile panels showing the chunk details, prompt text, response box, and validation actions in one vertical flow. This makes the workflow slower to scan than desktop, but still complete on a phone.

![Study Guide Import Prompts](screenshots/mobile/study-guide-import-prompts.png "Study Guide Import Prompts")

### Study Guide Import First Prompt

On mobile, a single prompt set fills most of the screen as a narrow, scrollable block of instructions and source text. The screenshot highlights how the generated prompt remains usable even when the viewport is constrained.

![Study Guide Import First Prompt](screenshots/mobile/study-guide-import-first-prompt.png "Study Guide Import First Prompt")

## Other Pages

### About

![About](screenshots/mobile/about.png "About")

### Feedback

![Feedback](screenshots/mobile/feedback.png "Feedback")
