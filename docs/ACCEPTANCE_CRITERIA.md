# Acceptance Criteria (Given / When / Then)

This document describes the application's behavior as **acceptance criteria** in a concise Given/When/Then form. It is the single source of truth for "how the app should behave" and should be updated whenever features or behavior change.

Criteria are grouped by **feature** (e.g. AC 1.10 Bookmarking collections). Each feature is split into **API** (HTTP, status codes, payloads, authorization) and **UI** (labels, screens, user-visible behavior) so backend and frontend concerns stay separate while related behavior stays together. Sub-items are numbered **AC section.subsection.id** and always state the **Actor** (see below).

---

## Actors

Acceptance criteria are written per **Actor**. Use these labels consistently:

| Actor | Description |
|-------|-------------|
| **Owner** | The user who created the collection (or resource). |
| **Authenticated (non-owner)** | Signed-in user who is not the owner (and not admin, unless specified). |
| **Admin (non-owner)** | User with admin role who is not the owner. Unless stated otherwise, behavior is the same as **Authenticated (non-owner)**. |
| **Anonymous** | Not signed in. |

Where behavior is the same for "anyone with access" (e.g. public collection), the actor may be stated as **Anyone** (authenticated or anonymous).

---

## 1. Collections

### AC 1.1 Creating a collection

**API**

- **AC 1.1.1** [Owner] **Given** I am authenticated, **when** I call `POST /collections` with name (and optionally **description**, `isPublic`), **then** the API creates a collection with me as `CreatedBy` and returns 201; optional description is stored when provided; `isPublic` defaults to false if omitted.
- **AC 1.1.2** [Anonymous] **Given** I am not authenticated, **when** I call `POST /collections`, **then** the API returns 401.

**UI**

- **AC 1.1.3** [Owner] **Given** I am on an item view (List, Explore, or Quiz) and open the create-collection dialog, **when** I submit with a name (name only; no description or "Shared with others" in this dialog), **then** a new collection is created per API and I can use it (e.g. set as active or add the item); validation reflects API rules (e.g. name required).
- **AC 1.1.4** [Owner] **Given** I am on the Collections page and create a new collection, **when** I submit the form with name (and optionally description and "Shared with others"), **then** the collection is created per API and I am taken to the new collection; validation reflects API rules (e.g. name required, description max length).

---

### AC 1.2 Active collection and default collection

**API**

- **AC 1.2.1** [Owner] **Given** I am authenticated, **when** my user record is created (e.g. first request after signup), **then** the backend may create a collection named "Default Collection" and set `ActiveCollectionId` in my user settings.
- **AC 1.2.2** [Owner] **Given** I am authenticated and have no collections, **when** I call `GET /collections`, **then** the API creates a default collection named "Default Collection" and returns it (so I always have at least one).
- **AC 1.2.3** [Anonymous] **Given** I am not authenticated, **when** I call `GET /collections`, **then** the API returns 401.

**UI**

- **AC 1.2.4** [Owner] **Given** I am authenticated, **when** I use the app, **then** I have exactly one active collection at any time; the UI uses it for "add to collection" / "remove from collection" and for quick switching; if none is set, the frontend can set the first (or default) collection as active.
- **AC 1.2.5** [Owner] **Given** I am **authenticated** and on any item view (list, explore, quiz, or study), **when** the page loads, **then** I see: (1) a control to **add** the item to my active collection (+), (2) a control to **remove** the item from my active collection (-), and (3) a control to **select or change** my active collection. The "select active collection" control (e.g. folder/manage-collections) offers **only collections I own** (same set as `GET /collections`). Add/remove apply to the current item and the currently selected active collection.
- **AC 1.2.6** [Anonymous] **Given** I am not authenticated, **when** I am on any item view, **then** I do **not** see the add-to-collection (+), remove-from-collection (-), or select-active-collection controls.
- **AC 1.2.7** [Owner] **Given** I am authenticated and have an active collection, **when** the item is **already in** my active collection, **then** the minus (-) icon is enabled and the plus (+) icon is disabled. **When** the item is **not** in my active collection, **then** the plus (+) icon is enabled and the minus (-) icon is disabled.

---

### AC 1.3 Listing my collections

**API**

- **AC 1.3.1** [Owner] **Given** I am authenticated, **when** I call `GET /collections`, **then** the API returns only collections where I am the owner (`CreatedBy` = current user), ordered by creation date (newest first).
- **AC 1.3.2** [Anonymous] **Given** I am not authenticated, **when** I call `GET /collections`, **then** the API returns 401.

**UI**

- **AC 1.3.3** [Owner] **Given** I am on "My collections", **when** the list loads, **then** I see only my collections per API; ordering and empty state follow API behavior.

---

### AC 1.4 Viewing a collection by ID (shareable link when public)

**API**

- **AC 1.4.1** [Anyone] **Given** the collection has `IsPublic = true`, **when** anyone (authenticated or anonymous) calls `GET /collections/{id}`, **then** the API returns the collection (name, description, owner, item count, IsPublic) and no login is required.
- **AC 1.4.2** [Authenticated (non-owner)] **Given** the collection has `IsPublic = false` and I am not the owner, **when** I call `GET /collections/{id}`, **then** the API returns 404 (existence not revealed).
- **AC 1.4.3** [Anonymous] **Given** the collection has `IsPublic = false`, **when** I call `GET /collections/{id}` (anonymous), **then** the API returns 404.
- **AC 1.4.4** [Owner] **Given** I am the owner, **when** I call `GET /collections/{id}`, **then** the API returns the collection regardless of IsPublic.
- **AC 1.4.5** [Anyone] **Given** the collection ID does not exist, **when** I call `GET /collections/{id}`, **then** the API returns 404.

**UI**

- **AC 1.4.6** [Anyone] **Given** I have access to the collection (per API rules), **when** I open `/collections/{id}`, **then** I see the collection name, description, item count, and (for owner) edit/delete controls; `GET /collections/{id}` returns **collection metadata only**. The list of items in the collection is loaded via a separate items API (see AC 1.5). When access is denied per API, I see an appropriate error (e.g. not found).

---

### AC 1.5 Items in a collection (list / explore / quiz via shareable link when public)

**Design:** The list of items in a collection is returned by **`GET /items?collectionId={id}`** (not `GET /collections/{id}/items`). One items API with a collection filter keeps the contract simple and matches "items by category"; the same item DTO and pagination apply. Use `GET /collections/{id}` for collection metadata only.

**API**

- **AC 1.5.1** [Anyone] **Given** the collection has `IsPublic = true`, **when** anyone calls `GET /items?collectionId={id}`, **then** the API returns all items in that collection (item-level visibility bypassed).
- **AC 1.5.2** [Authenticated (non-owner)] **Given** the collection has `IsPublic = false` and I am not the owner, **when** I call `GET /items?collectionId={id}`, **then** the API returns 404.
- **AC 1.5.3** [Owner] **Given** I am the owner, **when** I call `GET /items?collectionId={id}`, **then** the API returns all items in that collection.
- **AC 1.5.4** [Anyone] **Given** I request items without `collectionId` (e.g. by category), **when** I call `GET /items`, **then** item visibility applies (anonymous: only non-private; authenticated: own private + non-private).

**UI**

- **AC 1.5.5** [Anyone] **Given** I have access to the collection (per API), **when** I open the collection in the UI and use List, Explore, or Quiz for that collection, **then** I see the collection **metadata** (collection name, description, owner name, date created) and the **list of items** returned by the API; when access is denied, I see an appropriate error. **URL examples:** List mode: **`/collections/{id}`**; Explore mode: **`/explore/collections/{id}`**; Quiz mode: **`/quiz/collections/{id}`**.

---

### AC 1.6 Adding and removing items (owner only)

**API**

- **AC 1.6.1** [Owner] **Given** I am the owner, **when** I call POST add/bulk or DELETE to add/remove items in that collection, **then** the API succeeds (e.g. 200/204).
- **AC 1.6.2** [Authenticated (non-owner)] **Given** I am authenticated but not the owner, **when** I call add/remove for that collection, **then** the API returns 400 with a message that only the collection owner can add or remove items.
- **AC 1.6.3** [Admin (non-owner)] Same as Authenticated (non-owner) (AC 1.6.2).
- **AC 1.6.4** [Anonymous] **Given** I am not authenticated, **when** I call add/remove, **then** the API returns 401.

**UI**

- **AC 1.6.5** [Owner] **Given** I am on a collection I own, **when** I use "add to collection" / "remove from collection", **then** the UI calls the API per above and reflects success or error.
- **AC 1.6.6** [Authenticated (non-owner)] **Given** I am viewing a collection I do not own, **when** the page loads, **then** add/remove controls for that collection are not offered (or are disabled) per API rules.

---

### AC 1.7 Updating a collection (name, description, Shared with others)

**API**

- **AC 1.7.1** [Owner] **Given** I am the owner, **when** I call `PATCH /collections/{id}` with name and/or description and/or `isPublic`, **then** the API updates the collection and returns success.
- **AC 1.7.2** [Authenticated (non-owner)] **Given** I am not the owner, **when** I call `PATCH /collections/{id}`, **then** the API returns 400 Forbidden.

**UI**

- **AC 1.7.3** [Owner] **Given** I am on the collection page as owner, **when** I edit name, description, or the sharing toggle, **then** the toggle is labeled **"Shared with others"** with clarification (on = anyone with the link can view and quiz; collection appears in Discover); changes are persisted per API.

---

### AC 1.8 Deleting a collection

**API**

- **AC 1.8.1** [Owner] **Given** I am the owner, **when** I call `DELETE /collections/{id}`, **then** the API removes the collection and its collection-items and bookmarks.
- **AC 1.8.2** [Authenticated (non-owner)] **Given** I am not the owner, **when** I call `DELETE /collections/{id}`, **then** the API returns 400 Forbidden.

**UI**

- **AC 1.8.3** [Owner] **Given** I am on the collection page as owner, **when** I delete the collection (with confirmation), **then** the UI calls the API and redirects or updates the list on success; errors are shown per API response.

---

### AC 1.9 Discover (collections shared with others)

**API**

- **AC 1.9.1** [Anyone] **Given** collections exist with `IsPublic = true`, **when** anyone calls `GET /collections/discover?q=...`, **then** the API returns those collections matching the search by **collection name**, **collection description**, or **collection owner (user) display name**; pagination applies; if authenticated, bookmark state can be returned.
- **AC 1.9.2** [Anyone] **Given** a collection has `IsPublic = false`, **when** discover is queried, **then** that collection does not appear in the response.
- **AC 1.9.3** [Anyone] **Given** I call discover or view discover results, **when** the API returns public collections from other users, **then** the response **must not include** other users' **email addresses** (e.g. only owner id and/or display name); this prevents email leaking to spammers.

**UI**

- **AC 1.9.4** [Anyone] **Given** I am on Discover, **when** I search, **then** I can search by collection name, description, or owner name; I see only public collections per API; results are paginated and (when signed in) show my bookmark state.
- **AC 1.9.5** [Anyone] **Given** I am viewing Discover results, **when** I see other users' collections, **then** I do **not** see other users' email addresses (only owner display name or identifier as provided by the API); the UI must not display or leak emails.
- **AC 1.9.6** [Anyone] **Given** I have or know a collection ID, **when** I search or enter the collection ID in the UI (e.g. on Discover or an "Open collection by ID" control), **then** I can open that collection at `/collections/{id}`; if it is public or I am the owner, I see metadata and items; otherwise I see an appropriate error. This allows finding a collection by ID without browsing discover.

---

### AC 1.10 Bookmarking collections

**API**

- **AC 1.10.1** [Owner] **Given** I am the owner and can access the collection, **when** I call `POST /collections/{id}/bookmark` or `DELETE /collections/{id}/bookmark`, **then** the API records or removes my bookmark and returns success.
- **AC 1.10.2** [Authenticated (non-owner)] **Given** I am authenticated and can access the collection (e.g. via discover or by opening `/collections/{id}` when public) and I am not the owner, **when** I call bookmark/unbookmark, **then** the API records or removes my bookmark and returns success.
- **AC 1.10.3** [Admin (non-owner)] Same as Authenticated (non-owner) (AC 1.10.2).
- **AC 1.10.4** [Anonymous] **Given** I am not authenticated, **when** I call bookmark or unbookmark, **then** the API returns 401.

**UI**

- **AC 1.10.5** [Owner / Authenticated (non-owner)] **Given** I have access to the collection, **when** I use the bookmark control, **then** the UI calls the API and shows bookmarked state; unbookmark is available per API.

---

### AC 1.11 Collection description

**API**

- **AC 1.11.1** [Owner] **Given** I am the owner, **when** I create or update a collection with an optional `description`, **then** the API stores it; discover search matches by name or description.

**UI**

- **AC 1.11.2** [Owner] **Given** I am creating or editing a collection, **when** I set or clear the description, **then** it is shown on the collection page and used in discover per API.

---

### AC 1.12 Collection ratings

**API**

- **AC 1.12.1** [Owner / Authenticated (non-owner)] **Given** I am authenticated (including owner), **when** I call `POST /collections/{id}/rating` with `{ "stars": 1..5 }`, **then** the API stores at most one rating per user per collection; submitting again updates my rating.
- **AC 1.12.2** [Anyone] **Given** the collection exists, **when** I call `GET /collections/{id}/rating`, **then** the API returns count, average stars, and (if authenticated) my rating (myStars).

**UI**

- **AC 1.12.3** [Anyone] **Given** I am viewing a collection, **when** the page loads, **then** I see rating stats (count, average) per API; if authenticated, I can set or change my rating (1-5 stars) and the UI calls the API.

---

### AC 1.13 Who bookmarked (owner only)

**API**

- **AC 1.13.1** [Owner] **Given** I am the owner, **when** I call `GET /collections/{id}/bookmarks`, **then** the API returns the list of users who bookmarked (userId, name when available, bookmarkedAt).
- **AC 1.13.2** [Authenticated (non-owner)] **Given** I am not the owner, **when** I call `GET /collections/{id}/bookmarks`, **then** the API returns 403 Forbidden.

**UI**

- **AC 1.13.3** [Owner] **Given** I am on the collection page as owner, **when** the page loads, **then** I can see the "Who bookmarked" list (users who found and bookmarked this collection); non-owners do not see this section.

---

## 2. Items

*(To be expanded: create, update, delete, visibility, categories, keywords, ratings, comments, etc.)*

---

## 3. Categories and keywords

*(To be expanded: global vs private categories, navigation keywords, "other" keyword, etc.)*

---

## 4. Users and auth

*(To be expanded: login, registration, profile, settings, etc.)*

---

## 5. Admin

*(To be expanded: admin-only endpoints, review board, etc.)*

---

## Unclarities / questions for product owner

- **Shareable link vs IsPublic**: Resolved — if a collection is **not** shared with others (IsPublic = false), only the owner can access it by ID or link. When **Shared with others** is on (IsPublic = true), anyone with the link (or who finds it by ID or via Discover) can view and quiz, and the collection appears in Discover. The UI uses the label **"Shared with others"** for this toggle. Users can search or enter a collection ID to open it (see AC 1.9.6).
- **Default collection**: Resolved — at signup the backend creates "Default Collection" and sets it as the user's active collection. If a user has zero collections (e.g. legacy), the first `GET /collections` still creates "Default Collection".

---

## Updating this document

When you change application behavior (API contracts, authorization rules, or user-visible flows), update this document so it stays accurate.

- **API vs UI:** Keep **API** (HTTP, status codes, payloads, authorization) and **UI** (labels, screens, controls) in separate subsections under each feature so backend and frontend concerns stay separate.
- **Actors:** Use the standard actors: **Owner**, **Authenticated (non-owner)**, **Admin (non-owner)**, **Anonymous**. State the actor in each AC as `[Actor]`. For Admin (non-owner), use "Same as Authenticated (non-owner) (AC X.Y.Z)" when behavior is the same.
- **Format:** Use **AC section.subsection.id** with Given/When/Then; reference endpoints and status codes in API criteria, and copy/controls in UI criteria.
- See the Cursor rule "Update acceptance criteria when app behavior changes" for automation hints.
