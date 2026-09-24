# Helios Parent Support — Storage Map

## Current Architecture

New persistent application records use server-side APIs, Prisma, Neon PostgreSQL, and required S3-compatible object storage. Existing browser data is legacy prototype data and is neither migrated nor used as a fallback for new records.

## Admin Accounts
Storage:
Neon PostgreSQL.

Table:
`AdminAccount`

Write:
- `app/api/admin/profile/route.ts` updates profile fields.
- `app/api/admin/password/route.ts` updates the server-side password hash.
- The one-time seed created the four existing admin records directly in Neon.

Read:
- `app/api/admin/login/route.ts` verifies username/password.
- `app/api/admin/me/route.ts`, `app/api/admin/accounts/route.ts`, and `lib/admin-auth.ts` read safe identities.

Live:
Yes. Neon is authoritative. `helios_admin_accounts` is legacy migration code only.

## Admin Sessions
Storage:
Neon PostgreSQL plus secure HttpOnly cookie.

Table/cookie:
- `AdminSession`
- `helios_admin_session`

Write/read:
`lib/admin-auth.ts` creates, validates, revokes, and clears sessions. Admin pages use the returned safe identity only for UI hydration; server authorization validates the cookie against Neon.

Live:
Yes.

## Parent Accounts
Storage:
Neon PostgreSQL.

Table:
`User`

Write:
- `app/api/auth/register/route.ts` creates the parent user.
- `app/api/auth/profile/route.ts` updates the parent profile.

Read:
- `app/api/auth/login/route.ts`.
- `app/api/auth/me/route.ts` and `lib/auth.ts`.
- `lib/client-auth.ts` caches the API response in memory only.

Legacy:
`helios_parent_account` may remain in browsers but is not read or written by the new parent flow.

Live:
Yes, Neon.

## Student Profiles
Storage:
Neon PostgreSQL.

Table:
`Student`

Write:
- `app/api/auth/register/route.ts` creates the student.
- `app/api/auth/profile/route.ts` updates current class and section.

Read:
`lib/auth.ts` includes the related student in the safe parent response.

Legacy:
Nested student data in `helios_parent_account` is ignored by the new flow.

Live:
Yes, Neon.

## Parent-Student Relationships
Storage:
Neon PostgreSQL.

Table:
`ParentStudent`

Write:
`app/api/auth/register/route.ts` creates the relationship inside the registration transaction.

Read:
`lib/auth.ts` includes the relationship and student for the authenticated parent.

Live:
Yes, Neon.

## Parent Sessions
Storage:
Neon PostgreSQL plus HttpOnly cookie.

Table/cookie:
- `Session`
- `helios_session`

Write/read:
`lib/auth.ts` and `app/api/auth/login|register|logout|me/route.ts`.

Legacy:
`helios_parent_session` is no longer used by the new flow.

Live:
Yes, Neon.

## Tickets
Storage:
Neon PostgreSQL.

Table:
`Ticket`

Write:
- `app/api/tickets/route.ts` creates new tickets and persists parent/student snapshots.
- `app/api/tickets/[ticketNumber]/route.ts` persists status, priority, assignment, ownership, escalation, resolution, and timestamps.
- Client calls are made through `lib/local-tickets.ts`; its historical function names are API-client compatibility names, not local persistence functions.

Read:
- `app/api/tickets/route.ts` returns parent-visible or admin-visible tickets.
- `app/api/tickets/[ticketNumber]/route.ts` returns a single authorized ticket.
- Parent/admin pages consume those API responses.

Legacy:
`helios_parent_tickets` remains untouched but is not read or written for new records.

Live:
Yes, Neon. New tickets are visible across browsers/devices.

## Ticket Snapshots
Storage:
Neon JSON columns on `Ticket`.

Fields:
`parentSnapshot`, `studentSnapshot`

Write:
`app/api/tickets/route.ts` stores snapshots during ticket creation.

Read:
Ticket API mapping and parent/admin ticket pages.

Live:
Yes, Neon. Snapshots preserve historical ticket context without depending on the current profile.

## Ticket Activities / History
Storage:
Neon PostgreSQL.

Table:
`TicketActivity`

Write:
- `app/api/tickets/route.ts` creates the initial submission activity.
- `app/api/tickets/[ticketNumber]/route.ts` creates status, assignment, escalation, resolution, and comment activities.

Read:
Ticket API mapping returns activities to parent/admin pages.

Live:
Yes, Neon.

## Internal Notes
Storage:
Neon PostgreSQL.

Table:
`TicketNote`

Write:
`app/api/tickets/[ticketNumber]/route.ts` writes notes with `authorAdminId` and `isInternal: true`.

Read:
The ticket API includes ticket notes through the server persistence path; the current UI primarily renders the unified activity stream.

Live:
Yes, Neon.

## Escalation / Ownership / Resolution
Storage:
Neon PostgreSQL on `Ticket`.

Fields:
- `escalatedTo`, `escalatedAt`
- `assignedAdminId`, `assignedAdminRole`
- `takenUpBy`, `takenUpAt`, `takenUpByAdminIds`, `takenUpAtByAdmin`
- `resolvedBy`, `resolvedAt`

Write:
`app/api/tickets/[ticketNumber]/route.ts` after server-side admin authentication and role/class authorization.

Read:
The ticket API maps these fields back to the existing workflow UI. Admin IDs remain stable Neon `AdminAccount.adminId` values.

Live:
Yes, Neon.

## Ticket Attachments
Storage:
Neon metadata plus S3-compatible object storage.

Tables/bucket:
- `Attachment`
- `ticket-attachments`

Write:
- `app/api/tickets/route.ts` uploads new file bytes to `ticket-attachments` and stores `storageKey`, filename, MIME type, and size in `Attachment`.
- No attachment bytes are written to localStorage.

Read:
- Ticket APIs return metadata and protected download URLs.
- `app/api/tickets/[ticketNumber]/attachments/[attachmentId]/route.ts` authorizes access and returns a signed object-storage URL.

Live:
The database path is implemented. Uploads require the server-only object-storage environment variables documented in `.env.example`; without them the request fails and does not fall back locally.

## Dashboard Slides / Images
Storage:
Neon metadata plus S3-compatible object storage.

Tables/bucket:
- `CarouselSlide`
- `dashboard-images`

Write:
- `app/api/admin/slides/route.ts` uploads a new image and creates metadata.
- `app/api/admin/slides/[id]/route.ts` replaces, enables/disables, or deletes slide metadata and objects.
- Only Principal and Director may write.

Read:
- `app/api/admin/slides/route.ts` returns active public slides or all slides for an authenticated editor.
- `app/page.tsx` reads the public API response.
- `app/admin/carousel/page.tsx` reads the authenticated editor response.

Legacy:
`helios_dashboard_slides` remains untouched and is no longer read or written.

Live:
Metadata/object paths are implemented. Uploads require configured object storage; there is no blob URL or localStorage fallback.

## Login / Logout

Admin login remains Neon-backed through `AdminAccount` and `AdminSession`.

Parent login/register now use:
- `app/api/auth/login/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/me/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/profile/route.ts`

The browser retains only in-memory identity/UI state. Password hashes, database credentials, raw session tokens, and uploaded file bytes are never stored in browser persistence.

## Legacy Browser Keys

These keys may still exist from the prototype and are intentionally not deleted or migrated:

- `helios_parent_account`
- `helios_parent_session`
- `helios_parent_tickets`
- `helios_dashboard_slides`
- `helios_admin_accounts`
- `helios_admin_account`
- `helios_admin_session`

They are not authoritative for new records. The application does not use them as a Neon failure fallback.

## Prisma Runtime Status

| Prisma table | New runtime use | Source of truth |
|---|---|---|
| `AdminAccount` | Admin auth/profile/password/directory | Neon |
| `AdminSession` | Admin session validation/revocation | Neon + HttpOnly cookie |
| `User` | Parent registration/login/profile | Neon |
| `Session` | Parent session lifecycle | Neon + HttpOnly cookie |
| `Student` | Parent registration/profile/student updates | Neon |
| `ParentStudent` | Registration relationship | Neon |
| `Ticket` | New tickets and workflow updates | Neon |
| `TicketActivity` | New ticket history/comments/status changes | Neon |
| `TicketNote` | New internal notes | Neon |
| `Attachment` | New attachment metadata | Neon |
| `CarouselSlide` | New slide metadata | Neon |

# SINGLE SOURCE OF TRUTH MATRIX

| Data | Current Source of Truth | Secondary/Temporary Storage | Live? |
|------|-------------------------|----------------------------|-------|
| Admin accounts | Neon `AdminAccount` | In-memory UI cache; legacy local key untouched | Yes |
| Admin sessions | Neon `AdminSession` + `helios_admin_session` | In-memory UI cache | Yes |
| Parent accounts | Neon `User` | Legacy `helios_parent_account` untouched | Yes |
| Parent sessions | Neon `Session` + `helios_session` | Legacy `helios_parent_session` untouched | Yes |
| Students | Neon `Student` | Historical ticket JSON snapshots | Yes |
| Parent-student relationships | Neon `ParentStudent` | None | Yes |
| Tickets | Neon `Ticket` | Historical localStorage data ignored | Yes |
| Activities | Neon `TicketActivity` | None | Yes |
| Internal notes | Neon `TicketNote` | Unified API activity response | Yes |
| Escalation/resolution/ownership | Neon `Ticket` fields | None | Yes |
| Attachment metadata | Neon `Attachment` | None | Yes |
| Attachment files | `ticket-attachments` object bucket | None | Configuration required |
| Dashboard slide metadata | Neon `CarouselSlide` | None | Yes |
| Dashboard image files | `dashboard-images` object bucket | None | Configuration required |

## Remaining Limitations

- Private object-storage credentials are loaded only on the server from the ignored local environment configuration. New file uploads fail with a proper server error if that configuration is unavailable; no browser-storage fallback is used.
- Existing prototype localStorage data is intentionally not migrated, reconciled, or deleted.
- The Prisma schema is synchronized with `prisma db push`; no migration history has been created in this repository.

# FINAL RUNTIME PERSISTENCE AUDIT

Audit scope: application source under `app/`, `lib/`, `middleware.ts`, server utilities, client helpers, API routes, and upload/storage code. Generated `.next` output and dependencies were excluded. The audit searched for `localStorage`, `sessionStorage`, `document.cookie`, cookie APIs, all known legacy keys, `blob:`, `FileReader`, `URL.createObjectURL`, `indexedDB`, and browser persistence helpers.

Conclusion: **NEW persistent data is fully Neon-backed**. There are zero active writes of new persistent application data to `localStorage` or `sessionStorage`.

| Data | Runtime Source of Truth | Write Path | LocalStorage Write? | Object Storage? |
|------|-------------------------|------------|---------------------|-----------------|
| Parent account | Neon `User` | Registration client -> `POST /api/auth/register` -> Prisma `User` | No; in-memory response only | No |
| Student | Neon `Student` | Registration client -> `POST /api/auth/register`; placement/profile client -> `PATCH /api/auth/profile` | No | No |
| ParentStudent relationship | Neon `ParentStudent` | `POST /api/auth/register` transaction | No | No |
| Parent session | Neon `Session` plus HttpOnly `helios_session` cookie | `createSession` in login/register; revoke/logout server actions | No; cookie is server-managed auth state | No |
| Ticket | Neon `Ticket` | Parent dashboard -> `lib/local-tickets.ts` API client -> `POST /api/tickets` | No; historical function names do not imply local persistence | No |
| Ticket activity | Neon `TicketActivity` | Ticket creation and `PATCH /api/tickets/[ticketNumber]` | No | No |
| Ticket note | Neon `TicketNote` | Admin ticket update -> `PATCH /api/tickets/[ticketNumber]` | No | No |
| Escalation state | Neon `Ticket.escalatedTo` / `escalatedAt` | Admin ticket update -> `PATCH /api/tickets/[ticketNumber]` | No | No |
| Taken-up/ownership state | Neon `Ticket` ownership fields | Admin dashboard/taken ticket updates -> `PATCH /api/tickets/[ticketNumber]` | No | No |
| Resolution/resolvedBy | Neon `Ticket.resolvedBy` / `resolvedAt` and status | Admin ticket update -> `PATCH /api/tickets/[ticketNumber]` | No | No |
| Ticket attachment metadata | Neon `Attachment` | `POST /api/tickets` transaction after object upload | No | Reference only; metadata is in Neon |
| Ticket attachment file | `ticket-attachments` private bucket | `POST /api/tickets` -> `uploadObject` | No | Yes; protected reads use signed URLs |
| Dashboard slide metadata | Neon `CarouselSlide` | Admin carousel -> `POST/PATCH/DELETE /api/admin/slides` | No | Reference only; metadata is in Neon |
| Dashboard image file | `dashboard-images` private bucket | Admin carousel -> `uploadObject` before `CarouselSlide` write | No | Yes; reads use signed URLs |
| Admin account | Neon `AdminAccount` | Server seed/import or admin account API; normal reads use `/api/admin/accounts` | No; legacy import helper is unused | No |
| Admin profile changes | Neon `AdminAccount` | Admin profile client -> `PATCH /api/admin/profile` | No | No |
| Admin password changes | Neon `AdminAccount.passwordHash` | Admin profile client -> `PATCH /api/admin/password` | No | No |
| Admin session | Neon `AdminSession` plus HttpOnly `helios_admin_session` cookie | Admin login/logout server actions | No; cookie is server-managed auth state | No |

## Hydration and Fallback Audit

- Parent registration, login, profile loading, and refresh call the auth APIs. `lib/client-auth.ts` stores only the current response in module memory; it never reads either legacy parent key.
- Admin login, profile loading, dashboard hydration, and ticket loading call `/api/admin/*` or `/api/tickets`. `lib/client-admin-auth.ts` keeps a module `Map` cache; it does not use browser storage for the active session.
- Carousel loading calls `/api/admin/slides`. The public home page's `storage` listener only triggers another API fetch when the old slide key changes; it does not read that key or update Neon from it.
- Admin page `storage` listeners only trigger fresh server reads when legacy keys change. They do not read legacy values, write browser storage, or issue updates based on legacy payloads.
- Ticket loading always calls `/api/tickets` or `/api/tickets/[ticketNumber]`. There is no empty-result fallback to `helios_parent_tickets`.
- Upload failures return real HTTP errors. No upload route saves file bytes, `blob:` URLs, or metadata to browser storage.
- `/api/admin/import` and `migrateLocalAdminAccounts` are legacy explicit-import compatibility code. The client helper has no call sites, and no login, registration, refresh, hydration, or API route invokes it automatically. It is not part of the new runtime source of truth.

# REMAINING BROWSER STORAGE

- `window.localStorage.getItem("helios_admin_accounts")` in `lib/client-admin-auth.ts` — **A. LEGACY DATA READ ONLY**. It is used only by the unused explicit admin migration helper; it is not used by current admin login, profile, dashboard, or session hydration.
- `helios_parent_account`, `helios_parent_session`, `helios_parent_tickets`, `helios_dashboard_slides`, `helios_admin_account`, `helios_admin_accounts`, and `helios_admin_session` constants — **F. UNUSED/DEAD CODE** as browser persistence keys. They are retained for legacy compatibility/documentation and have no active read/write path except the single admin-account legacy read above.
- `StorageEvent` listeners mentioning legacy keys in admin pages and the home page — **C. UI/TEMPORARY STATE**. They only request a fresh API read; they do not read the event's stored value or persist application data.
- `URL.createObjectURL(file)` in `app/admin/carousel/page.tsx` — **C. UI/TEMPORARY STATE**. It is an in-memory upload preview only; the URL is never sent to an API, written to Neon, or stored in browser persistence. The server receives the actual `File` bytes and stores them in `dashboard-images`.
- `cookies()` in `lib/auth.ts`, `lib/admin-auth.ts`, auth routes, and `middleware.ts` — **D. AUTH/SESSION STATE**. These are HttpOnly server-managed cookies backed by Neon `Session` or `AdminSession`, not localStorage/sessionStorage.
- No `sessionStorage`, `document.cookie`, `FileReader`, `indexedDB`, or browser persistence helper usage was found in application source.

## Audit Result

**NEW persistent data is fully Neon-backed.** No active persistent application data write targets localStorage or sessionStorage. New files are stored only in `dashboard-images` or `ticket-attachments`; PostgreSQL stores only their metadata and stable storage keys.
