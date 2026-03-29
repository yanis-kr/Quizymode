# Acceptance Criteria (Given / When / Then)

This document describes the application's behavior as **acceptance criteria** in a concise Given/When/Then form. It is the single source of truth for "how the app should behave" and should be updated whenever features or behavior change.

Criteria are grouped by **feature** (e.g. AC 1.10 Bookmarking collections). Each feature is split into **API** (HTTP, status codes, payloads, authorization) and **UI** (labels, screens, user-visible behavior) so backend and frontend concerns stay separate while related behavior stays together. Sub-items are numbered **AC section.subsection.id** and always state the **Actor** (see below).

## Common API conventions

Use these global contracts unless a specific AC explicitly defines a different behavior.

- **Auth and status codes**
  - **401 Unauthorized**: Request requires authentication and the caller is anonymous or token is missing/invalid (e.g. owner-only or user-specific endpoints).
  - **403 Forbidden**: Caller is authenticated but does not have permission to perform the operation on a resource whose existence is not hidden (e.g. admin-only maintenance endpoints).
  - **404 Not Found**: Resource does not exist **or** its existence must not be revealed to this caller (e.g. private collections/items for non-owners).
  - **400 Bad Request**: Validation or contract errors (missing/invalid parameters, malformed body, business-rule violations that are not authorization).
- **Pagination shape**
  - Paged list endpoints return an object with at least: `items` (array), `totalCount` (number), and page metadata. The exact page metadata fields are endpoint-specific today (for example `page` or `pageNumber`, plus `pageSize` and sometimes `totalPages` / `hasNext` / `hasPrevious`).
- **Date/time format**
  - All timestamps in APIs are ISO 8601 UTC strings (e.g. `2026-03-15T14:30:00Z`). Clients SHOULD treat them as UTC and convert to local time zones for display.
- **ProblemDetails / error shape**
  - Most domain and authorization errors use RFC 7807-style **ProblemDetails** with fields such as `type`, `title`, `status`, and `detail`.
  - Some validation failures currently return framework-native validation payloads (for example FluentValidation error arrays) instead of a uniform `ProblemDetails.errors` shape. Feature-specific ACs should call out stricter requirements where they matter.
- **Naming conventions**
  - JSON fields use **camelCase** (e.g. `isPublic`, `createdBy`, `pageSize`). Database columns and C# properties may use **PascalCase**, but the wire format follows the JSON naming.
- **Idempotent behavior**
  - **GET**, **HEAD**, and **OPTIONS** are side-effect free.
  - Some **DELETE** endpoints are idempotent, but this is not yet a universal contract. Unless a feature-specific AC says otherwise, repeated delete of a missing resource may return `404 Not Found`.
  - **POST/PUT/PATCH** for "toggle" or "upsert" operations (e.g. bookmarking, ratings, user settings) are idempotent per `(user, resource)` pair: repeating the same request leaves state unchanged and returns success.
- **Null vs empty collections**
  - Collection-valued fields and list endpoints return **empty arrays** (`[]`) when there are no items, not `null`. Scalars may be `null` when meaningfully "missing" (e.g. optional description).

---

## Global invariants

These invariants apply everywhere unless explicitly overridden by a feature-specific AC.

### Collections

- **Invariant C1 – Active collection uniqueness**
  - An authenticated user who has at least one collection always has **exactly one active collection** at any time. APIs and UI that depend on an active collection must not allow a state with multiple active collections. (See AC 1.2.1–1.2.9.)
- **Invariant C2 – Collection ownership cardinality**
  - A user may own zero or more collections. The system must support the state where a user has no collections yet (e.g. just signed up) as well as multiple collections. (See AC 1.1 and AC 1.2.2.)
- **Invariant C3 – Immutable collection ownership**
  - Collection ownership (`CreatedBy`) is immutable after creation. No API or UI changes the owner of an existing collection; transfer of ownership is not supported.
- **Invariant C4 – Collection deletion cleanup**
  - Deleting a collection removes that collection and all relations that reference it (collection-items and bookmarks). No dangling collection-item or bookmark records remain that reference a deleted collection. (See AC 1.8.1.)
- **Invariant V1 – Private collection access**
  - A collection with `IsPublic = false` is accessible **only to its owner**; non-owners (authenticated or anonymous) receive 404 for direct access by ID and do not see it in Discover. (See AC 1.4.2–1.4.3.)
- **Invariant V2 – Public collection access by ID**
  - A collection with `IsPublic = true` is accessible to **anyone** (authenticated or anonymous) via its ID, subject to standard error handling when the collection does not exist. (See AC 1.4.1 and AC 1.9.6.)
- **Invariant V3 – Discover visibility for collections**
  - Public collections (`IsPublic = true`) may appear in Discover; private collections (`IsPublic = false`) never appear in Discover or other search/browse endpoints. (See AC 1.9.1–1.9.3.)
- **Invariant V4 – Collection-scoped sharing boundary**
  - Making a collection public (`IsPublic = true`) does **not** change the `IsPrivate` flag of any items in that collection. Collections are an explicit sharing boundary: private items may be visible within a shared collection context but remain private and non-discoverable outside that collection.

### Items

- **Invariant I1 – Single item owner**
  - Every item has exactly one owner (`CreatedBy`); ownership of an item cannot be shared or transferred after creation.
- **Invariant I2 – Private items and discovery**
  - Private items (`IsPrivate = true`) are never discoverable through category browsing or search for non-owners. Only the owner can see their own private items in category/keyword scopes; anonymous and authenticated non-owners never see other users’ private items. (See Item visibility in Terms / dictionary and AC 3.3.2, AC 3.5.1.)
- **Invariant I3 – Collection-scoped visibility for items**
  - Items included in a collection that a user can access may be visible within that **collection context** even if they are private, according to collection-scoped visibility rules. This does not make those items globally public or discoverable outside that collection. (See AC 1.5.1 and **Collection-scoped visibility** in Terms / dictionary.)
- **Invariant I4 – Removing items from collections**
  - Removing an item from a collection immediately revokes collection-scoped access to that item for users who only had access via that collection. Subsequent calls to `GET /items?collectionId={id}` must not include the removed item.
- **Invariant I5 – Direct item access**
  - Direct item APIs (e.g. `GET /items/{id}`) follow a strict rule: the owner can always access their own item by ID; anyone else (authenticated or anonymous) can access an item by ID only if the item is public (`IsPrivate = false`). Private items that are only visible via a collection remain inaccessible by direct item ID for non-owners; unauthorized callers receive 404 for direct access. (See AC 2.3.1–2.3.4.)

### Keywords and categories

- **Invariant K1 – Public categories**
  - Categories are always public; there are no private categories. Category lists and navigation are visible to all users; item-level visibility rules still apply within categories. (See AC 3.1.1–3.1.2.)
- **Taxonomy item-tag slugs**
  - Any keyword name listed in a category’s taxonomy definition (`docs/quizymode_taxonomy.yaml`, including every L1 and L2 slug in that category) is treated as a **public** tag when attached to items: the API resolves or creates a non-private keyword (seeded by the taxonomy SQL as seeder-owned) instead of a user-private, review-pending keyword.
- **Invariant K2 – Private navigation keywords**
  - Private navigation or item-level keywords (`IsPrivate = true`, `CreatedBy = user`) are visible only to their creator when authenticated. Anonymous users and other authenticated users never see another user’s private keywords in browsing or search. (See AC 3.3.1 and Terms / dictionary.)
- **Invariant K3 – Keyword-based navigation stability**
  - Keyword slugs and category slugs used in URLs resolve deterministically to a single effective category or keyword in a given scope (public wins over private on name collisions), ensuring that navigation paths consistently represent the same logical scope. (See AC 3.2 and AC 3.3.)

### Access and ownership

- **Invariant A1 – Visibility for anonymous users**
  - Anonymous users never see private keywords, and never see private items except when those items are included in a collection they can access under the collection-scoped visibility rules. All APIs and queries must enforce this rule.
- **Invariant A2 – Owner access**
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
| **Default collection** | The collection created automatically for a user when they have none; when the user's display name is available it uses the first 3 characters for the name (for example `Abc's Collection` for `Abcdefgh`) and `<display name> default collection` as the description; otherwise it falls back to "Default Collection". Used as the initial active collection. |
| **Discover** | The feature where anyone can search and browse **public** collections shared by others (IsPublic = true). Results can be narrowed by **text** (`q`) on collection name and description, and by **item taxonomy**: optional category, up to two **navigation** keyword names (L1/L2, matching item `NavigationKeywordId1` / `NavigationKeywordId2`), and optional **item tag** names (AND on `ItemKeywords`). |
| **Item visibility** | Rules for which items a user sees outside a specific collection context: **Anonymous** — only non-private items; **Authenticated** — non-private items plus their own private items. Used when listing items by category/keywords or in APIs that filter by visibility (e.g. `GET /items` by category); collection-scoped visibility is defined separately. |
| **Item-level keyword** | A keyword that is a tag on items but is **not** used as rank-1 or rank-2 in the **KeywordRelation** tree for that category. Can be used as a filter (e.g. in query params) to narrow the item list; does not drive the Sets hierarchy. |
| **Metadata** (e.g. collection) | Summary data for a resource (name, description, owner, item count, IsPublic, etc.) **without** the full list of items. Items are loaded separately (e.g. `GET /items?collectionId=...`). |
| **Navigation keywords** | Keywords linked in the **KeywordRelation** table per category: **ParentKeywordId** null = root (rank-1, e.g. "aws"); otherwise the keyword is a child of that parent (rank-2, e.g. "Solutions Architect Associate" under "aws"). The same keyword can be a child of multiple parents in the same category. They drive the Sets view hierarchy and can appear in the URL path. Each item has required **NavigationKeywordId1** (rank-1) and **NavigationKeywordId2** (rank-2). |
| **Primary topic (rank 1)** | In Bulk Create and similar flows, the **first** navigation keyword under a category — e.g. the main subject or exam name (e.g. "Spanish", "AWS"). Shown in the UI as "Primary topic" for non-technical users. |
| **Subtopic (rank 2)** | In Bulk Create and similar flows, the **second** navigation keyword under a primary topic — e.g. a specific unit or section (e.g. "Greetings", "Solutions Architect Associate"). Shown in the UI as "Subtopic" for non-technical users. |
| **Bulk Create (AI-assisted)** | Flow on `/items/bulk-create`: user selects category, primary topic (rank-1), **required** subtopic (rank-2), optional extra keywords and collection; the **Topic and tags** block matches single-item create/edit (shared controls). App generates a prompt for an AI assistant (up to 15 questions) that may ask the model for up to five optional extra **keywords** per item; user copies prompt, pastes into AI, pastes response back; items are held in memory and reviewed (reject/accept) before any are saved; on accept, items are saved via bulk API and optionally added to the selected collection. New private keywords are created only on confirm import. |
| **Path keywords** | Keywords that appear in the URL **path** (e.g. `/categories/certs/aws`). They define the **navigation scope**; the same names are used in API parameters (e.g. `selectedKeywords`). |
| **Private item** | An item marked private (`IsPrivate = true`) that is hidden from general discovery flows, including category browsing, search, and direct access by users who do not otherwise have permission. If a private item is included in a collection that a user can access, that user may view and use the item **within the context of that collection only** (collection-scoped visibility); the item remains non-discoverable outside that collection. |
| **Private keyword** | A keyword with `IsPrivate = true`, `CreatedBy = user`. Visible only to that user when authenticated; anonymous users do not see it. |
| **Query keywords** | Keywords that appear in the URL **query** (e.g. `?keywords=s3,ec2`). They add an extra filter (AND) to the scope; items must have these keywords in addition to the path/keyword scope. |
| **Public keyword / item** | A keyword or item with `IsPrivate = false` (or equivalent). Visible to everyone in general discovery flows (category browsing, search) and via direct item access where allowed by API rules. |
| **Scope** | The **list of items** returned in a given context. Scope is determined by: (1) **Category/keywords** — navigation (path) and optional filters (query, scope filters) on the Categories page; or (2) **Collection** — items in a specific collection (collection-scoped visibility). The same scope can be viewed in **List Items**, **Flashcards**, or **Quiz** (and in Categories, also **Sets**). |
| **Scope filter** | On the Categories page, filters applied to the current scope to narrow the list (e.g. item type, search text, rating) without changing the category/keyword path. Applied in addition to path and query keywords. |
| **Seed set** | A logical source-controlled manifest of repo-managed items identified by a string such as `core-public-items`. Seed sync operates within one seed set at a time. |
| **Seed-managed item** | A public item whose content is controlled by the admin seed-sync process and tracked with stable metadata such as `SeedId`, `SeedSet`, `SeedHash`, and last-sync time. |
| **Shared with others** | UI label for a collection with **IsPublic** = true: anyone with the link can view and quiz; the collection appears in Discover. |
| **Slug** | A URL-friendly segment for a **category or navigation keyword** name: lowercase, spaces to dashes, special characters removed (e.g. "ACT Math" → `act-math`, "World Records" → `world-records`). Used in the path (e.g. `/categories/act-math/world-records`). The frontend resolves the category slug back to the canonical category name for API calls; keyword segments are treated as keyword **slugs** and are resolved on the backend. |
| **Sets view** | On the Categories page, the view that shows a grid of **buckets** (keywords or categories). Clicking a bucket either navigates deeper (adds a keyword to the path) or, at the leaf, opens the List view for that scope. Collections do not have a Sets view. |
| **User settings** | Per-user key-value preferences persisted in the database (e.g. **PageSize** for default pagination). Only the authenticated user can read or update their own settings. See AC 4.7. |
| **Collection-scoped visibility** | Visibility rules when viewing items through a specific collection. When a user can access a collection, the collection items API returns all items in that collection that are visible through the collection access rules, including private items shared through that collection. Those private items remain non-discoverable outside that collection context and are not treated as globally public or searchable items. |

---

## 1. Collections

### AC 1.1 Creating a collection

**API**

- **AC 1.1.1** [Owner] **Given** I am authenticated, **when** I call `POST /collections` with name (and optionally **description**, `isPublic`), **then** the API creates a collection with me as `CreatedBy` and returns 201; optional description is stored when provided; `isPublic` defaults to false if omitted.
- **AC 1.1.2** [Anonymous] **Given** I am not authenticated, **when** I call `POST /collections`, **then** the API returns 401.

**UI**

- **AC 1.1.3** [Owner] **Given** I am on an item view (List Items, Flashcards, or Quiz) and open the create-collection dialog, **when** I submit with a name (name only; no description or "Shared with others" in this dialog), **then** a new collection is created per API and I can use it (e.g. set as active or add the item); validation reflects API rules (e.g. name required).
- **AC 1.1.4** [Owner] **Given** I am on the Collections page and create a new collection, **when** I submit the form with name (and optionally description and "Shared with others"), **then** the collection is created per API and I am taken to the new collection; validation reflects API rules (e.g. name required, description max length).

---

### AC 1.2 Active collection and default collection

**API**

- **AC 1.2.1** [Owner] **Given** I am authenticated, **when** my user record is created (e.g. first request after signup), **then** the backend may create a default collection using the user's display name: name = first 3 characters + `'s Collection` (for example `Abc's Collection` for `Abcdefgh`) and description = `<display name> default collection`; if no display name is available it falls back to "Default Collection". The backend sets `ActiveCollectionId` in my user settings.
- **AC 1.2.2** [Owner] **Given** I am authenticated and have no collections, **when** I call `GET /collections`, **then** the API creates and returns that same default collection shape (so I always have at least one).
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
- **AC 1.3.7** [Anonymous] **Given** I am not signed in, **when** I open `/collections`, **then** I can use **Discover**; **Mine** and **Bookmarked** are disabled until I sign in; I do not see create-collection or other owner-only actions on this page; Discover supports category, L1/L2, item tags, text search, and open-by-ID; collection ratings on cards are **read-only** and bookmark controls are not offered until I sign in.

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

### AC 1.5 Items in a collection (List Items / Flashcards / Quiz via shareable link when public)

**Design:** The list of items in a collection is returned by **`GET /items?collectionId={id}`** (not `GET /collections/{id}/items`). One items API with a collection filter keeps the contract simple and matches "items by category"; the same item DTO and pagination apply. Use `GET /collections/{id}` for collection metadata only.

**API**

- **AC 1.5.1** [Anyone] **Given** the collection has `IsPublic = true`, **when** anyone calls `GET /items?collectionId={id}`, **then** the API returns all items in that collection according to **collection-scoped visibility**, including private items that the owner has placed in that collection; those private items remain non-discoverable outside that collection and are not treated as globally public items.
- **AC 1.5.2** [Authenticated (non-owner)] **Given** the collection has `IsPublic = false` and I am not the owner, **when** I call `GET /items?collectionId={id}`, **then** the API returns 404.
- **AC 1.5.3** [Owner] **Given** I am the owner, **when** I call `GET /items?collectionId={id}`, **then** the API returns all items in that collection.
- **AC 1.5.4** [Anyone] **Given** I request items without `collectionId` (e.g. by category), **when** I call `GET /items`, **then** item visibility applies (anonymous: only non-private; authenticated: own private + non-private).

**UI**

- **AC 1.5.5** [Anyone] **Given** I have access to the collection (per API), **when** I open the collection in the UI and use List Items, Flashcards, or Quiz for that collection, **then** I see the collection **metadata** (collection name, description, owner name, date created) and the **list of items** returned by the API; when access is denied, I see an appropriate error. **URL examples:** List Items mode: **`/collections/{id}`**; Flashcards mode: **`/explore/collections/{id}`**; Quiz mode: **`/quiz/collections/{id}`**.
- **AC 1.5.6** [Anyone] **Given** I am reviewing or using items within a collection in List Items, Flashcards, or Quiz modes, **when** the UI loads items for that collection, **then** it calls `GET /items?collectionId={id}` using the collection ID from the URL (not direct per-item lookups) so that private items and their private keywords included in that collection are visible per collection-scoped visibility rules.
- **AC 1.5.7** [Anyone] **Given** I open an item's details screen from a collection List Items, Flashcards, or Quiz view, **when** I use the back control on the item-details screen, **then** I return to the same collection URL I came from (including the current item, current view, and query-string scope) so my place in the collection flow is preserved; for Quiz this includes restoring the current item's revealed / answered state when that session state is still available.

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

- **AC 1.9.1** [Anyone] **Given** collections exist with `IsPublic = true`, **when** anyone calls `GET /collections/discover` with optional `q`, `page`, `pageSize`, **then** the API returns matching public collections paginated; if `q` is set, the collection's **name** or **description** must match (case-insensitive contains); if authenticated, bookmark state can be returned per collection.
- **AC 1.9.1a** [Anyone] **Given** I call `GET /collections/discover` with optional `category` (category name), optional `keywords` (comma-separated, 0–2 **navigation** keyword names, requires `category`), and optional `tags` (comma-separated item tag names, AND semantics on item keywords), **then** only public collections that contain **at least one item** satisfying **all** supplied item filters are included; when `q` is also set, the collection must match **both** the text filter and the item filters. Unknown category (for filters) yields no matches; unknown tag name yields no matches; `keywords` without `category` returns **400**.
- **AC 1.9.1b** [Anyone] **Given** I pass `category` and one or two `keywords`, **when** the path is not valid for that category (same rules as item navigation), **then** the API returns **400** with a validation-style error.
- **AC 1.9.2** [Anyone] **Given** a collection has `IsPublic = false`, **when** discover is queried, **then** that collection does not appear in the response.
- **AC 1.9.3** [Anyone] **Given** I call discover or view discover results, **when** the API returns public collections from other users, **then** the response **must not include** other users' **email addresses** (e.g. only owner id and/or display name); this prevents email leaking to spammers.

**UI**

- **AC 1.9.4** [Anyone] **Given** I am on Discover, **when** I use text search and optional filters (category, L1/L2, item tags), **then** results match the API; I see only public collections; results are paginated; when signed in I see my bookmark state and can bookmark or unbookmark.
- **AC 1.9.5** [Anyone] **Given** I am viewing Discover results, **when** I see other users' collections, **then** I do **not** see other users' email addresses (only owner display name or identifier as provided by the API); the UI must not display or leak emails.
- **AC 1.9.6** [Anyone] **Given** I have or know a collection ID, **when** I search or enter the collection ID in the UI (e.g. on Discover or an "Open collection by ID" control), **then** I can open that collection at `/collections/{id}`; if it is public or I am the owner, I see metadata and items; otherwise I see an appropriate error. This allows finding a collection by ID without browsing discover.
- **AC 1.9.7** [Anyone] **Given** I am not signed in, **when** I use the main site navigation, **then** I still see **Collections** and can open the Collections page to use Discover (see AC 1.3.7).

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
- **AC 1.12.4** [Anonymous] **Given** I am viewing a collection rating UI that is read-only because I am not signed in (for example a Discover collection card or a collection study header), **when** I hover the stars, **then** I see a hint that signed-in users can rate the collection.

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

- **AC 2.1.1** [Authenticated] **Given** I am creating or editing an item, **when** I use the form, **then** I see a single **Topic and tags** section containing **Category** *, **Primary topic (rank 1)** *, **Subtopic (rank 2)** *, and **Additional keywords** (optional). I must choose category, primary topic, and subtopic from values returned by **`GET /taxonomy`** for that category (required L1/L2 path); navigation is not free-typed. **Additional keywords** may include picks from the taxonomy flat list and optional free text; non-taxonomy extras are persisted as **private pending** per API rules (AC 3.10.4). The chosen rank1 and rank2 are sent as `navigationKeyword1` and `navigationKeyword2` and stored as **NavigationKeywordId1** and **NavigationKeywordId2**; they are included in item keywords on save.
- **AC 2.1.2** [Authenticated] **Given** I am creating or editing an item as a **regular user (non-admin)**, **when** the item form is shown, **then** I do **not** see inputs for **Factual risk (0–1)** or **Review comments**; the form only shows fields for question, answers, explanation, source, navigation keywords, and simple tags.
- **AC 2.1.3** [Admin] **Given** I am creating or editing an item as an **admin**, **when** the item form is shown, **then** I can see and edit optional **Factual risk (0–1)** and **Review comments** fields, in addition to all fields available to regular users.
- **AC 2.1.4** [Authenticated] **Given** I am creating or editing an item as a **regular user**, **when** I want admins to review my item to make it public, **then** I can toggle a checkbox labeled (or equivalent to) **“Request admin review to make this item public”**; turning it on marks the item as ready for admin review and adds it to the admin review board; turning it off removes it from the review board if it has not been approved yet.

**API**

- **AC 2.1.5** [Authenticated] **Given** I am creating an item via `POST /items`, **when** I include `readyForReview = true` in the request body, **then** the API stores this flag on the item (e.g. `ReadyForReview = true`) while keeping `IsPrivate = true`; only admins can later change the item to non-private.
- **AC 2.1.6** [Authenticated] **Given** I am updating my own item via `PUT /items/{id}`, **when** I include `readyForReview = true` or `false` in the request body, **then** the API updates the stored review flag but does **not** allow me to change `IsPrivate` from true to false unless I am an admin.

### AC 2.2 Add Items hub and Study Guide entrypoint

**UI**

- **AC 2.2.1** [Authenticated] **Given** I am signed in, **when** I click **Add Items** in the main navigation or from the home page, **then** I am taken to the Add Items page at `/items/add`, which shows a hub of options instead of going directly to a specific create form. The hub includes a **Topic and tags** block (category, primary topic rank 1, subtopic rank 2, optional comma-separated additional keywords) that matches the single-item create flow; changing these fields updates the page URL (`category` and `keywords` query params, where `keywords` is rank1, rank2, then extras). I can bookmark or share `/items/add?...` and the same scope is used when I open **Create a New Item**, **Bulk Create Items**, or **Create Items from Study Guide**.
- **AC 2.2.2** [Authenticated] **Given** I am on the Add Items page, **when** the page loads, **then** I see a **My Study Guide** option that navigates to `/study-guide` where I can edit my study guide text; there is no separate **Study Guide** entry in the top navigation.
- **AC 2.2.3** [Authenticated] **Given** I am on the Add Items page, **when** I choose **Create a New Item**, **then** I am taken to the single-item create form at `/items/create` and any `category`/`keywords` from the URL are pre-filled in the form.
- **AC 2.2.4** [Authenticated] **Given** I am on the Add Items page and have a study guide, **when** I choose **Create Items from Study Guide**, **then** I am taken to the study guide import wizard at `/study-guide/import` where I can select category, navigation keywords (rank 1 and 2), extra keywords, and import multiple items generated from my study guide.
- **AC 2.2.5** [Authenticated] **Given** I am on the Add Items page and want AI-generated questions without using my study guide, **when** I choose **Bulk Create Items (no Study Guide)**, **then** I am taken to `/items/bulk-create` where the Bulk Create (AI-assisted) flow applies (see AC 2.2.6); any `category`/`keywords` in the Add Items URL are forwarded to this page.

### AC 2.2.6 Bulk Create Items (AI-assisted, no Study Guide)

**Design:** The user selects category, navigation keywords (rank 1 and rank 2), optional extra keywords, and optionally a collection. The app generates a prompt for any AI assistant (e.g. ChatGPT, Claude) **asking for up to 15 questions**; if the AI returns more, the app accepts all returned items up to the **API hard limit** (e.g. 1,000 for admins, 100 for regular users). The user copies the prompt, pastes it into an AI assistant, then pastes the AI response back. Parsed items are kept **in memory** (not saved to the database) until the user reviews and accepts them. On accept, items are saved via the existing bulk API; if a collection was selected, accepted items are also added to that collection. New **private keywords** (and private navigation keywords) chosen during setup are only created when the user confirms import (accept/accept all), not when generating the prompt. When the user pastes back the AI response: **category** — items whose category is invalid (e.g. does not match the selected category) are rejected; **keywords** — if rank-1/rank-2 or regular keywords in the response are not in the existing list, they are added as **new private keywords** (subject to keyword format rules).

**Data source:** Taxonomy structure for category and L1/L2 navigation comes from **`GET /taxonomy`** (cached for the session). Category and Sets browse still use **`GET /categories`** and **`GET /keywords`** where needed, while **Categories Map** may use count-bearing taxonomy data for the full tree. The user's collections come from **`GET /collections`**. The UI should use cached data (e.g. React Query or equivalent) so taxonomy-backed dropdowns minimize round trips.

**UI – Setup (category, keywords, collection)**

- **AC 2.2.6.1** [Authenticated] **Given** I am on the Bulk Create page at `/items/bulk-create`, **when** the page loads, **then** I see a **Category** dropdown (required) populated from the categories list (from cache/API). I can select a category. Any `category`/`keywords` from the URL are pre-filled.
- **AC 2.2.6.2** [Authenticated] **Given** I have selected a category, **when** the page shows keyword controls inside the **Topic and tags** section, **then** I see **Primary topic (rank 1)** and **Subtopic (rank 2)** as **required** fields (same pattern as single-item create/edit), with a short explanation that both narrow where items appear. Options are populated from **`GET /taxonomy`** for that category (L1 list; L2 list when an L1 is selected), using cached data where available. I cannot generate a prompt or save bulk items without both rank-1 and rank-2 that form a valid taxonomy path.
- **AC 2.2.6.3** [Authenticated] **Given** I use the Bulk Create page, **when** I need navigation topics, **then** I must pick both primary topic and subtopic from the taxonomy-backed lists; arbitrary typed L1/L2 navigation is not supported (navigation must match seeded public relations). I may still add **additional** free-text keywords that the API will treat as private pending when not in taxonomy (see AC 3.10.4).
- **AC 2.2.6.4** [Authenticated] **Given** I am on the Bulk Create page, **when** I add or type **additional keywords** (extra tags for the items), **then** the UI suggests existing keywords (e.g. from the same category or my private keywords) as I type; suggestions are based on cached/API data. These are included in the generated prompt and, on import, attached to each accepted item; new private keywords in this list are only created on confirm import.
- **AC 2.2.6.5** [Authenticated] **Given** I am on the Bulk Create page, **when** I complete the setup, **then** I can optionally select a **collection** (from my collections, same as `GET /collections`) where accepted items will be added by default. If I select a collection, it is used when I later accept or accept-all items.

**UI – Generate prompt and copy/paste**

- **AC 2.2.6.6** [Authenticated] **Given** I have selected category and at least primary topic (rank 1), **when** I click **Generate Prompt**, **then** the app shows an optimized prompt text for **any AI assistant** (e.g. ChatGPT, Claude). The prompt asks for up to **15 questions** in JSON (category, question, correctAnswer, incorrectAnswers, optional explanation and source), and asks the model to optionally include up to **five** extra **keywords** per item (slug-style tags) that do not duplicate my navigation topic or my comma-separated extra tags; the prompt wording refers to "your AI assistant" or "any AI assistant", not a specific product. The category and keywords I selected are baked into the prompt so the AI generates items for that scope.
- **AC 2.2.6.7** [Authenticated] **Given** the generated prompt is visible, **when** I use the **Copy prompt** (or equivalent) control, **then** the full prompt is copied to the clipboard so I can paste it into an AI assistant. The UI gives a short instruction: copy this prompt, paste it into your AI assistant, then paste the AI’s response back into the app.
- **AC 2.2.6.8** [Authenticated] **Given** I have pasted the AI response into the "Paste AI response" (or similar) area and trigger import (e.g. "Import" or "Parse"), **then** the app parses the text as a JSON array of items. Parsed items are **not** saved to the database yet; they are stored **in memory** only. I am taken to a **review** view.

**UI – Review and accept/reject**

- **AC 2.2.6.9** [Authenticated] **Given** I have imported a response and am on the review view, **when** the list is shown, **then** I see each parsed item (question, correct answer, incorrect answers, explanation if any) with **Reject** and **Accept** actions per item, and **Reject all** and **Accept all** actions. For **tags**, each row shows one consolidated list: my setup navigation topics and optional extra keywords, plus any AI-suggested per-item keywords (case-insensitive duplicates removed; same order as applied on save). Reject (or Reject all) removes the item(s) from the in-memory list and does not save them. Accept (or Accept all) saves the item(s) to the database via the existing bulk-create API, with category and keywords (navigation + extra + per-item AI keywords that passed format checks) and private flag as chosen in setup; if I had selected a collection, the accepted items are also added to that collection (e.g. via the existing collection bulk-add API).
- **AC 2.2.6.10** [Authenticated] **Given** I had entered one or more **new private keywords** (additional non-taxonomy tags) during setup, **when** I confirm import by clicking **Accept** or **Accept all**, **then** those new private keywords are created (or resolved) as part of the bulk save; they are not created when I only generate or copy the prompt.

**API**

- **AC 2.2.6.11** [Authenticated] **Given** I confirm accepted items from the Bulk Create review step, **when** the frontend calls the existing `POST /items/bulk` (and, if a collection was selected, the collection bulk-add API), **then** the request includes non-empty **keyword1** and **keyword2** (rank-1 and rank-2); the API rejects bulk requests with a missing subtopic. Items are created with the chosen category, those navigation keywords, extra keywords, and `IsPrivate` (regular users can only create private items; admins may choose). New private keyword names sent in the bulk request are created or resolved per existing item/keyword rules.

**Validation of new private keywords (API or shared rules)**

- **AC 2.2.6.12** [Authenticated] **Given** I submit a bulk create that includes a **new private keyword** (name not yet in the system for my user), **when** the backend validates the keyword name, **then** it must be **alphanumeric and may contain hyphens** as separators (no spaces or special characters); invalid names are rejected with a validation error. Same rules apply if the UI validates custom keywords before allowing "Generate Prompt" or "Accept"; the source of truth for persistence is the API.
- **AC 2.2.6.13** [Authenticated] **Given** I enter a new keyword in the Bulk Create flow (custom primary topic, subtopic, or additional keyword), **when** that keyword is created on confirm import, **then** the backend stores it with **Name** and **Slug** both set from my input (Slug = slugified form of the name). An **admin** can later update the keyword's **Name** and **Slug** independently (e.g. via admin keyword management).
- **AC 2.2.6.14** [Authenticated] **Given** I have pasted the AI response and the app parses it, **when** an item has a **category** that is invalid (e.g. does not match the category I selected for this bulk create), **then** that item is **rejected** (excluded from the review list or marked invalid and not saveable). When an item contains **keywords** (rank-1, rank-2, or regular) that are not in the existing keyword list, **then** those keywords are **added as new private keywords** when I accept the item, provided they pass format rules; items are not rejected solely because they contain new keyword names.
- **AC 2.2.6.15** [Authenticated] **Given** the AI returns optional **keywords** on items, **when** the app parses the response, **then** it keeps at most **five** keywords per item that match the allowed keyword format, deduplicates case-insensitively, and drops keywords that duplicate my navigation topics or my setup **additional keywords**; invalid or duplicate suggestions are silently omitted. On save, retained keywords are merged with navigation and extra keywords per item like other bulk item keywords.

### AC 2.2 Admin review board for items

**API**

- **AC 2.2.1** [Admin] **Given** I am an admin, **when** I call `GET /admin/items/review-board`, **then** the API returns only items where the internal flag `ReadyForReview = true`, ordered by creation date (newest first), including question, answers, category, source, factual risk (if any), and review comments (if any).
- **AC 2.2.2** [Admin] **Given** I am an admin, **when** I call `PUT /admin/items/{id}/approval` for an item that is ready for review, **then** the API makes the item **public** (`IsPrivate = false`) and clears the review flag (`ReadyForReview = false`) so it no longer appears in the review board.
- **AC 2.2.3** [Admin] **Given** I am an admin, **when** I call `PUT /admin/items/{id}/rejection` with an optional `reason` in the body for an item that is ready for review, **then** the API keeps the item **private** (`IsPrivate = true`), clears the review flag (`ReadyForReview = false`), and appends a rejection note to `ReviewComments` including the rejection time, the admin identifier, and the optional reason text.

**UI**

- **AC 2.2.4** [Admin] **Given** I am on the Admin review board screen for items, **when** the list loads, **then** I see only items that are marked ready for review (per API), with enough context to decide (question, answers, category, source, factual risk, comments); from this screen I can **approve** an item, which makes it public and removes it from the list, or **reject** an item with an optional free-text reason, which keeps it private, removes it from the list, and stores the rejection note in the item's review comments.

### AC 2.3 Direct item access by ID

**API**

- **AC 2.3.1** [Owner] **Given** I am the owner of an item, **when** I call `GET /items/{id}`, **then** the API returns the item regardless of `IsPrivate`.
- **AC 2.3.2** [Anyone] **Given** an item exists with `IsPrivate = false`, **when** I call `GET /items/{id}`, **then** the API returns the item (subject to standard status codes for validation or deletion).
- **AC 2.3.3** [Authenticated (non-owner) / Anonymous] **Given** an item exists with `IsPrivate = true` and I am not the owner, **when** I call `GET /items/{id}`, **then** the API returns 404 (the item is not directly accessible outside collections it belongs to, even if it appears in a collection I can access).
- **AC 2.3.4** [Anyone] **Given** the item ID does not exist (or has been hard-deleted), **when** I call `GET /items/{id}`, **then** the API returns 404.

**UI**

- **AC 2.3.5** [Anyone] **Given** I open an item detail page that uses a direct item route (e.g. `/items/{id}`), **when** the page loads, **then** the UI expects the item to be either public or owned by me; items that are only visible through a collection I can access are surfaced via the collection-based routes and APIs (e.g. `/collections/{collectionId}` with `GET /items?collectionId={collectionId}`), not via direct item URLs.

---

## 3. Categories and keywords

Categories are **public only** (there is no private category). Users navigate by category and by **keywords** (e.g. primary topic, subtopic). The same item set can be viewed in **Sets**, **List**, **Explore**, or **Quiz** mode — similar to collection views; the collection view does not have a "Sets" mode. Navigation and all views under Categories (list, sets, list items, explore, quiz) are described in this section.

**URL and slugs:** Category and navigation keywords appear in the UI URL. **Slugs** are used for the category segment **and** for navigation keywords: names are converted to a URL-friendly slug (lowercase, spaces to dashes, special characters removed; e.g. "ACT Math" → `act-math`, "World Records" → `world-records`). The frontend resolves the category slug back to the canonical category name (e.g. from `GET /categories`) for API calls. Keyword segments in the path use keyword **slugs**; the backend resolves those slugs to canonical keyword names and IDs. **Navigation keywords** can appear (1) in the **route** as path segments, e.g. `/categories/science/world-records`, and (2) in **query** parameters, e.g. `?keywords=s3,ec2`. The same keyword can appear in both route and query; route defines the navigation scope (e.g. category + primary topic), and query adds extra filter (AND semantics). Items returned are those matching the combined scope.

**Actors:** **Anonymous**, **Authenticated** (may see additional private keywords and private items they created), **Admin**. There is no "category owner"; only **Admin** can create/update/delete categories and keyword relations (navigation structure).

---

### AC 3.0 Home page

**API**

- **AC 3.0.1** [Anyone] **Given** the home page is loaded and `GET /categories` succeeds, **when** the UI renders the category card grid on `/`, **then** each home-page category card may show the live item count from the categories API for its matching category slug; if the API fails or is unavailable, the page still renders without those counts.
- **AC 3.0.2** [Anyone] **Given** the application database has been seeded, **when** anyone opens the home-page sample collection link, **then** it resolves to a fixed public collection of exactly five public fun-trivia items seeded specifically for the home-page demo flow.

**UI**

- **AC 3.0.3** [Anyone] **Given** I open `/`, **when** the page loads, **then** Quizymode itself is the home page (not a separate marketing landing page), and the primary navigation includes a **Home** link to `/`.
- **AC 3.0.4** [Anyone] **Given** I am on the home page, **when** the hero section is shown, **then** I see a clear call to browse categories and a link to the public sample collection used as a starter/demo collection.
- **AC 3.0.5** [Anyone] **Given** I am on the home page, **when** the category section loads, **then** I see a static grid of category boxes with image artwork and descriptions that are bundled with the frontend and do not depend on the database being available; clicking a category box opens `/categories/{categorySlug}`.
- **AC 3.0.6** [Anyone] **Given** I am on the home page below the categories section, **when** I view featured content, **then** I see a horizontal carousel of six featured sets; each card links directly to a concrete category scope path (for example `/categories/exams/aws/saa-c03`) and can be opened without additional filtering steps.
- **AC 3.0.7** [Anyone] **Given** I am anywhere in the SPA, **when** the shared page chrome is visible, **then** I see a footer with a **Feedback** action, a **Categories Map** action, and an **About** action; **About** opens `/about`.
- **AC 3.0.8** [Anyone] **Given** I activate the footer **Feedback** action, **when** the dialog opens, **then** I can choose among **Report issue**, **Ask for more items**, and **Provide feedback** inside a single shared feedback dialog rather than via three separate footer buttons.
- **AC 3.0.9** [Anyone] **Given** the shared feedback dialog is open, **when** I view the form, **then** the current page URL is shown in a read-only field, email is optional, and the email field is pre-filled from the signed-in user's email when available but can be cleared for anonymous submission; the **Ask for more items** flow also shows an optional **Additional keywords** field.
- **AC 3.0.10** [Anyone] **Given** I open `/feedback`, **when** the page loads, **then** I see three feedback entry cards for **Report an issue**, **Ask for more items**, and **Provide feedback**, and choosing any card opens the same shared feedback dialog with that type preselected.

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

**What are navigation keywords?** They are **keywords** (from the Keywords table) linked per category in the **KeywordRelation** table. Each row has: CategoryId, **ParentKeywordId** (null = root/rank-1), **ChildKeywordId**, SortOrder, Description. **Rank-1** = relations with ParentKeywordId null (e.g. "aws", "azure" under category "Certs"). **Rank-2** = relations with ParentKeywordId set to a rank-1 keyword ID (e.g. "Solutions Architect Associate" under "aws"); the same child keyword can appear under multiple parents in the same category. Keywords that are not a child in any KeywordRelation for that category are **item-level** (tags on items only); they can still be used as filters. Each **item** has required **NavigationKeywordId1** (rank-1) and **NavigationKeywordId2** (rank-2). The keyword **name** comes from the Keywords table and is what appears in API parameters; the URL path uses the **keyword slug**, which the backend resolves to the canonical name and ID.

**Route vs query:** Navigation keywords (and optionally item-level keywords) can appear in the **route** as path segments (keyword slugs, e.g. `/categories/certs/aws`) and/or in **query** parameters (e.g. `?keywords=s3,ec2`). Path keywords define the **navigation scope** (category + rank-1, optionally rank-2). Query keywords add an extra **filter** (items must have those keywords too; AND semantics). The same keyword may appear in both route and query; the effective scope is the combination. Everyone can use **public** keywords (Keywords.IsPrivate = false). Authenticated users may also see and use **private** keywords they created (Keywords.IsPrivate = true, CreatedBy = user); when a public and a private keyword share the same slug/name, the **public** keyword wins and the private one is only used when no public match exists.

**API**

- **AC 3.3.1** [Anyone] **Given** I call `GET /keywords?category={categoryName}` with optional `selectedKeywords` (comma-separated), **then** the API returns the next navigation layer (rank-1 or rank-2 keywords) for that category, with item counts and average ratings; only **public** keywords are returned to anonymous users; authenticated users get public keywords plus their own **private** keywords.
- **AC 3.3.1b** [Anyone] **Given** I call `GET /keywords/item-tags?category={categoryName}`, **then** the API returns sorted distinct keyword names that appear as item-level tags (`ItemKeywords`) on at least one item in that category that is visible to me, and only keyword names I am allowed to see (public keywords, or my private keywords); **404** if the category does not exist or is not accessible. The web app caches this list per category for create/edit item autocomplete (prefix match, limited rows in the dropdown).
- **AC 3.3.2** [Anyone] **Given** I call `GET /items` with `category` and optional `keywords` (comma-separated), **then** the API returns items in that category that have **all** specified keywords (AND semantics); item visibility applies (anonymous: non-private; authenticated: non-private + own private). Keywords in the request can be navigation (rank-1/rank-2) or item-level; same semantics whether the UI sent them from route or query.
- **AC 3.3.3** [Anyone] **Given** a category has a special **"other"** keyword (rank-1), **when** I request keywords or items with keyword "other", **then** "other" represents items in that category whose **NavigationKeywordId1** is null or not in the set of root child keyword IDs for that category; the UI may display it as "Others". "Other" cannot be combined with other keywords in the same scope.

**UI**

- **AC 3.3.4** [Anyone] **Given** I am on the Categories flow, **when** I navigate by category and keywords, **then** the UI URL may include navigation keywords in the **path** (e.g. `/categories/science/biology`) and/or in the **query** (e.g. `?keywords=s3,ec2`); path defines the Sets hierarchy and scope; query adds filter; the same keyword can appear in both. Links and API calls use the resolved category name and the combined keyword set (path + query, deduped).

---

### AC 3.4 Sets view (category + keywords)

**API**

- **AC 3.4.1** [Anyone] **Given** I have a category name and optional selected keywords (path or query), **when** I call `GET /keywords?category={name}&selectedKeywords=...`, **then** the API returns the next level of buckets (rank-1 or rank-2 navigation keywords, or at leaf item-level keywords) with counts and ratings; invalid or inaccessible paths are handled per keyword visibility (e.g. 404 if category not found).

**UI**

- **AC 3.4.2** [Anyone] **Given** I am on a category Sets view (e.g. `/categories/{slug}` or `/categories/{slug}/{kw1}/{kw2}`), **when** the page loads, **then** I see a grid of buckets (keywords or sub-keywords) with names, item counts, and optional descriptions; clicking a bucket either navigates deeper (adds keyword to path) or, at leaf, opens the List Items view for that scope. I see a breadcrumb (Categories → category → keyword(s)) and can switch to List Items, Flashcards, or Quiz for the same scope. [Authenticated] **Given** I am signed in, **when** I am on that Sets view, **then** I see an **Add** control on the **right side of the scope secondary bar** (same row as Sets | List Items | …) that navigates to `/items/add` with `category` and `keywords` pre-filled from the current navigation path and any `keywords` query filters (path first, then query extras, deduped case-insensitively).
- **AC 3.4.3** [Anyone] **Given** I am on the Sets view, **when** I use the filter panel and select **"All categories"**, **then** the scope becomes all categories (e.g. slug `all` or `/categories` with view); I can still apply keyword filters (e.g. via query) and see items across all categories that match.
- **AC 3.4.4** [Anyone] **Given** I am on the Sets view and have reached the end of the sets hierarchy (no more buckets; message e.g. "You've reached the end of the sets hierarchy"), **when** the page is shown, **then** leaf scopes follow **AC 3.4.4a**; otherwise the scope secondary bar still shows **Sets | List Items | Flashcards | Quiz** with **Sets** selected.
- **AC 3.4.4a** [Anyone] **Given** I open a leaf category scope that has no child buckets (for example a category plus rank-2 keyword such as `/categories/exams/act/math`, or any scope whose next-level buckets are empty), **when** the page loads, **then** the UI defaults to **List Items** for that scope instead of showing an empty Sets screen, and the scope secondary bar omits **Sets** and shows only **List Items | Flashcards | Quiz**.
- **AC 3.4.4b** [Anyone] **Given** I am on a non-leaf category Sets view, **when** the page is shown, **then** the breadcrumb row at the top shows the current scope path with the current scope item count in parentheses, and any short guidance is shown as a compact hint rather than as a separate large heading block.

---

### AC 3.5 List Items view (items in category/keywords scope)

**API**

- **AC 3.5.1** [Anyone] **Given** I call `GET /items?category={name}&keywords=...` with pagination, **then** the API returns items in that category that have all given keywords; item visibility and pagination apply; no authentication required for public items.

**UI**

- **AC 3.5.2** [Anyone] **Given** I am viewing items in category/keywords scope (List Items mode, e.g. `view=items` on the category path), **when** the list loads, **then** I see the same scope as in Sets (category + path keywords + query keywords).
- **AC 3.5.3** [Anyone] **Given** I am in List Items mode (category/keywords scope), **when** I interact with the list, **then** I can change page size, paginate, and use scope filters (e.g. item type, search, rating).
- **AC 3.5.4** [Authenticated] **Given** I am authenticated and viewing items in category/keywords scope (List Items mode), **when** the list loads, **then** I see add/remove-from-collection and active-collection controls per AC 1.2.5–1.2.8.
- **AC 3.5.5** [Anyone] **Given** I am in List Items mode (category/keywords scope), **when** the list is shown, **then** the breadcrumb displays the path (e.g. Categories → category → keyword(s)) with the **item count** in parentheses after it (e.g. "Categories > language > french (5)"); the UI does **not** show a separate "Items" heading or "Items in ..." paragraph below the breadcrumb.

---

- **AC 3.5.6** [Anyone] **Given** I open an item's details screen from category/global List Items mode, **when** I use the back control on the item-details screen, **then** I return to the same list URL I came from, including the current category path and active query-string filters.

### AC 3.6 Flashcards and Quiz by category/keywords

**API**

- **AC 3.6.1** [Anyone] **Given** I request items by category and keywords (e.g. `GET /items?category=...&keywords=...`), **when** I use those items in Flashcards or Quiz, **then** the same item set and visibility rules apply; no separate category-specific explore/quiz endpoint is required.

**UI**

- **AC 3.6.2** [Anyone] **Given** I am on the category Sets or List Items view, **when** I switch to **Flashcards** or **Quiz**, **then** I am taken to Flashcards or Quiz for the **current category/keyword scope** (e.g. `/explore/{categorySlug}` or `/explore/{categorySlug}/item/{itemId}` with same scope); the set of items is the same as in List Items view for that scope. Behavior (one item at a time, navigation, scoring) is the same as for collection-based Flashcards/Quiz where applicable.
- **AC 3.6.3** [Anyone] **Given** I am on **Flashcards** or **Quiz** for a **category** scope, **when** I view the scope secondary bar, **then** non-leaf scopes show **Sets | List Items | Flashcards | Quiz** (same as on Sets/List Items), and clicking **Sets** navigates back to the Sets view for that scope. Leaf scopes follow **AC 3.6.3a**. For **collection** scope, the bar shows only **List Items | Flashcards | Quiz** (no Sets).
- **AC 3.6.3a** [Anyone] **Given** I am on **Flashcards** or **Quiz** for a **leaf category** scope, **when** I view the scope secondary bar, **then** it omits **Sets** and shows only **List Items | Flashcards | Quiz**.
- **AC 3.6.4** [Anyone] **Given** I am on **Flashcards** or **Quiz** for a category scope, **when** the page is shown, **then** I see the same breadcrumb and item count at the top as in List Items mode (for example `Categories > exams > act > math (3)`), and the mode guidance is shown as a compact hint instead of a large page title plus descriptive paragraph.
- **AC 3.6.5** [Anyone] **Given** I am in **Quiz** mode for a **category or global** scope (not a collection) and I change **Quiz size**, **when** the new size is applied, **then** the app requests a **new random set** of that many items for the current scope, clears in-session cached item lists used for quiz navigation, resets quiz progress for that run, and updates the URL so it no longer points at an item from the previous set unless that item is re-selected by the new load.

---

- **AC 3.6.6** [Anyone] **Given** I open an item's details screen from category/global Flashcards or Quiz mode, **when** I use the back control on the item-details screen, **then** I return to the same Flashcards or Quiz URL I came from (including the current item and query-string scope); for Quiz this includes restoring the current item's revealed / answered state when that session state is still available.

### AC 3.7 Keyword descriptions (breadcrumb)

**API**

- **AC 3.7.1** [Anyone] **Given** I call `GET /keywords/descriptions?category={name}&keywords=...`, **then** the API returns the description for each keyword in the path (for breadcrumb tooltips); category and keywords use the same resolution as elsewhere.

**UI**

- **AC 3.7.2** [Anyone] **Given** I am on a category page with keywords in the path, **when** the breadcrumb is shown, **then** I can see keyword descriptions (e.g. tooltips) per API where available.

---

### AC 3.8 Admin: categories and keywords (create, update, delete)

**API**

- **AC 3.8.1** [Admin] **Given** I am an admin, **when** I call create/update/delete endpoints for categories or keyword relations (e.g. CreateCategory, UpdateCategory, DeleteCategory, CreateCategoryKeyword/create relation, UpdateCategoryKeyword, DeleteCategoryKeyword), **then** the API allows the operation; categories remain public.
- **AC 3.8.2** [Authenticated (non-admin)] **Given** I am authenticated but not an admin, **when** I call create/update/delete for categories or category keywords, **then** the API returns 403 Forbidden.
- **AC 3.8.3** [Anonymous] **Given** I am not authenticated, **when** I call those endpoints, **then** the API returns 401.

**UI**

- **AC 3.8.4** [Admin] **Given** I am an admin, **when** I use the Admin Categories / Keywords UI, **then** I can create, update, and delete categories and keyword relations (parent/child per category, sort order, description); the UI reflects API rules.

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

### AC 3.10 Taxonomy (YAML), public API, and item ingress

**Design:** The canonical category tree and navigation keyword slugs are defined in `docs/quizymode_taxonomy.yaml`. At API startup the file is loaded into an in-memory taxonomy registry. Database categories and `KeywordRelation` navigation rows are seeded from that same YAML (plus per-category **other** where applicable). Item create, update, bulk add, collection upload, and study-guide finalize must not introduce new public categories or ad-hoc public navigation paths.

**API**

- **AC 3.10.1** [Anyone] **Given** the API is running, **when** I call `GET /taxonomy` (no auth required), **then** the response lists all taxonomy categories with nested L1 → L2 navigation slugs (and optional flat slug lists) sourced only from the in-memory registry, not from ad-hoc DB growth.
- **AC 3.10.1a** [Anyone] **Given** I open **Categories Map** from the shared footer, **when** the taxonomy loads, **then** I see a compact tree built from `GET /taxonomy` with category → primary topic (L1) → subtopic (L2) nodes; each node shows its visible item count for the current user, any node that has children can be expanded or collapsed individually, the tree also has **Expand all** and **Collapse all** controls, and clicking any node opens the corresponding `/categories/...` scope.
- **AC 3.10.2** [Authenticated] **Given** I create or update an item (single `POST /items`, `PUT /items/{id}`, `POST /items/bulk`, upload-to-collection, or study-guide finalize), **when** I supply a category name, **then** it must match a taxonomy category **and** exist already as a **public** row in `Categories`; the API does **not** create new global categories as a side effect of item ingress.
- **AC 3.10.2a** [Admin] **Given** I call the repo-managed seed-sync endpoints (`POST /admin/seed-sync/preview` or `POST /admin/seed-sync/apply`), **when** an item payload supplies a category name, **then** it must match a taxonomy category **and** an existing public `Categories` row; seed sync does not create new public categories.
- **AC 3.10.3** [Authenticated] **Given** I supply `navigationKeyword1` and `navigationKeyword2` on item ingress, **when** the pair is not a valid (L1, L2) path for that category in the taxonomy, **then** the request fails validation; bulk, import, and admin seed-sync flows do **not** auto-create missing `KeywordRelation` rows for navigation.
- **AC 3.10.4** [Authenticated] **Given** I attach extra keywords beyond the two navigation slugs in the regular user-facing item ingress flows (`POST /items`, `PUT /items/{id}`, `POST /items/bulk`, upload-to-collection, or study-guide finalize), **when** a keyword slug matches a taxonomy slug for that category, **then** it is attached as a **public** keyword without review pending; **when** it does not match taxonomy, **then** it is stored as a **private** user keyword with **review pending** (including for admins using those same non-seed-sync flows). Extras are matched on **exact** slug equality only (edit-distance similarity is not used).
- **AC 3.10.5** [Anyone] **Given** Discover item filters use `category` and `keywords` (L1/L2), **when** the keyword path is invalid for that category under the same taxonomy rules as items, **then** the API returns **400** (see also AC 1.9.1b).

**UI**

- **AC 3.10.6** [Authenticated] **Given** I use Create Item, Edit Item, Bulk Create, or upload flows that pick category and navigation, **when** the form loads, **then** the **Category** list is driven from `GET /taxonomy` (fixed taxonomy categories), and **Primary topic** / **Subtopic** are required dropdowns populated from that taxonomy for the selected category; I cannot type arbitrary navigation slugs for L1/L2. **Additional keywords** may suggest taxonomy slugs; free-text extras are treated as private pending on the server per AC 3.10.4.

---

## 4. Users and auth

Authentication uses **email + password** with secure password hashing and short-lived access tokens. Authorization is role-based (`User`, `Admin`) and relies on the global invariants in **Access and ownership**. This section describes **how users sign up, sign in, manage sessions, and view/update their profile**.

### AC 4.1 Authentication model and roles

**API**

- **AC 4.1.1** [Anyone] **Given** I call any **authenticated** endpoint without a valid access token, **when** the endpoint requires a logged-in user (e.g. creating items, collections, or reading my settings), **then** the API returns **401 Unauthorized** with a ProblemDetails body; no partial data is leaked.
- **AC 4.1.2** [Authenticated / Admin] **Given** I am authenticated and call an endpoint I do not have permission to use (e.g. non-admin calling an admin-only endpoint), **when** the resource exists and its existence is not secret, **then** the API returns **403 Forbidden**; for resources whose existence must be hidden (e.g. other users' private collections or items), the API returns **404 Not Found** per global invariants.
- **AC 4.1.3** [Anyone] **Given** I have an access token (e.g. JWT) issued by the system, **when** I include it in the `Authorization: Bearer {token}` header on API calls, **then** the backend validates signature, expiry, and revocation; expired or invalid tokens are treated as missing and result in **401 Unauthorized**.
- **AC 4.1.4** [Anyone] **Given** the backend needs user identity, **when** a request is authenticated, **then** the token contains at least `sub` (user id), `email`, and `role` (`User` or `Admin`); any additional claims are a cache of server-side data only and must not be treated as the source of truth for sensitive flags.

### AC 4.2 Registration (sign up)

**API**

- **AC 4.2.1** [Anonymous] **Given** I am not authenticated, **when** I call `POST /auth/register` with a valid body `{ "email": "...", "password": "...", "displayName": "..." }`, **then** the API:
  - (a) creates a new user record with a **unique email**, normalized to a canonical form;
  - (b) stores a **hashed password** using a modern algorithm (e.g. PBKDF2, bcrypt, or Argon2) with per-user salt;
  - (c) sets my initial role to `User` (not `Admin`);
  - (d) returns 201 with a minimal user DTO (id, email, displayName) and **does not** return the hashed password.
- **AC 4.2.2** [Anonymous] **Given** I call `POST /auth/register` with an email that already exists (case-insensitive), **when** the request is processed, **then** the API returns **400 Bad Request** with a validation error indicating that the email is already in use.
- **AC 4.2.3** [Anonymous] **Given** I call `POST /auth/register` with an invalid password (too short or failing password policy), **when** the request is processed, **then** the API returns **400 Bad Request** with a validation error explaining the constraints; the user record is not created.
- **AC 4.2.4** [Authenticated] **Given** I am already authenticated, **when** I call `POST /auth/register`, **then** the API returns **400 Bad Request** or **409 Conflict** indicating that I already have an account; the existing identity is not changed.

**UI**

- **AC 4.2.5** [Anonymous] **Given** I open the **Sign up** page, **when** I submit the form with email, password, and display name, **then** the UI calls `POST /auth/register`; on success it signs me in (per login flow) or redirects me to the login page with a success message; validation errors from the API are shown inline next to the affected fields.

### AC 4.3 Login and tokens

**API**

- **AC 4.3.1** [Anonymous] **Given** I call `POST /auth/login` with valid credentials (email + password), **when** the credentials match an existing user, **then** the API returns **200 OK** with:
  - a short-lived **access token** (e.g. JWT) and
  - either a long-lived **refresh token** (opaque or JWT) or a secure httpOnly cookie storing refresh credentials;
  the response body includes a minimal user profile (id, email, displayName, role).
- **AC 4.3.2** [Anonymous] **Given** I call `POST /auth/login` with an unknown email or incorrect password, **when** the request is processed, **then** the API returns **401 Unauthorized** with a generic error (e.g. "Invalid email or password") that does **not** reveal whether the email exists.
- **AC 4.3.3** [Anonymous] **Given** I call `POST /auth/login` too many times with invalid credentials within a short time window, **when** the rate limit is exceeded, **then** the API returns **429 Too Many Requests** (or applies equivalent throttling) without indicating whether the email is valid, to mitigate credential stuffing.
- **AC 4.3.4** [Authenticated] **Given** I have a valid **refresh token**, **when** I call `POST /auth/refresh` with that token (e.g. in body or httpOnly cookie), **then** the API validates it, issues a new access token (and optionally rotates the refresh token), and invalidates the old refresh token if rotation is used; invalid or expired refresh tokens return **401 Unauthorized**.

**UI**

- **AC 4.3.5** [Anonymous] **Given** I open the **Sign in** page, **when** I submit valid credentials, **then** the UI stores the received access token (and handles refresh token via secure cookie where applicable), updates the app state to "authenticated", and redirects me to the intended page (or home).
- **AC 4.3.6** [Anonymous] **Given** I submit invalid credentials, **when** the API returns 401, **then** the UI shows a non-specific error message (e.g. "Invalid email or password") and does not reveal whether the email exists; no token is stored.
- **AC 4.3.7** [Authenticated] **Given** I return to an authenticated-only SPA route after my session has expired or can no longer be refreshed, **when** the app re-checks auth state, **then** it clears local auth state and redirects me to the public home page instead of leaving me on an auth-only screen with an access-denied error.

### AC 4.4 Logout and token revocation

**API**

- **AC 4.4.1** [Authenticated] **Given** I am authenticated, **when** I call `POST /auth/logout`, **then** the API records a logout audit event for the current user and returns success (currently **200 OK** with a simple body). Authentication itself is managed by the external identity provider; this endpoint does not directly rotate passwords or manage provider refresh-token state.

**UI**

- **AC 4.4.2** [Authenticated] **Given** I am signed in and click **Sign out**, **when** the logout action is triggered, **then** the UI calls `POST /auth/logout` (best-effort), clears any locally stored access token or auth state, navigates me to a public page (e.g. home or login), and ensures that authenticated-only UI (e.g. Add Items, My collections) is no longer visible.

### AC 4.5 Profile (view and update my info)

**API**

- **AC 4.5.1** [Authenticated] **Given** I am authenticated, **when** I call `GET /users/me`, **then** the API returns **200 OK** with my current app profile fields: `id`, `name`, `email`, `isAdmin`, `createdAt`, and `lastLogin`; it does **not** return password hashes, provider tokens, or other secrets.
- **AC 4.5.2** [Authenticated] **Given** I am authenticated, **when** I call `PUT /users/me` with `{ "name": "..." }`, **then** the API updates my display name / username and returns the updated profile payload. Attempts to change fields outside the supported request contract are not part of this endpoint.
- **AC 4.5.3** [Anonymous] **Given** I am not authenticated, **when** I call `GET /users/me` or `PUT /users/me`, **then** the API returns **401 Unauthorized**.

**UI**

- **AC 4.5.4** [Authenticated] **Given** I am authenticated, **when** I open the **Profile** UI from the site chrome, **then** the UI shows my current profile in a modal, including non-editable fields (email, role/admin flag, created date, last login) and editable name; saving changes calls `PUT /users/me` and displays success or validation errors.

### AC 4.6 Password change and reset

Quizymode currently relies on the external identity provider for password, recovery, and confirmation flows. These behaviors are intentionally outside the app API documented here.

**Current app scope**

- **AC 4.6.1** [Anonymous] **Given** I am not signed in, **when** I visit the app, **then** I can access the implemented authentication screens for **Sign in** and **Sign up**.
- **AC 4.6.2** [User] **Given** I sign in, sign up, confirm signup, or recover account access, **when** those flows require password or recovery handling, **then** the behavior is provided by the configured identity provider rather than by first-party Quizymode API endpoints.
- **AC 4.6.3** [Anonymous] **Given** I am on the **Sign up** page, **when** I review or submit the form, **then** I can open the current **Terms of Service** and **Privacy Policy**, and the form does not continue unless I affirm them.
- **AC 4.6.4** [Anyone] **Given** I am anywhere in the app, **when** I use the global footer, **then** I can open the **About**, **Feedback**, **Privacy Policy**, and **Terms of Service** pages.
- **AC 4.6.5** [Authenticated] **Given** I call `POST /users/policy-acceptances` with one or more `{ policyType, policyVersion, acceptedAtUtc }` entries for the supported legal documents, **when** the request is valid, **then** the API records auditable acceptance rows for the current user with the submitted acceptance time plus the server-side recorded time; repeated submissions for the same `(user, policyType, policyVersion)` do not create duplicates.
- **AC 4.6.6** [Anonymous] **Given** I am not authenticated, **when** I call `POST /users/policy-acceptances`, **then** the API returns **401 Unauthorized**.
- **AC 4.6.7** [Anonymous -> Authenticated] **Given** I successfully submit sign-up with the legal acknowledgement checked, **when** I later complete an authenticated session on the same browser for that same email address, **then** the SPA sends the pending Terms of Service and Privacy Policy acceptance records to `POST /users/policy-acceptances` and clears the pending browser copy after the API confirms success.

---

### AC 4.7 User settings

User settings are key-value pairs stored per user (e.g. **PageSize** for default pagination). Only the authenticated user can read or update their own settings. Other keys may be added over time (e.g. theme, language); validation and defaults are defined per key.

**API**

- **AC 4.7.1** [Authenticated] **Given** I am authenticated, **when** I call `GET /users/settings`, **then** the API returns 200 with a dictionary of my settings (key-value pairs); if I have no settings, an empty dictionary is returned.
- **AC 4.7.2** [Anonymous] **Given** I am not authenticated, **when** I call `GET /users/settings`, **then** the API returns 401.
- **AC 4.7.3** [Authenticated] **Given** I am authenticated, **when** I call `PUT /users/settings` with a JSON body `{ "key": "...", "value": "..." }`, **then** the API upserts that setting for my user (creates if missing, updates if present) and returns 200 with the key, value, and updatedAt. Key and value are required; key max length 100, value max length 500.
- **AC 4.7.4** [Anonymous] **Given** I am not authenticated, **when** I call `PUT /users/settings`, **then** the API returns 401.
- **AC 4.7.4a** [Authenticated] **Given** I am authenticated, **when** I call `PUT /users/settings` with key `"StudyGuideMaxBytes"` and a numeric value in the range `0`–`1,000,000` (stored as a string), **then** that value becomes my effective study-guide byte limit; if the setting is absent, the default is **51,200 bytes (50 KB)**.

**Default pagination (PageSize)**

- **AC 4.7.5** [Authenticated] **Given** I am authenticated, **when** my setting **PageSize** is set (via `PUT /users/settings` with key `"PageSize"` and a string value), **then** that value is used as my default number of items per page where the UI supports it (e.g. Categories list view). If not set, the default is 10. The UI and API may enforce a valid range (e.g. 1–1000); invalid values are clamped or rejected.
- **AC 4.7.6** [Anonymous] **Given** I am not authenticated, **when** I use a page that supports pagination (e.g. Categories items list), **then** the default page size is 10 (no persisted setting).

**UI**

- **AC 4.7.7** [Authenticated] **Given** I am authenticated, **when** I open my profile or settings, **then** I can view and edit my default pagination (PageSize); changes are persisted via `PUT /users/settings` and used on subsequent visits and on pages that take the default (e.g. Categories list when the URL does not specify `pagesize`).
- **AC 4.7.8** [Authenticated] **Given** I am on a page that uses default pagination (e.g. Categories list view), **when** the URL does not specify `pagesize`, **then** my saved PageSize setting is used; if the URL specifies `pagesize`, the URL value takes precedence for that page/session.
- **AC 4.7.9** [Authenticated] **Given** I see the content-compliance warning on add/import flows, **when** I choose **don't show again**, **then** the app persists that preference in `PUT /users/settings` and hides the warning on subsequent visits for that user.

**Content-compliance warning**

- **AC 4.7.10** [Authenticated] **Given** I open item creation or import flows (for example Add Items, Create Item, Generate One AI Batch, Upload items to collection, or Study Guide prompt-set import), **when** I have not previously dismissed the warning, **then** the UI shows a warning reminding me not to upload infringing or unauthorized personal/confidential content, to review AI-generated content, and linking to the current Terms of Service and Privacy Policy.

---

### AC 4.8 Feedback submissions

Feedback submissions are lightweight inbound messages from the SPA. They may be sent by anonymous or authenticated users and are stored for later review.

**API**

- **AC 4.8.1** [Anyone] **Given** I call `POST /feedback` with a JSON body containing `type`, `currentUrl`, `details`, optional `email`, and optional `additionalKeywords`, **when** the payload is valid, **then** the API stores a feedback submission row and returns **201 Created** with the created submission payload.
- **AC 4.8.2** [Anyone] **Given** I call `POST /feedback` with an invalid `type`, an invalid or relative `currentUrl`, missing `details`, or an invalid optional email, **when** the request is processed, **then** the API returns **400 Bad Request** and does not create a submission.
- **AC 4.8.3** [Anonymous] **Given** I call `POST /feedback` anonymously, **when** the request succeeds, **then** the API accepts the submission without requiring authentication and stores no user id on the submission.
- **AC 4.8.4** [Authenticated] **Given** I call `POST /feedback` while authenticated, **when** the request succeeds, **then** the API associates the submission with my current app user id when available.
- **AC 4.8.5** [Anyone] **Given** I submit feedback of type **Provide feedback** or **Report issue**, **when** I include `additionalKeywords`, **then** the API ignores that field; only **Ask for more items** persists optional additional keywords.
- **AC 4.8.6** [Anyone] **Given** too many feedback submissions are sent from the same authenticated identity or client IP within a short time window, **when** the endpoint limit is exceeded, **then** the API returns **429 Too Many Requests** and rejects the submission to reduce abuse.

**UI**

- **AC 4.8.7** [Anyone] **Given** I fill out the feedback dialog and click **Submit**, **when** the request succeeds, **then** the dialog shows a success state without redirecting me away from the current page.
- **AC 4.8.8** [Anyone] **Given** feedback submission is temporarily blocked by the server rate limit, **when** I click **Submit**, **then** the UI shows an error explaining that I need to wait before trying again.

---

## 5. Admin

### AC 5.1 Admin: per-user study guide settings

**API**

- **AC 5.1.1** [Admin] **Given** I am an admin, **when** I call `GET /admin/users/{id}/settings` for a valid user ID, **then** the API returns 200 with a dictionary of that user's settings (key-value pairs); if the user has no settings, an empty dictionary is returned; if the user does not exist, the API returns 404.
- **AC 5.1.2** [Admin] **Given** I am an admin, **when** I call `PUT /admin/users/{id}/settings` with a JSON body `{ "key": "...", "value": "..." }` for a valid user ID, **then** the API upserts that setting for the specified user (creates if missing, updates if present) and returns 200 with the key, value, and updatedAt; if the user does not exist or the request is invalid, an error is returned (404 or 400).
- **AC 5.1.3** [Admin] **Given** I am an admin and I call `PUT /admin/users/{id}/settings` with key `"StudyGuideMaxBytes"` and a numeric value in the range 0–1,000,000 (as a string), **when** the request succeeds, **then** that value becomes the per-user study guide byte limit for that user; if the setting is absent, the default limit of 51,200 bytes (50 KB) applies.
- **AC 5.1.3a** [Admin] **Given** I want to inspect one user’s tracked browsing activity, **when** I call `GET /admin/users/{id}/page-view-history` with optional filters such as days, urlContains, page, and pageSize, **then** the API returns that user’s details plus an activity summary for the selected window and a paged URL history grouped by exact URL, including how many times each URL was opened and the first/last open time in the selected window; if the user does not exist, the API returns 404.

**UI**

- **AC 5.1.4** [Admin] **Given** I am on the Admin Dashboard, **when** I click **Users & Activity**, **then** I am taken to an admin users page where I can browse registered users instead of having to load one by ID manually.
- **AC 5.1.5** [Admin] **Given** I am on the admin users page, **when** the page loads, **then** I see summary cards for registered-user counts, filters for search and recent activity, and a paged list of registered users showing at least email/name, registration time, unique URLs opened in the selected window, and last opened time.
- **AC 5.1.6** [Admin] **Given** I click a user in the admin users list, **when** their detail panel opens, **then** I see that user’s basic details, a grouped URL history with open counts and first/last open times for the selected window, and the existing study-guide limit editor for that user.
- **AC 5.1.7** [Admin] **Given** I have a user selected in the admin users page, **when** I edit the **StudyGuideMaxBytes** value (or leave it blank for default) and click **Save**, **then** the UI calls the admin user-settings API to upsert the `"StudyGuideMaxBytes"` setting for that user; after a successful save, the effective limit (bytes and KB) reflects the new value.

---

### AC 5.2 Admin: repo-managed seed sync for items

**Design:** Admin seed sync imports a **source-controlled manifest** for one **seed set** at a time. The runtime API contract is one manifest payload per request; if the repo stores items in multiple taxonomy-scoped files, tooling must merge them into that manifest before preview/apply. Tooling may also emit **scoped manifests** for the same seed set, such as `category/l1/l2.json`, `category/l1.json`, `category.json`, and sharded `all-sync5k.json` / `all-sync10k.json` files, so admins can load a smaller subset without changing seed-set identity. Each incoming item has a stable `seedId`. Categories and navigation use taxonomy slugs (`category`, `navigationKeyword1`, `navigationKeyword2`), not database keyword IDs. Preview shows only the **delta** for an existing seed set and suppresses the full changed-item list on the **initial seed**. Apply upserts repo-managed public items by `seedId`, refreshes seed metadata, recreates missing DB rows from the manifest, and ensures extra keywords from the manifest exist as **public** keywords. Current behavior reports rows already in the DB but absent from the manifest via `missingFromPayloadCount`; it does **not** delete or retire them.

**API**

- **AC 5.2.1** [Admin] **Given** I am an admin, **when** I call `POST /admin/seed-sync/preview` with a JSON body containing `schemaVersion`, `seedSet`, `items`, and optional `deltaPreviewLimit`, **then** the API validates the request and returns 200 with summary counts at least for `created`, `updated`, `adopted`, `unchanged`, and `missingFromPayload`, plus a `changes` array containing only delta items (not unchanged items), capped by `deltaPreviewLimit`.
- **AC 5.2.2** [Admin] **Given** a seed set has **no existing seed-managed rows** yet, **when** I call `POST /admin/seed-sync/preview`, **then** the API still validates the manifest and returns summary counts, but marks the preview as suppressed for the initial seed (e.g. `previewSuppressed = true`) and returns an empty `changes` array instead of listing the entire initial payload.
- **AC 5.2.3** [Admin] **Given** I call preview or apply with invalid input (for example duplicate `seedId` values in the request, an unsupported `schemaVersion`, an invalid taxonomy category, an invalid navigation path, or a `seedId` already assigned to a different `seedSet`), **when** the request is processed, **then** the API returns 400 Bad Request with a validation or contract error and does not mutate data.
- **AC 5.2.4** [Admin] **Given** I call `POST /admin/seed-sync/apply` with an item whose `seedId` already exists on a seed-managed row in the same `seedSet`, **when** the source-controlled content differs, **then** the API updates that existing DB row in place (question, answers, explanation, source, navigation, and extra keywords) and refreshes seed metadata instead of creating a duplicate item.
- **AC 5.2.5** [Admin] **Given** I call `POST /admin/seed-sync/apply` with an item whose `seedId` does **not** exist in the current database (for example because the row was manually deleted earlier), **when** the request succeeds, **then** the API creates a new public seed-managed item for that `seedId`.
- **AC 5.2.6** [Admin] **Given** I perform the **first** successful apply for a seed set and an existing public legacy seeder row exactly matches the incoming item by category, rank-1, rank-2, and question text, **when** the apply runs, **then** the API may adopt that existing row into seed-managed state instead of inserting a duplicate row; the response counts it as `adopted`.
- **AC 5.2.7** [Admin] **Given** an admin seed-sync item includes extra keywords beyond the navigation pair, **when** a keyword name does not already exist as a public keyword, **then** the API creates it as a **public** keyword (not private pending) and attaches it to the seed-managed item; navigation keywords are also attached to the item keywords like other item ingress flows.
- **AC 5.2.8** [Admin] **Given** a seed-managed row already exists in the same `seedSet` but its `seedId` is not present in the uploaded manifest, **when** I call preview or apply, **then** the API reports that row in the aggregate count `missingFromPayloadCount`; current apply behavior does **not** delete or retire that row automatically.

**UI**

- **AC 5.2.9** [Admin] **Given** an admin UI is built on top of the seed-sync API, **when** it requests a preview for an existing seed set, **then** it should show only the returned delta rows and summary counts rather than rendering the full uploaded manifest; on an initial seed, it should rely on the summary counts and the suppressed-preview flag instead of trying to render the whole payload.
- **AC 5.2.10** [Admin] **Given** the repo tooling emits scoped manifests for the same seed set, **when** I use the admin seed-sync screen, **then** I may load a leaf file (`category/l1/l2.json`), a combined `category/l1.json`, a combined `category.json`, or an `all-sync*.json` shard, and the UI should explain that `missingFromPayloadCount` is informational for rows outside the uploaded subset and that apply does not delete them.

---

### AC 5.3 Admin: usage analytics and page-hit reporting

**Design:** SPA page-hit analytics are captured from client-side route changes so both anonymous and authenticated visits are recorded even when navigation happens without a full page reload. Each page-hit stores the app-relative URL (`path` plus optional query string), a client-generated session id, the resolved client IP, whether the visitor was authenticated at the time of the hit, and the current app user id when available. Admin reporting focuses on a practical operational view: headline totals, top pages grouped by path, traffic split by anonymous vs authenticated visitors, and a recent-hit table with session and IP detail.

**API**

- **AC 5.1.0** [Admin] **Given** I need to review registered users in the admin area, **when** I call `GET /admin/users` with optional filters such as search text, activity window days, activity filter, page, and pageSize, **then** the API returns a paged list of registered users with at least id, name, email, createdAt, lastLogin, unique URL count in the selected activity window, total page views in that window, and last opened time; the response also includes summary counts for total registered users, filtered users, and users with/without activity in the selected window.

- **AC 5.3.1** [Anyone] **Given** the SPA calls `POST /analytics/page-views` with a JSON body containing `path`, optional `queryString`, and `sessionId`, **when** the payload is valid, **then** the API stores a page-hit row for that URL, accepts both anonymous and authenticated callers, records the client IP from forwarded headers / remote address, and associates the hit with the current app user when available.
- **AC 5.3.2** [Anyone] **Given** the SPA sends an invalid page-hit payload (for example missing or blank `sessionId`, blank `path`, a path that does not start with `/`, or an oversized URL component), **when** `POST /analytics/page-views` is processed, **then** the API returns **400 Bad Request** and does not create a page-hit row.
- **AC 5.3.3** [Admin] **Given** I am an admin, **when** I call `GET /admin/page-view-analytics` with optional filters such as `days`, `visitorType`, `pathContains`, `page`, `pageSize`, and `topPagesLimit`, **then** the API returns 200 with: (1) summary totals for hits, unique pages, unique sessions, authenticated hits, anonymous hits, and the selected window; (2) a top-pages list grouped by path and ordered by most visited; and (3) a paged recent-hit list that includes full URL, session id, IP address, visitor type, timestamp, and user email when the hit is tied to an authenticated user.
- **AC 5.3.4** [Admin] **Given** I call `GET /admin/page-view-analytics` with an unsupported `visitorType` or an invalid `days` value, **when** the request is processed, **then** the API returns **400 Bad Request** with a validation error and does not return a partial report.

**UI**

- **AC 5.3.5** [Anyone] **Given** I navigate within the SPA, **when** the route changes and the app is ready to evaluate the current auth state, **then** the frontend records the current page hit using a stable session id for the browser tab/session and avoids obvious duplicate sends caused by immediate remount/re-render behavior.
- **AC 5.3.6** [Admin] **Given** I am on the Admin Dashboard, **when** I click **Usage Analytics**, **then** I am taken to an admin report page where I can change the time window, filter to authenticated or anonymous traffic, optionally filter by path text, and review summary cards, top pages, traffic mix, and recent URL hits with session ids and IP addresses.

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

- **AC 6.1.6** [Authenticated] **Given** I open the Study Guide screen, **when** the page loads, **then** I see a title input, a large text area for study guide text, preparation instructions, a byte counter and remaining bytes indicator, and Save/Delete/Cancel controls; the byte counter updates as I type, and the Save button is disabled when the content exceeds my effective study-guide limit (default **51,200 bytes / 50 KB**, unless overridden by `StudyGuideMaxBytes`).
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
- **Default collection**: Resolved — at signup the backend creates a personalized default collection when the user's display name is available: name = first 3 characters + `'s Collection` and description = `<display name> default collection` (for example `Abc's Collection` / `Abcdefgh default collection`). If a user has zero collections (e.g. legacy), the first `GET /collections` creates the same shape. If no display name is available, it falls back to "Default Collection".
- **Private keyword name collision**: When a public keyword and a private keyword share the same name/slug, navigation and item filtering resolve that name/slug to **one effective keyword** per scope: the **public** keyword is used when it exists; if no public keyword exists with that name/slug, the user's private keyword is used instead. This ensures a single, predictable path/keyword resolution when names collide.

---

## Updating this document

When you change application behavior (API contracts, authorization rules, or user-visible flows), update this document so it stays accurate.

- **API vs UI:** Keep **API** (HTTP, status codes, payloads, authorization) and **UI** (labels, screens, controls) in separate subsections under each feature so backend and frontend concerns stay separate.
- **Actors:** Use the standard actors: **Owner**, **Authenticated (non-owner)**, **Admin (non-owner)**, **Anonymous**. State the actor in each AC as `[Actor]`. For Admin (non-owner), use "Same as Authenticated (non-owner) (AC X.Y.Z)" when behavior is the same.
- **Format:** Use **AC section.subsection.id** with Given/When/Then; reference endpoints and status codes in API criteria, and copy/controls in UI criteria.
- **Atomicity:** Aim for **one AC = one verifiable behavior**. Avoid mixing concerns (e.g. do not combine route behavior, API response shape, UI labels, navigation, and error handling in a single AC); instead, split into separate ACs that each test one thing.
- See the Cursor rule "Update acceptance criteria when app behavior changes" for automation hints.
