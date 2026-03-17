# Acceptance Criteria (Given / When / Then)

This document describes the application's behavior as **acceptance criteria** in a concise Given/When/Then form. It is the single source of truth for "how the app should behave" and should be updated whenever features or behavior change.

Criteria are grouped by **feature** (e.g. AC 1.10 Bookmarking collections). Each feature is split into **API** (HTTP, status codes, payloads, authorization) and **UI** (labels, screens, user-visible behavior) so backend and frontend concerns stay separate while related behavior stays together. Sub-items are numbered **AC section.subsection.id** and always state the **Actor** (see below).

---

## Common API conventions

Use these global contracts unless a specific AC explicitly defines a different behavior.

- **Auth and status codes**
  - **401 Unauthorized**: Request requires authentication and the caller is anonymous or token is missing/invalid (e.g. owner-only or user-specific endpoints).
  - **403 Forbidden**: Caller is authenticated but does not have permission to perform the operation on a resource whose existence is not hidden (e.g. admin-only maintenance endpoints).
  - **404 Not Found**: Resource does not exist **or** its existence must not be revealed to this caller (e.g. private collections/items for non-owners).
  - **400 Bad Request**: Validation or contract errors (missing/invalid parameters, malformed body, business-rule violations that are not authorization).
- **Pagination shape**
  - Paged list endpoints return an object with at least: `items` (array), `totalCount` (number), `pageNumber` (number), `pageSize` (number), and may include `hasNext` / `hasPrevious`.
- **Date/time format**
  - All timestamps in APIs are ISO 8601 UTC strings (e.g. `2026-03-15T14:30:00Z`). Clients SHOULD treat them as UTC and convert to local time zones for display.
- **ProblemDetails / error shape**
  - Error responses use RFC 7807-style **ProblemDetails** with fields: `type`, `title`, `status`, `detail`, and optional `errors` (dictionary of field → messages) for validation errors. The HTTP status code matches `status`.
- **Naming conventions**
  - JSON fields use **camelCase** (e.g. `isPublic`, `createdBy`, `pageSize`). Database columns and C# properties may use **PascalCase**, but the wire format follows the JSON naming.
- **Idempotent behavior**
  - **GET**, **HEAD**, and **OPTIONS** are side-effect free.
  - **DELETE** is idempotent: deleting an already-deleted or non-existent resource returns a success status (e.g. 204) without error.
  - **POST/PUT/PATCH** for "toggle" or "upsert" operations (e.g. bookmarking, ratings, user settings) are idempotent per `(user, resource)` pair: repeating the same request leaves state unchanged and returns success.
- **Null vs empty collections**
  - Collection-valued fields and list endpoints return **empty arrays** (`[]`) when there are no items, not `null`. Scalars may be `null` when meaningfully "missing" (e.g. optional description).

---

## Global invariants

These invariants apply everywhere unless explicitly overridden by a feature-specific AC.

- **Active collection uniqueness**
  - An authenticated user who has at least one collection has **exactly one active collection** at any time; APIs and UI that depend on an active collection must not allow a state with multiple active collections.
- **Private collection discoverability**
  - Collections with `IsPublic = false` are **never discoverable** via Discover or other search/browse endpoints; they can only be accessed directly by the owner via authorized endpoints.
- **Category visibility**
  - Categories are always public; there are no private categories. Category lists and navigation are visible to all users; item-level visibility rules still apply within categories.
- **Visibility for anonymous users**
  - Anonymous users **never** see private items or private keywords; all APIs and queries must enforce this rule.
- **Owner access**
  - The owner of a resource always has access to that resource (subject to technical deletion), regardless of `IsPublic` or other sharing flags, unless a specific AC calls out an exception.

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

## Terms / dictionary

Terms used in this document with a specific meaning:

| Term | Definition |
|------|-------------|
| **Active collection** | The single collection the authenticated user has selected for quick "add to collection" / "remove from collection" on item views. Exactly one at a time; the UI uses it for the +/- controls. |
| **Bookmark** (collection) | Saving a collection to "my bookmarks" for quick access. Distinct from ownership; anyone with access to a public collection can bookmark it. |
| **Breadcrumb** | A navigation trail showing the current path (e.g. **Categories** → category name → keyword(s)). Each segment is clickable and takes the user back to that level. On category pages, keyword segments may show descriptions as tooltips. Used to orient the user and allow quick navigation up the hierarchy. |
| **Bucket** | In the Sets view (Categories), a clickable card/cell representing a keyword or category, showing name, item count, and optional description. Clicking navigates deeper or opens the item list. |
| **Default collection** | The collection created automatically for a user (e.g. "Default Collection") when they have none; used as the initial active collection. |
| **Discover** | The feature where anyone can search and browse **public** collections shared by others (IsPublic = true). Results are searchable by collection name, description, or owner name. |
| **Item visibility** | Rules for which items a user sees: **Anonymous** — only non-private items; **Authenticated** — non-private items plus their own private items. Used when listing items by category/keywords or in APIs that filter by visibility. |
| **Item-level keyword** | A keyword that is a tag on items but is **not** in CategoryKeywords with NavigationRank 1 or 2. Can be used as a filter (e.g. in query params) to narrow the item list; does not drive the Sets hierarchy. |
| **Metadata** (e.g. collection) | Summary data for a resource (name, description, owner, item count, IsPublic, etc.) **without** the full list of items. Items are loaded separately (e.g. `GET /items?collectionId=...`). |
| **Navigation keywords** | Keywords linked to a category in the **CategoryKeywords** table with **NavigationRank** 1 or 2. Rank-1 = first level under the category (e.g. "aws"); rank-2 = second level under a rank-1 (e.g. "Solutions Architect Associate" under "aws"), with ParentName set. They drive the Sets view hierarchy and can appear in the URL path. |
| **Path keywords** | Keywords that appear in the URL **path** (e.g. `/categories/certs/aws`). They define the **navigation scope**; the same names are used in API parameters (e.g. `selectedKeywords`). |
| **Private keyword / item** | A keyword or item with IsPrivate = true, CreatedBy = user. Visible only to that user when authenticated; anonymous users do not see them. |
| **Query keywords** | Keywords that appear in the URL **query** (e.g. `?keywords=s3,ec2`). They add an extra filter (AND) to the scope; items must have these keywords in addition to the path/keyword scope. |
| **Public keyword / item** | A keyword or item with IsPrivate = false (or equivalent). Visible to everyone. |
| **Scope** | The **list of items** returned in a given context. Scope is determined by: (1) **Category/keywords** — navigation (path) and optional filters (query, scope filters) on the Categories page; or (2) **Collection** — items in a specific collection. The same scope can be viewed in **List**, **Explore**, or **Quiz** (and in Categories, also **Sets**). |
| **Scope filter** | On the Categories page, filters applied to the current scope to narrow the list (e.g. item type, search text, rating) without changing the category/keyword path. Applied in addition to path and query keywords. |
| **Shared with others** | UI label for a collection with **IsPublic** = true: anyone with the link can view and quiz; the collection appears in Discover. |
| **Slug** | A URL-friendly segment for a **category** name: lowercase, spaces to dashes, special characters removed (e.g. "ACT Math" → `act-math`). Used in the path (e.g. `/categories/act-math`). The frontend resolves the slug back to the canonical category name for API calls. Keyword segments in the path use **keyword names** (URL-encoded), not slugs. |
| **Sets view** | On the Categories page, the view that shows a grid of **buckets** (keywords or categories). Clicking a bucket either navigates deeper (adds a keyword to the path) or, at the leaf, opens the List view for that scope. Collections do not have a Sets view. |
| **User settings** | Per-user key-value preferences persisted in the database (e.g. **PageSize** for default pagination). Only the authenticated user can read or update their own settings. See AC 4.1. |

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
- **AC 1.2.5** [Owner] **Given** I am **authenticated** and on any item view (list, explore, quiz, or study), **when** the page loads, **then** I see controls to **add** the item to my active collection (+), **remove** the item from my active collection (-), and **select or change** my active collection.
- **AC 1.2.6** [Owner] **Given** I am authenticated and use the "select active collection" control (e.g. folder/manage-collections), **when** the list of collections is shown, **then** I see **only collections I own** (same set as `GET /collections`), and selecting one sets it as my active collection.
- **AC 1.2.7** [Anonymous] **Given** I am not authenticated, **when** I am on any item view, **then** I do **not** see the add-to-collection (+), remove-from-collection (-), or select-active-collection controls.
- **AC 1.2.8** [Owner] **Given** I am authenticated and have an active collection, **when** the item is **already in** my active collection, **then** the minus (-) icon is enabled and the plus (+) icon is disabled. **When** the item is **not** in my active collection, **then** the plus (+) icon is enabled and the minus (-) icon is disabled.
- **AC 1.2.9** [Owner] **Given** I am on the Collections page (My collections tab), **when** I use the "Set active" control on a collection card, **then** that collection becomes my active collection (used for add/remove on items); the current active collection is indicated on the card (e.g. checkmark or filled icon).

---

### AC 1.3 Listing my collections

**API**

- **AC 1.3.1** [Owner] **Given** I am authenticated, **when** I call `GET /collections`, **then** the API returns only collections where I am the owner (`CreatedBy` = current user), ordered by creation date (newest first).
- **AC 1.3.2** [Anonymous] **Given** I am not authenticated, **when** I call `GET /collections`, **then** the API returns 401.

**UI**

- **AC 1.3.3** [Owner] **Given** I am on "My collections", **when** the list loads, **then** I see only my collections per API; ordering and empty state follow API behavior.
- **AC 1.3.4** [Owner] **Given** I am on the Collections page (My collections tab), **when** the list loads, **then** each of my collection cards shows: (1) an **Edit** control (e.g. pencil icon) that opens a modal to edit name, description, and "Shared with others"; (2) a **Set active** control that sets this collection as my active collection (current active is indicated); (3) a **Copy link** control that copies the collection URL (e.g. `{origin}/collections/{id}`) to the clipboard.
- **AC 1.3.5** [Owner] **Given** I use the Copy link control on a collection that is **not** public, **when** the link is copied, **then** the UI shows a warning that others cannot open the link until I make the collection public (Edit → Shared with others); I can dismiss the warning.
- **AC 1.3.6** [Owner / Authenticated] **Given** I am on the Collections page (any tab), **when** I select a collection (e.g. by clicking its name on a card), **then** the UI shows a panel with the collection **name**, **description** (if any), and a **View details** control that opens the collection detail page (created by, date, items).

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

- **AC 1.7.3** [Owner] **Given** I am on the collection **detail** page as owner, **when** I edit name, description, or the sharing toggle, **then** the toggle is labeled **"Shared with others"** with clarification (on = anyone with the link can view and quiz; collection appears in Discover); changes are persisted per API.
- **AC 1.7.4** [Owner] **Given** I am on the Collections **list** page (My collections), **when** I use the Edit control on a collection card, **then** a modal opens where I can change name, description, and "Shared with others"; saving persists changes per API and closes the modal.

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

### AC 2.1 Creating and editing items

**UI**

- **AC 2.1.1** [Authenticated] **Given** I am creating or editing an item, **when** I set the category, **then** I can choose a **navigation keyword rank 1** (and optionally **rank 2**) from dropdowns populated for that category; I may select existing keywords or create my own **private** keyword by typing a name. The chosen rank1 and rank2 are sent as item keywords on save; existing selections come from the navigation API; custom names are stored as private keywords.
- **AC 2.1.2** [Authenticated] **Given** I am creating or editing an item as a **regular user (non-admin)**, **when** the item form is shown, **then** I do **not** see inputs for **Factual risk (0–1)** or **Review comments**; the form only shows fields for question, answers, explanation, source, navigation keywords, and simple tags.
- **AC 2.1.3** [Admin] **Given** I am creating or editing an item as an **admin**, **when** the item form is shown, **then** I can see and edit optional **Factual risk (0–1)** and **Review comments** fields, in addition to all fields available to regular users.
- **AC 2.1.4** [Authenticated] **Given** I am creating or editing an item as a **regular user**, **when** I want admins to review my item to make it public, **then** I can toggle a checkbox labeled (or equivalent to) **“Request admin review to make this item public”**; turning it on marks the item as ready for admin review and adds it to the admin review board; turning it off removes it from the review board if it has not been approved yet.

**API**

- **AC 2.1.5** [Authenticated] **Given** I am creating an item via `POST /items`, **when** I include `readyForReview = true` in the request body, **then** the API stores this flag on the item (e.g. `ReadyForReview = true`) while keeping `IsPrivate = true`; only admins can later change the item to non-private.
- **AC 2.1.6** [Authenticated] **Given** I am updating my own item via `PUT /items/{id}`, **when** I include `readyForReview = true` or `false` in the request body, **then** the API updates the stored review flag but does **not** allow me to change `IsPrivate` from true to false unless I am an admin.

### AC 2.2 Add Items hub and Study Guide entrypoint

**UI**

- **AC 2.2.1** [Authenticated] **Given** I am signed in, **when** I click **Add Items** in the main navigation or from the home page, **then** I am taken to the Add Items page at `/items/add`, which shows a hub of options instead of going directly to a specific create form.
- **AC 2.2.2** [Authenticated] **Given** I am on the Add Items page, **when** the page loads, **then** I see a **My Study Guide** option that navigates to `/study-guide` where I can edit my study guide text; there is no separate **Study Guide** entry in the top navigation.
- **AC 2.2.3** [Authenticated] **Given** I am on the Add Items page, **when** I choose **Create a New Item**, **then** I am taken to the single-item create form at `/items/create` and any `category`/`keywords` from the URL are pre-filled in the form.
- **AC 2.2.4** [Authenticated] **Given** I am on the Add Items page and have a study guide, **when** I choose **Create Items from Study Guide**, **then** I am taken to the study guide import wizard at `/study-guide/import` where I can select category, navigation keywords (rank 1 and 2), extra keywords, and import multiple items generated from my study guide.
- **AC 2.2.5** [Authenticated] **Given** I am on the Add Items page and want AI-generated questions without using my study guide, **when** I choose **Bulk Create Items (no Study Guide)**, **then** I am taken to `/items/bulk-create`, where I can copy an AI prompt, ask an AI to generate random questions for the selected category/keywords, paste the resulting JSON array, and create multiple items at once; any `category`/`keywords` in the Add Items URL are forwarded to this page.

### AC 2.2 Admin review board for items

**API**

- **AC 2.2.1** [Admin] **Given** I am an admin, **when** I call `GET /admin/items/review-board`, **then** the API returns only items where the internal flag `ReadyForReview = true`, ordered by creation date (newest first), including question, answers, category, source, factual risk (if any), and review comments (if any).
- **AC 2.2.2** [Admin] **Given** I am an admin, **when** I call `PUT /admin/items/{id}/approval` for an item that is ready for review, **then** the API makes the item **public** (`IsPrivate = false`) and clears the review flag (`ReadyForReview = false`) so it no longer appears in the review board.
- **AC 2.2.3** [Admin] **Given** I am an admin, **when** I call `PUT /admin/items/{id}/rejection` with an optional `reason` in the body for an item that is ready for review, **then** the API keeps the item **private** (`IsPrivate = true`), clears the review flag (`ReadyForReview = false`), and appends a rejection note to `ReviewComments` including the rejection time, the admin identifier, and the optional reason text.

**UI**

- **AC 2.2.4** [Admin] **Given** I am on the Admin review board screen for items, **when** the list loads, **then** I see only items that are marked ready for review (per API), with enough context to decide (question, answers, category, source, factual risk, comments); from this screen I can **approve** an item, which makes it public and removes it from the list, or **reject** an item with an optional free-text reason, which keeps it private, removes it from the list, and stores the rejection note in the item's review comments.

---

## 3. Categories and keywords

Categories are **public only** (there is no private category). Users navigate by category and by **keywords** (e.g. primary topic, subtopic). The same item set can be viewed in **Sets**, **List**, **Explore**, or **Quiz** mode — similar to collection views; the collection view does not have a "Sets" mode. Navigation and all views under Categories (list, sets, list items, explore, quiz) are described in this section.

**URL and slugs:** Category and navigation keywords appear in the UI URL. **Slugs** are used for the category segment: category name is converted to a URL-friendly slug (lowercase, spaces to dashes, special characters removed; e.g. "ACT Math" → `act-math`). The frontend resolves the slug back to the canonical category name (e.g. from `GET /categories`) for API calls. Keyword segments in the path use URL-encoded keyword **names** (not separate slugs). **Navigation keywords** can appear (1) in the **route** as path segments, e.g. `/categories/science/biology`, and (2) in **query** parameters, e.g. `?keywords=s3,ec2`. The same keyword can appear in both route and query; route defines the navigation scope (e.g. category + primary topic), and query adds extra filter (AND semantics). Items returned are those matching the combined scope.

**Actors:** **Anonymous**, **Authenticated** (may see additional private keywords and private items they created), **Admin**. There is no "category owner"; only **Admin** can create/update/delete categories and category keywords.

---

### AC 3.1 Listing categories

**API**

- **AC 3.1.1** [Anyone] **Given** categories exist, **when** I call `GET /categories` with optional `search`, **then** the API returns all **public** categories (name, description, shortDescription, count, averageStars) matching the search on category name; item counts and average ratings consider only items I am allowed to see (anonymous: non-private items; authenticated: non-private items plus my private items). There are no private categories.
- **AC 3.1.2** [Anyone] **Given** I call `GET /categories`, **then** the API returns 200 with a list of categories; no authentication is required.

**UI**

- **AC 3.1.3** [Anyone] **Given** I am on the Categories page at `/categories`, **when** the list loads, **then** I see all public categories per API; I can search by name and sort by name, number of items, or average rating; categories are paginated (e.g. 30 per page) and clicking a category opens the Sets view for that category (e.g. `/categories/{slug}`).

---

### AC 3.2 Category slugs and resolving category from URL

**API**

- **AC 3.2.1** [Anyone] **Given** a category name, **when** the frontend builds a category URL segment, **then** the category is represented by a **slug** (lowercase, spaces to dashes, special characters removed); the API accepts category **name** (e.g. from `GET /categories` or from slug resolution). Resolution from slug to name is done by the frontend by matching the slug against category names (e.g. `categoryNameToSlug(name) === slug`).

**UI**

- **AC 3.2.2** [Anyone] **Given** I open a URL like `/categories/act-math` or `/categories/science/biology`, **when** the page loads, **then** the first path segment after `/categories/` is the category slug; the UI resolves it to the canonical category name and uses that name for all API calls (e.g. `GET /keywords?category=ACT Math`). If the slug does not match any category, the UI shows "Category not found" and a link back to Categories.

---

### AC 3.3 Navigation keywords (route and query)

**What are navigation keywords?** They are **keywords** (from the Keywords table) linked to a **category** in the **CategoryKeywords** table. Each row in CategoryKeywords has: CategoryId, KeywordId, **NavigationRank** (1 or 2), **ParentName** (for rank-2 only), SortRank, Description. **Rank-1** navigation keywords are the first level under a category (e.g. "aws", "azure" under category "Certs"); they have NavigationRank = 1 and no ParentName. **Rank-2** navigation keywords are the second level under a rank-1 keyword (e.g. "Solutions Architect Associate" under "aws"); they have NavigationRank = 2 and ParentName set to the rank-1 keyword name. Keywords that are not in CategoryKeywords with NavigationRank 1 or 2 are **item-level** (tags on items only); they can still be used as filters in the query. The keyword **name** (e.g. "Solutions Architect Associate") comes from the Keywords table and is what appears in the URL and in API parameters.

**Route vs query:** Navigation keywords (and optionally item-level keywords) can appear in the **route** as path segments (e.g. `/categories/certs/aws`) and/or in **query** parameters (e.g. `?keywords=s3,ec2`). Path keywords define the **navigation scope** (category + rank-1, optionally rank-2). Query keywords add an extra **filter** (items must have those keywords too; AND semantics). The same keyword may appear in both route and query; the effective scope is the combination. Everyone can use **public** keywords (Keywords.IsPrivate = false). Authenticated users may also see and use **private** keywords they created (Keywords.IsPrivate = true, CreatedBy = user); behavior may differ slightly for private keywords/items (e.g. counts, visibility).

**API**

- **AC 3.3.1** [Anyone] **Given** I call `GET /keywords?category={categoryName}` with optional `selectedKeywords` (comma-separated), **then** the API returns the next navigation layer (rank-1 or rank-2 keywords) for that category, with item counts and average ratings; only **public** keywords are returned to anonymous users; authenticated users get public keywords plus their own **private** keywords.
- **AC 3.3.2** [Anyone] **Given** I call `GET /items` with `category` and optional `keywords` (comma-separated), **then** the API returns items in that category that have **all** specified keywords (AND semantics); item visibility applies (anonymous: non-private; authenticated: non-private + own private). Keywords in the request can be navigation (rank-1/rank-2) or item-level; same semantics whether the UI sent them from route or query.
- **AC 3.3.3** [Anyone] **Given** a category has a special **"other"** keyword (rank-1), **when** I request keywords or items with keyword "other", **then** "other" represents items in that category with **no** rank-1 navigation keyword assigned; the UI may display it as "Others". "Other" cannot be combined with other keywords in the same scope.

**UI**

- **AC 3.3.4** [Anyone] **Given** I am on the Categories flow, **when** I navigate by category and keywords, **then** the UI URL may include navigation keywords in the **path** (e.g. `/categories/science/biology`) and/or in the **query** (e.g. `?keywords=s3,ec2`); path defines the Sets hierarchy and scope; query adds filter; the same keyword can appear in both. Links and API calls use the resolved category name and the combined keyword set (path + query, deduped).

---

### AC 3.4 Sets view (category + keywords)

**API**

- **AC 3.4.1** [Anyone] **Given** I have a category name and optional selected keywords (path or query), **when** I call `GET /keywords?category={name}&selectedKeywords=...`, **then** the API returns the next level of buckets (rank-1 or rank-2 navigation keywords, or at leaf item-level keywords) with counts and ratings; invalid or inaccessible paths are handled per keyword visibility (e.g. 404 if category not found).

**UI**

- **AC 3.4.2** [Anyone] **Given** I am on a category Sets view (e.g. `/categories/{slug}` or `/categories/{slug}/{kw1}/{kw2}`), **when** the page loads, **then** I see a grid of buckets (keywords or sub-keywords) with names, item counts, and optional descriptions; clicking a bucket either navigates deeper (adds keyword to path) or, at leaf, opens the Items list for that scope. I see a breadcrumb (Categories → category → keyword(s)) and can switch to List, Explore, or Quiz for the same scope.
- **AC 3.4.3** [Anyone] **Given** I am on the Sets view, **when** I use the filter panel and select **"All categories"**, **then** the scope becomes all categories (e.g. slug `all` or `/categories` with view); I can still apply keyword filters (e.g. via query) and see items across all categories that match.
- **AC 3.4.4** [Anyone] **Given** I am on the Sets view and have reached the end of the sets hierarchy (no more buckets; message e.g. "You've reached the end of the sets hierarchy"), **when** the page is shown, **then** the scope secondary bar still shows **Sets | List | Explore | Quiz** with **Sets** selected; the Sets option does not disappear.

---

### AC 3.5 List view (items in category/keywords scope)

**API**

- **AC 3.5.1** [Anyone] **Given** I call `GET /items?category={name}&keywords=...` with pagination, **then** the API returns items in that category that have all given keywords; item visibility and pagination apply; no authentication required for public items.

**UI**

- **AC 3.5.2** [Anyone] **Given** I am viewing items in category/keywords scope (List mode, e.g. `view=items` on the category path), **when** the list loads, **then** I see the same scope as in Sets (category + path keywords + query keywords).
- **AC 3.5.3** [Anyone] **Given** I am in List mode (category/keywords scope), **when** I interact with the list, **then** I can change page size, paginate, and use scope filters (e.g. item type, search, rating).
- **AC 3.5.4** [Authenticated] **Given** I am authenticated and viewing items in category/keywords scope (List mode), **when** the list loads, **then** I see add/remove-from-collection and active-collection controls per AC 1.2.5–1.2.8.
- **AC 3.5.5** [Anyone] **Given** I am in List mode (category/keywords scope), **when** the list is shown, **then** the breadcrumb displays the path (e.g. Categories → category → keyword(s)) with the **item count** in parentheses after it (e.g. "Categories > language > french (5)"); the UI does **not** show a separate "Items" heading or "Items in ..." paragraph below the breadcrumb.

---

### AC 3.6 Explore and Quiz by category/keywords

**API**

- **AC 3.6.1** [Anyone] **Given** I request items by category and keywords (e.g. `GET /items?category=...&keywords=...`), **when** I use those items in Explore or Quiz, **then** the same item set and visibility rules apply; no separate category-specific explore/quiz endpoint is required.

**UI**

- **AC 3.6.2** [Anyone] **Given** I am on the category Sets or List view, **when** I switch to **Explore** or **Quiz**, **then** I am taken to Explore or Quiz for the **current category/keyword scope** (e.g. `/explore/{categorySlug}` or `/explore/{categorySlug}/item/{itemId}` with same scope); the set of items is the same as in List view for that scope. Behavior (one item at a time, navigation, scoring) is the same as for collection-based Explore/Quiz where applicable.
- **AC 3.6.3** [Anyone] **Given** I am on **Explore** or **Quiz** for a **category** scope, **when** I view the scope secondary bar, **then** it shows **Sets | List | Explore | Quiz** (same as on Sets/List); clicking **Sets** navigates back to the Sets view for that scope. For **collection** scope, the bar shows only **List | Explore | Quiz** (no Sets).

---

### AC 3.7 Keyword descriptions (breadcrumb)

**API**

- **AC 3.7.1** [Anyone] **Given** I call `GET /keywords/descriptions?category={name}&keywords=...`, **then** the API returns the description for each keyword in the path (for breadcrumb tooltips); category and keywords use the same resolution as elsewhere.

**UI**

- **AC 3.7.2** [Anyone] **Given** I am on a category page with keywords in the path, **when** the breadcrumb is shown, **then** I can see keyword descriptions (e.g. tooltips) per API where available.

---

### AC 3.8 Admin: categories and keywords (create, update, delete)

**API**

- **AC 3.8.1** [Admin] **Given** I am an admin, **when** I call create/update/delete endpoints for categories or category keywords (e.g. CreateCategory, UpdateCategory, DeleteCategory, CreateCategoryKeyword, UpdateCategoryKeyword, DeleteCategoryKeyword), **then** the API allows the operation; categories remain public.
- **AC 3.8.2** [Authenticated (non-admin)] **Given** I am authenticated but not an admin, **when** I call create/update/delete for categories or category keywords, **then** the API returns 403 Forbidden.
- **AC 3.8.3** [Anonymous] **Given** I am not authenticated, **when** I call those endpoints, **then** the API returns 401.

**UI**

- **AC 3.8.4** [Admin] **Given** I am an admin, **when** I use the Admin Categories / Keywords UI, **then** I can create, update, and delete categories and link keywords to categories (navigation rank, parent, etc.); the UI reflects API rules.

---

### AC 3.9 Filters on the Categories page

On the Categories page (Sets view and List view), a **filter panel** lets the user change the category/keyword scope and apply **scope filters** (item type, search, rating). Filters are reflected in the URL; applying them navigates and updates the **scope**. The panel can be shown or hidden; "Clear All" resets the filter controls.

**Filter panel (show/hide and active state)**

- **AC 3.9.1** [Anyone] **Given** I am on the Categories page in Sets or List view, **when** the page loads, **then** I see a **Filters** section with a control to **Show Filters** or **Hide Filters** that toggles the visibility of the filter controls. When I click **Apply**, the panel closes after navigation.
- **AC 3.9.2** [Anyone] **Given** I am on the Categories page, **when** any filter is in effect (e.g. I am not on "All categories", or I have path/query keywords, or I have scope filters such as item type, search, or rating), **then** the Filters section shows an **Active** indicator and a **Clear All** link. **Clear All** resets all filter controls (category/keyword selection and scope filters) to the default or current-scope state; I can then click **Apply** to update the URL and scope, or change filters and Apply.

**Category and keyword filters (navigation scope)**

- **AC 3.9.3** [Anyone] **Given** the filter panel is visible, **when** I use the filters, **then** I see: (1) a **Category** dropdown (e.g. "All categories" or a specific category), (2) an optional **Primary topic** (rank-1 keyword) control, and (3) an optional **Subtopic** (rank-2 keyword) control, disabled until a primary topic is selected. I can click **Apply** to navigate to the selected category/keyword scope; the URL path and optional query keywords are updated, page is reset to 1, and the panel closes.
- **AC 3.9.4** [Anyone] **Given** I have selected "All categories" in the filter panel and optionally one or more keywords, **when** I click Apply, **then** the scope becomes all categories with those keywords as query filters (e.g. slug `all` or `/categories` with `?keywords=...`); the path does not include category/keyword segments.

**Scope filters (item type, search, rating)**

- **AC 3.9.5** [Anyone] **Given** the filter panel is visible, **when** I add **scope filters**, **then** I can add one or more of: **item type** (e.g. all / public / private), **search** (text), and **rating** (min, max, include unrated, only unrated). Each added scope filter is shown with a remove control. When I click **Apply**, the selected scope filters are reflected in the URL (e.g. `filterType`, `search`, `ratingMin`, `ratingMax`, `ratingUnrated`, `ratingOnlyUnrated`) and applied to the scope. Item type is sent to the items API where supported; search and rating may be applied client-side to the current result set where applicable.
- **AC 3.9.6** [Anyone] **Given** I am on the Categories List view with scope filters applied (e.g. search or rating), **when** the list is loaded, **then** the items shown are narrowed by those filters; pagination applies to the filtered set. Changing or clearing scope filters and applying updates the list accordingly.

**URL and scope**

- **AC 3.9.7** [Anyone] **Given** I have applied filters on the Categories page, **when** the URL is updated, **then** the category/keyword scope is encoded in the path and (for query keywords) in the `keywords` query parameter; scope filter parameters (e.g. `filterType`, `search`, `ratingMin`, `ratingMax`, `ratingUnrated`, `ratingOnlyUnrated`) are encoded in the query. Refreshing or sharing the URL restores the same filter state. When I navigate to a different category/keyword path (e.g. via breadcrumb or bucket), scope filter query parameters may be cleared so the new path has a clean scope unless the UI preserves them.

---

## 4. Users and auth

*(To be expanded: login, registration, profile, etc.)*

---

### AC 4.1 User settings

User settings are key-value pairs stored per user (e.g. **PageSize** for default pagination). Only the authenticated user can read or update their own settings. Other keys may be added over time (e.g. theme, language); validation and defaults are defined per key.

**API**

- **AC 4.1.1** [Authenticated] **Given** I am authenticated, **when** I call `GET /users/settings`, **then** the API returns 200 with a dictionary of my settings (key-value pairs); if I have no settings, an empty dictionary is returned.
- **AC 4.1.2** [Anonymous] **Given** I am not authenticated, **when** I call `GET /users/settings`, **then** the API returns 401.
- **AC 4.1.3** [Authenticated] **Given** I am authenticated, **when** I call `PUT /users/settings` with a JSON body `{ "key": "...", "value": "..." }`, **then** the API upserts that setting for my user (creates if missing, updates if present) and returns 200 with the key, value, and updatedAt. Key and value are required; key max length 100, value max length 500.
- **AC 4.1.4** [Anonymous] **Given** I am not authenticated, **when** I call `PUT /users/settings`, **then** the API returns 401.

**Default pagination (PageSize)**

- **AC 4.1.5** [Authenticated] **Given** I am authenticated, **when** my setting **PageSize** is set (via `PUT /users/settings` with key `"PageSize"` and a string value), **then** that value is used as my default number of items per page where the UI supports it (e.g. Categories list view). If not set, the default is 10. The UI and API may enforce a valid range (e.g. 1–1000); invalid values are clamped or rejected.
- **AC 4.1.6** [Anonymous] **Given** I am not authenticated, **when** I use a page that supports pagination (e.g. Categories items list), **then** the default page size is 10 (no persisted setting).

**UI**

- **AC 4.1.7** [Authenticated] **Given** I am authenticated, **when** I open my profile or settings, **then** I can view and edit my default pagination (PageSize); changes are persisted via `PUT /users/settings` and used on subsequent visits and on pages that take the default (e.g. Categories list when the URL does not specify `pagesize`).
- **AC 4.1.8** [Authenticated] **Given** I am on a page that uses default pagination (e.g. Categories list view), **when** the URL does not specify `pagesize`, **then** my saved PageSize setting is used; if the URL specifies `pagesize`, the URL value takes precedence for that page/session.

---

## 5. Admin

*(To be expanded: admin-only endpoints, review board, etc.)*

### AC 5.1 Admin: per-user study guide settings

**API**

- **AC 5.1.1** [Admin] **Given** I am an admin, **when** I call `GET /admin/users/{id}/settings` for a valid user ID, **then** the API returns 200 with a dictionary of that user's settings (key-value pairs); if the user has no settings, an empty dictionary is returned; if the user does not exist, the API returns 404.
- **AC 5.1.2** [Admin] **Given** I am an admin, **when** I call `PUT /admin/users/{id}/settings` with a JSON body `{ "key": "...", "value": "..." }` for a valid user ID, **then** the API upserts that setting for the specified user (creates if missing, updates if present) and returns 200 with the key, value, and updatedAt; if the user does not exist or the request is invalid, an error is returned (404 or 400).
- **AC 5.1.3** [Admin] **Given** I am an admin and I call `PUT /admin/users/{id}/settings` with key `"StudyGuideMaxBytes"` and a numeric value in the range 0–1,000,000 (as a string), **when** the request succeeds, **then** that value becomes the per-user study guide byte limit for that user; if the setting is absent, the default limit of 51,200 bytes (50 KB) applies.

**UI**

- **AC 5.1.4** [Admin] **Given** I am on the Admin Dashboard, **when** I click **User Settings**, **then** I am taken to an Admin User Settings page where I can enter a user ID, load that user's details, and view their effective study guide limit.
- **AC 5.1.5** [Admin] **Given** I have loaded a user on the Admin User Settings page, **when** I edit the **StudyGuideMaxBytes** value (or leave it blank for default) and click **Save**, **then** the UI calls the admin user-settings API to upsert the `"StudyGuideMaxBytes"` setting for that user; after a successful save, the effective limit (bytes and KB) reflects the new value.

---

## 6. Study guides and import

### AC 6.1 Study guide CRUD and per-user size limit

**API**

- **AC 6.1.1** [Authenticated] **Given** I am authenticated and have no study guide yet, **when** I call `GET /study-guides/current`, **then** the API returns 404 Not Found (no guide exists); the body may be empty or ProblemDetails, and no study guide is created implicitly.
- **AC 6.1.2** [Authenticated] **Given** I am authenticated, **when** I call `PUT /study-guides/current` with a JSON body `{ "title": "...", "contentText": "..." }` whose UTF-8 byte length is at most my **per-user study guide byte limit**, **then** the API upserts my single private study guide (creating it if missing, replacing it if it exists) and returns 200 with `id`, `title`, `sizeBytes`, and `updatedUtc`; `sizeBytes` equals the UTF-8 byte length of `contentText`.
- **AC 6.1.3** [Authenticated] **Given** I try to save a study guide whose `contentText` exceeds my **per-user study guide byte limit**, **when** I call `PUT /study-guides/current`, **then** the API returns 400 Bad Request with a validation error explaining that the limit was exceeded (including the maximum bytes and current size); the previous guide (if any) is left unchanged.
- **AC 6.1.4** [Authenticated] **Given** I have a study guide, **when** I call `DELETE /study-guides/current`, **then** the API deletes my study guide (idempotent) and returns 204 No Content; subsequent `GET /study-guides/current` returns 404 until I create a new one.
- **AC 6.1.5** [Anonymous] **Given** I am not authenticated, **when** I call any of `GET/PUT/DELETE /study-guides/current`, **then** the API returns 401 Unauthorized.

**UI**

- **AC 6.1.6** [Authenticated] **Given** I open the Study Guide screen, **when** the page loads, **then** I see a title input, a large text area for study guide text, preparation instructions, a byte counter and remaining bytes indicator, and Save/Delete/Cancel controls; the byte counter updates as I type, and the Save button is disabled when the content exceeds 100 KB.
- **AC 6.1.7** [Authenticated] **Given** I have a saved study guide, **when** I visit the Study Guide screen, **then** the title and content area are pre-filled with my latest saved values, and clicking **Start import workflow** takes me to the import wizard at `/study-guide/import`.

### AC 6.2 Study guide import session and chunking

**API**

- **AC 6.2.1** [Authenticated] **Given** I have a study guide, **when** I call `POST /study-guides/import/sessions` with a body containing `categoryName` (required), `navigationKeywordPath` (array of zero, one, or two keyword names), optional `defaultKeywords`, and `targetItemsPerChunk` (5–50), **then** the API validates the request, ensures a study guide exists for me, creates a `StudyGuideImportSession` tied to my guide and user, and returns 201 with `sessionId`, `studyGuideId`, `studyGuideTitle`, and `studyGuideSizeBytes`.
- **AC 6.2.2** [Authenticated] **Given** I do not have a study guide saved, **when** I call `POST /study-guides/import/sessions`, **then** the API returns 404 Not Found with an error indicating that no study guide exists.
- **AC 6.2.3** [Authenticated] **Given** I own an import session, **when** I call `POST /study-guides/import/sessions/{id}/generate-chunks`, **then** the API deterministically chunks my study guide text into one or more `StudyGuideChunk` records (target ~8–10 KB, hard max ~14 KB), generates a full prompt string for each chunk, stores them, updates the session status to `ChunksGenerated`, and returns 200 with a list of chunks (id, index, title, sizeBytes).
- **AC 6.2.4** [Authenticated] **Given** I own an import session, **when** I call `GET /study-guides/import/sessions/{id}`, **then** the API returns 200 with session metadata (id, studyGuideId, categoryName, navigationKeywordPath, defaultKeywords, targetItemsPerChunk, status) plus arrays of chunks (including `promptText`), per-chunk prompt results (validation status, messages, parsed JSON string when valid), and (when present) a dedup result summary.
- **AC 6.2.5** [Authenticated] **Given** I am not the owner of the session or the session does not exist, **when** I call `GET` or `POST` on any `study-guides/import/sessions/{id}*` endpoint, **then** the API returns 404 Not Found (session is not visible outside the owner).

**UI**

- **AC 6.2.6** [Authenticated] **Given** I have a study guide and navigate to `/study-guide/import`, **when** the page loads, **then** I see a stepper-style wizard with at least: (1) Session setup (category + navigation + default keywords + target items per chunk), (2) Prompts & chunks, (3) Optional dedup, (4) Final import summary.
- **AC 6.2.7** [Authenticated] **Given** I fill out the session setup form with a category (and optional navigation keywords and default keywords) and click the button to create a session, **when** the request succeeds, **then** I advance to the prompts step and the wizard uses the returned session id for subsequent operations.

### AC 6.3 Prompt copy/paste, validation, and dedup

**API**

- **AC 6.3.1** [Authenticated] **Given** I own an import session with generated chunks, **when** I call `POST /study-guides/import/sessions/{id}/chunks/{chunkIndex}/result` with `{ "rawResponseText": "<AI text>" }`, **then** the API attempts to parse `rawResponseText` as JSON, requires a top-level array of objects, runs item-level validation (question, correctAnswer, incorrectAnswers, explanation, source, factualRisk, reviewComments) using the same rules as bulk add, stores the raw text and the validated JSON string when valid, and returns 200 with `validationStatus` (`Valid` or `Invalid`), validation messages, and the parsed JSON string when valid.
- **AC 6.3.2** [Authenticated] **Given** my chunk response JSON is malformed or fails validation, **when** I call `POST /study-guides/import/sessions/{id}/chunks/{chunkIndex}/result`, **then** the API returns 200 with `validationStatus = "Invalid"`, a non-empty list of human-readable messages, and `parsedItemsJson = null`; the bad response is still stored for audit.
- **AC 6.3.3** [Authenticated] **Given** my session has more than one chunk and at least one validated prompt result, **when** I call `GET /study-guides/import/sessions/{id}`, **then** the response includes a `dedupResult` object with a generated `dedupPromptText` that summarizes all validated questions and instructions for dedup; if no validated results exist yet, `dedupPromptText` may be null.
- **AC 6.3.4** [Authenticated] **Given** I own an import session, **when** I call `POST /study-guides/import/sessions/{id}/dedup-result` with `{ "rawDedupResponseText": "<AI text>" }`, **then** the API validates the JSON array using the same item rules, stores the raw and parsed dedup JSON, and returns `validationStatus` and messages similar to per-chunk validation.

**UI**

- **AC 6.3.5** [Authenticated] **Given** I am on the Prompts step of the import wizard, **when** chunks have been generated, **then** I see one panel per chunk with the chunk title, size, a **Copy prompt** button (copies the full prompt), a textarea to paste the AI JSON response, and a **Validate JSON** button that calls the per-chunk result endpoint and shows a status pill (Validated / Invalid / Not validated) plus any validation messages.
- **AC 6.3.6** [Authenticated] **Given** my session has multiple chunks and at least one validated prompt result, **when** I go to the Dedup step, **then** I see the generated dedup prompt, a **Copy dedup prompt** button, a textarea to paste the deduplicated JSON array, and a **Validate dedup JSON** button; validation results are reflected in the status text and messages.

### AC 6.4 Finalize import

**API**

- **AC 6.4.1** [Authenticated] **Given** I own an import session with either (a) a valid dedup result or (b) one or more valid per-chunk results and no dedup result, **when** I call `POST /study-guides/import/sessions/{id}/finalize`, **then** the API maps the validated JSON items into `AddItemsBulk.Request` payload(s) with `IsPrivate = true`, `Category` = session category, and keywords including the navigation path and any extra keywords, invokes the existing bulk handler, and returns 200 with created/duplicate/failed counts, created item ids, and any error messages.
- **AC 6.4.2** [Authenticated] **Given** I call `POST /study-guides/import/sessions/{id}/finalize` when there are no valid results to import (no valid dedup and no valid per-chunk responses), **when** the request is processed, **then** the API returns 400 Bad Request with a validation error (e.g. `Import.NoItems`) explaining that there are no items to import.

**UI**

- **AC 6.4.3** [Authenticated] **Given** I am on the import wizard and at least one valid result is available, **when** I click **Finalize import**, **then** the wizard calls the finalize endpoint, disables the button while pending, and after a successful response shows a confirmation panel summarizing the import (at minimum: that items were imported as private under the selected category) plus a link or button to navigate back to Categories.

---

## Unclarities / questions for product owner

- **Shareable link vs IsPublic**: Resolved — if a collection is **not** shared with others (IsPublic = false), only the owner can access it by ID or link. When **Shared with others** is on (IsPublic = true), anyone with the link (or who finds it by ID or via Discover) can view and quiz, and the collection appears in Discover. The UI uses the label **"Shared with others"** for this toggle. Users can search or enter a collection ID to open it (see AC 1.9.6).
- **Default collection**: Resolved — at signup the backend creates "Default Collection" and sets it as the user's active collection. If a user has zero collections (e.g. legacy), the first `GET /collections` still creates "Default Collection".
- **Private keyword name collision (TBD)**: When user A adds a **private** keyword "AAA", what should happen when user B wants to add a keyword "AAA" (as private or public)? Options: (1) allow separate private keywords per user (same name, different scope); (2) allow user B to create "AAA" only if it becomes public or is namespaced; (3) other. Current behavior (if any) to be confirmed; A/C assumes everyone can use public keywords and authenticated users see their own private keywords.

---

## Updating this document

When you change application behavior (API contracts, authorization rules, or user-visible flows), update this document so it stays accurate.

- **API vs UI:** Keep **API** (HTTP, status codes, payloads, authorization) and **UI** (labels, screens, controls) in separate subsections under each feature so backend and frontend concerns stay separate.
- **Actors:** Use the standard actors: **Owner**, **Authenticated (non-owner)**, **Admin (non-owner)**, **Anonymous**. State the actor in each AC as `[Actor]`. For Admin (non-owner), use "Same as Authenticated (non-owner) (AC X.Y.Z)" when behavior is the same.
- **Format:** Use **AC section.subsection.id** with Given/When/Then; reference endpoints and status codes in API criteria, and copy/controls in UI criteria.
- **Atomicity:** Aim for **one AC = one verifiable behavior**. Avoid mixing concerns (e.g. do not combine route behavior, API response shape, UI labels, navigation, and error handling in a single AC); instead, split into separate ACs that each test one thing.
- See the Cursor rule "Update acceptance criteria when app behavior changes" for automation hints.
