# Collections Discovery, Sharing & Teacher/Student Setup

This document describes the design for:
- **Discovering** other people's collections (search)
- **Bookmarking** collections you find
- **Viewing** your collections vs bookmarked vs shared-with-you
- **Sharing** collections (e.g. teacher → students) and email invites
- **Teacher dashboard**: see who took the quiz and their score %

---

## 1. Current State

- **Collections page** shows only *your* collections (`GET /collections` → `CreatedBy == currentUser`).
- **Collection by ID** is public: anyone with the link can view (`GET /collections/{id}`).
- **Quiz** is client-side only: no server-side attempt or completion tracking.
- **No** bookmark, share, or email infrastructure.

---

## 2. Data Model Additions

### 2.1 Collection visibility (optional)

- **`Collection.IsPublic`** (bool, default `false`): if true, collection appears in “discover” search.
- Alternatively: treat “discoverable” as “has at least one share or is explicitly public”. For MVP, **IsPublic** is enough.

### 2.2 Bookmark

- **`CollectionBookmark`**: UserId (Guid), CollectionId (Guid), CreatedAt. Unique (UserId, CollectionId).
- Users can bookmark any collection they can see (e.g. by link or via discover).

### 2.3 Share (for “shared with me” and teacher → students)

- **`CollectionShare`**:
  - CollectionId (Guid)
  - SharedBy (UserId, Guid or string to match CreatedBy)
  - SharedWith: either **UserId** (Guid) for in-app user, or **Email** (string) for invite-not-yet-user
  - Optional: **Role** (e.g. Viewer, CanQuiz)
  - CreatedAt, optional ExpiresAt
- Enables:
  - “Shared with me”: shares where SharedWith = current user (by UserId or Email match after login).

### 2.4 Quiz attempt (for teacher dashboard)

- **`QuizAttempt`** (or `CollectionQuizAttempt`):
  - Id, UserId (Guid), CollectionId (Guid)
  - StartedAt, CompletedAt (nullable)
  - Score: e.g. **CorrectCount**, **TotalCount** → percent = CorrectCount/TotalCount * 100
- One row per “quiz run” (one attempt per collection). If you want multiple attempts per user per collection, add AttemptNumber or allow multiple rows.

---

## 3. API Outline

### 3.1 Discovery & listing

- **`GET /collections`** (existing): extend or keep as “my collections” only.
- **`GET /collections/me`** (or keep `GET /collections`): my created collections.
- **`GET /collections/discover?q=...&page=&pageSize=`**: search **public** collections by name (and optionally owner). Returns list with id, name, createdBy, itemCount, createdAt. Auth optional (for bookmark state).
- **`GET /collections/bookmarks`**: collections the current user bookmarked (auth required).
- **`GET /collections/shared-with-me`**: collections shared with the current user (auth required).

Unified “my list” on the front can call:
- `GET /collections` → “My collections”
- `GET /collections/bookmarks` → “Bookmarked”
- `GET /collections/shared-with-me` → “Shared with me”
- `GET /collections/discover?q=...` → “Discover” (search others’ public collections).

### 3.2 Bookmark

- **`POST /collections/{id}/bookmark`**: add bookmark (auth required).
- **`DELETE /collections/{id}/bookmark`**: remove bookmark (auth required).

### 3.3 Collection visibility (for discovery)

- **`PATCH /collections/{id}`** (existing): add **IsPublic** to the update payload so owners can make a collection discoverable.

### 3.4 Sharing (teacher flow)

- **`POST /collections/{id}/share`**: body `{ "emails": ["student@example.com"], "message": "optional" }`. Creates **CollectionShare** rows (SharedWith = email if user not found by email, or link to UserId once we resolve). Sends email invite (see Email below).
- **`GET /collections/{id}/shares`**: list shares (recipients) for this collection (owner only). Response can include: email, userId (if resolved), createdAt, and **quiz status** (see below).
- **`DELETE /collections/{id}/shares/{shareId}`**: revoke a share (owner only).

### 3.5 Quiz completion (for teacher dashboard)

- **`POST /collections/{id}/quiz/attempt`**: body `{ "correctCount": 10, "totalCount": 10 }`. Called when user finishes a quiz on that collection. Creates/updates **QuizAttempt** for current user + collection. Auth required.
- **`GET /collections/{id}/shares`** (above): extend response so each share has:
  - **lastAttemptAt**, **bestScorePercent** (or last score), **attemptCount**
- So teacher sees: “Sent to student@example.com – took quiz 2 times, last score 85%.”

---

## 4. Email (invites)

- **Option A**: Use a simple SMTP sender (e.g. **MailKit** or **SendGrid**) and a template: “Teacher X shared a collection with you: [Collection Name]. Take the quiz: [link to /quiz/collection/{id}].”
- **Option B**: Use AWS SES (fits if you’re already on AWS/Cognito). Same idea: send email with link to app + collection.
- **Option C**: No email; only in-app “shared with me”. Teacher adds by email; we store email in **CollectionShare**. When that user signs up/logs in with that email, we show the collection under “Shared with me”. Then you can add email later.

For “send email to students signed to this app”: you need either:
- A list of students (e.g. class roster) stored in app, or
- Teacher enters emails in the share dialog; backend sends invite to those emails (and if they’re already users, also create **CollectionShare** with UserId).

---

## 5. How to Set Up for Students and Teachers

### Teachers

1. **Create a collection** (e.g. “Biology Ch. 5”) and add items.
2. **Make it public** (optional): so it can appear in Discover. Not required for sharing.
3. **Share the collection**:
   - Open the collection → “Share” → enter student emails (and optional message).
   - Backend creates shares and sends emails with link: `https://yourapp.com/quiz/collection/{id}` (or “shared with you” in-app).
4. **View dashboard**:
   - Open “Shared” or “Collection → Shares” for that collection.
   - See list: email/user, “Quiz taken: Yes/No”, “Score: 85%”, “Attempts: 2”.

### Students

1. **Sign up** to the app (if not already).
2. **Receive**:
   - **Email**: click link → open app to quiz (or shared collection).
   - **In-app**: Log in → Collections → “Shared with me” → see collection → take quiz.
3. **Take the quiz**: open collection in Quiz mode; on quiz end, frontend calls `POST /collections/{id}/quiz/attempt` so teacher sees completion and score.

### Optional: Class / roster

- Later you can add **Class** (name, teacher UserId) and **ClassMember** (ClassId, UserId or Email). Then “Share with class” = share with all members. Same **CollectionShare** and **QuizAttempt** design.

---

## 6. Implementation Phases

### Phase 1 (this PR/iteration)

- Add **Collection.IsPublic** and migration.
- **Discover**: `GET /collections/discover?q=...` (search public collections by name).
- **Bookmarks**: model **CollectionBookmark**, `POST/DELETE /collections/{id}/bookmark`, `GET /collections/bookmarks`.
- **Shared with me**: model **CollectionShare** (SharedWith = UserId or Email), `GET /collections/shared-with-me`. Share creation can be minimal (e.g. **POST /collections/{id}/share** with `{ "userId": "..." }` only; no email yet).
- **Collections page UI**: tabs or sections “Mine” | “Bookmarked” | “Shared with me” + search box that calls discover (and optionally “Make public” on collection settings).

### Phase 2

- **Email**: configure sender (SES/SMTP), send invite when sharing by email.
- **Share by email**: resolve email → UserId when user exists; otherwise store email and show “Shared with me” after sign-up when email matches.
- **Quiz attempt API**: `POST /collections/{id}/quiz/attempt`, **QuizAttempt** table.
- **Teacher dashboard**: extend `GET /collections/{id}/shares` with attempt stats; UI to show “Sent to”, “Quiz taken”, “Score %”.

### Phase 3 (optional)

- Class/roster: “Share with class” and bulk invite.
- Notifications (in-app or email) when someone shares a collection with you.

---

## 7. Phase 1 Implementation Status

Phase 1 is implemented:

- **Backend**: `Collection.IsPublic`; `CollectionBookmark` and `CollectionShare` models; migrations; endpoints: `GET /collections/discover`, `GET /collections/bookmarks`, `GET /collections/shared-with-me`, `POST/DELETE /collections/{id}/bookmark`, `POST /collections/{id}/share` (body: `userId` and/or `email`). Update collection supports `isPublic`; ownership checks on update/delete.
- **Frontend**: Collections page has tabs **Mine** | **Bookmarked** | **Shared with me** | **Discover**. Discover has search and pagination; cards show bookmark/unbookmark. Collection detail page has a "List in Discover" toggle for owners.

Apply the migration (from repo root or API project):

```bash
cd src/Quizymode.Api
dotnet ef database update
```

---

## 8. File / Component Summary (Phase 1)

- **Backend**: Migration (IsPublic, CollectionBookmark, CollectionShare); GetCollections (optional: add “bookmarked” and “shared” to one response or keep separate); DiscoverCollections; BookmarkCollection; UnbookmarkCollection; GetBookmarks; GetSharedWithMe; ShareCollection (minimal); GetCollectionShares (later with attempt stats). Update **GetCollectionById** to allow access for shared users if needed.
- **Frontend**: Collections page with tabs (Mine / Bookmarked / Shared with me), search (calls discover), bookmark button on collection cards, “Share” button and modal (Phase 2: email form + send). Collection detail: “Make public” toggle (Phase 1).

This keeps the first phase focused on discovery, bookmarks, and “shared with me” without email or quiz tracking, then adds sharing by email and teacher dashboard in Phase 2.
