# Quizymode user guide

Quizymode is a web app for browsing a large public question bank, building your own items, organizing them into **collections**, and studying in several modes (**Sets**, **List**, **Flashcards**, **Quiz**). The live site is [quizymode.com](https://www.quizymode.com/).

**Screenshots:** Add PNG or WebP files under [`images/`](images/) using the filenames listed in [`images/README.md`](images/README.md). The figures below reference those paths; until the files exist, GitHub may show broken image icons.

---

## 1. Home

The home page highlights **Explore Categories** (cards into the taxonomy) and **Featured sets** (curated entry points). You can open **Try Sample Collection** to jump straight into a public collection in quiz mode.

![Home page with hero, category cards, and sample collection CTA](images/01-home.png)

---

## 2. Categories

**Categories** are the top-level way the catalog is organized (for example: sports, science, certifications). Pick a category, then narrow down with **keywords** (two levels in the UI: primary and secondary topics, plus optional extra tags depending on scope).

From the categories view you can:

- Drill from broad domain → subtopic → items.
- Use **Sets** when there are child buckets to open (sub-groupings).
- Switch to **List**, **Flashcards**, or **Quiz** for the same scope (see [§5](#5-study-modes-sets--list--flashcards--quiz)).
- Add items to **collections** from the item row when signed in.

![Categories page showing topic navigation and mode tabs](images/02-categories.png)

**Tip:** Paths look like `/categories/{category}` and may include keyword segments—for example `/categories/sports/tennis/grand-slams`—so links are bookmarkable.

---

## 3. Collections

**Collections** are your own named sets of items (plus any collection someone shared with you by link, depending on product rules). Use them to group exam chapters, class units, or anything you want to revisit as one deck.

- **Collections** in the nav lists collections you **created** (signed in).
- Open a collection to see its items, metadata, and shortcuts into **Explore** (flashcards) / **Quiz** for that collection only.
- Anyone with a **link** can typically open a collection’s study URLs (`/explore/collections/...`, `/quiz/collections/...`) even without owning it—see product docs for visibility edge cases.

![Collections list or collection detail with study actions](images/03-collections.png)

---

## 4. Add Items (signed in)

**Add Items** is the hub for contributing questions. After you sign in, it appears in the main nav. From here you typically:

- Choose **category** and **keyword scope** so new items land in the right place in the taxonomy.
- Jump to **create a single item**, **bulk create** (many items at once), or **upload** into a collection, depending on what you need.

![Add Items hub with scope selection and links to create or bulk add](images/04-add-items-hub.png)

Creating or editing an item usually involves the question text, answers, explanations, and visibility (public vs private) according to your role and moderation rules.

---

## 5. Study modes: Sets | List | Flashcards | Quiz

On category and collection study screens, a **mode switcher** lets you view the **same scope** in four ways:

| Mode | Purpose |
|------|--------|
| **Sets** | When the current scope has **child buckets**, this mode shows those sub-groups so you can drill in without leaving the topic. |
| **List** | Scan items in a **table-style list**—good for skimming, sorting mentally, or managing which cards to open. |
| **Flashcards** | **Explore** mode: step through items like flashcards (question-focused study, move at your own pace). |
| **Quiz** | **Assess** yourself: answer under quiz rules for that flow (client-side scoring in the browser). |

![Mode switcher showing Sets, List, Flashcards, and Quiz](images/05-mode-switcher.png)

![Flashcards (explore) view for one item](images/06-flashcards.png)

![Quiz mode view](images/07-quiz.png)

---

## 6. All items (`/items`)

The **Items** area lists quiz items (with filters depending on auth and API). Use it when you want a **flat catalog-style browse** rather than starting from Categories.

![Items list page](images/08-items.png)

---

## 7. Item detail

Opening a single item shows full question content, answers, ratings/comments where enabled, and actions such as **edit** (if allowed) or **open in Explore/Quiz** from that card.

![Item detail page](images/09-item-detail.png)

---

## 8. Study guide import (signed in)

**Study guide** lets you paste long-form notes; the product can help turn structured text into private practice material (limits and behavior are defined in the app). Reach it from the UI where linked (for example `/study-guide` and import flows).

![Study guide editor or import flow](images/10-study-guide.png)

---

## 9. Account and admin

- **Sign in / Sign up** use the app’s authentication (AWS Cognito in production). Some routes require a signed-in user.
- **Profile** is available from the user menu when signed in.
- **Admin** appears only for administrator accounts and leads to operational tools (review board, audit logs, etc.)—not covered in detail here.

![Signed-in header with user menu](images/11-nav-signed-in.png)

---

## 10. Where to learn more

- **Developers:** Repository [README](../../README.md) (local dev, API overview, deployment).
- **Operations:** `docs/` includes Cognito, Grafana, and other setup guides.

If something in the app disagrees with this guide, trust the **running product** and file an issue to update this document.
