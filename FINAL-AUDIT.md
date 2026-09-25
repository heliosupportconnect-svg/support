# Recent Commit Review

Audited commits:

- `2e0af70` `fix: make dashboard image lifecycle safe`: orders object deletion before carousel-row deletion; uploads replacement objects before DB updates; compensates for replacement failures; returns retryable errors. No regression found in the normal lifecycle. Residual failure modes are listed below.
- `0acd8bc` `fix: enforce parent ticket ownership isolation`: derives parent ownership from the server session, scopes parent ticket reads, validates linked students, protects direct ticket and attachment reads, and clears stale client session state. Parent isolation behavior remains correct in the reviewed paths.
- `2cf98ce` `fix: diagnose dashboard publish failures safely`: adds staged dashboard publish handling, sanitized structured logs, request IDs, safe error codes, and orphan cleanup after DB failure. No secret leakage was found in the reviewed logging path.
- `206cc3d` `fix: generate Prisma client during deployment build`: adds Prisma generation to the production build command. The current build uses this command successfully.
- `c21b89c` `feat: complete Helios Parent Support portal`: establishes the current auth, ticket, admin, Prisma, and storage architecture. The five-commit stat includes this initial application implementation, so not every line in that stat is a recent regression.

The current Step 97 attachment implementation is uncommitted and was reviewed separately. It adds an admin-only signed retrieval route, separates parent attachment access, centralizes admin ticket class authorization, and adds View/Download actions.

# Authentication Audit

- Parent login, logout, session lookup, and invalid-session clearing use the `helios_session` server cookie and Neon `Session` records.
- Admin login, logout, session lookup, and revocation use the `helios_admin_session` server cookie and Neon `AdminSession` records.
- Parent dashboard and detail pages force-refresh the server session and clear stale in-memory identity before loading data.
- Client parent/admin modules retain only in-memory session caches for active auth. Legacy admin migration code can read old `helios_admin_accounts` localStorage data, but active login calls the server API.
- No client-provided parent identity is used as the server authentication source.
- No new authentication regression was confirmed.

# Authorization Audit

- Parent list, detail, profile, student, and attachment paths derive ownership from the authenticated parent session.
- Parent ticket creation ignores client ownership claims and validates the selected student through `ParentStudent`.
- Admin ticket detail and mutation paths apply the VP class scopes and Principal/Director full class range.
- The new admin attachment route authenticates the admin, loads the attachment and ticket, applies the same class-scope rule, then creates a five-minute signed URL.
- The existing parent attachment route is parent-only in the current uncommitted implementation.
- Server-side admin list, detail, mutation, and attachment visibility now share the role/workflow rules documented below.

# HIGH ISSUE REMEDIATION

Previous vulnerability:

- `getVisibleTickets()` returned every ticket for any authenticated admin, while `app/admin/dashboard/page.tsx` filtered VP classes only after the response had already exposed ticket and attachment metadata.

Remediation:

- `lib/admin-ticket-access.ts` now provides the shared server-side rules and `getAdminTicketVisibilityWhere()` database predicate.
- `VP_PRIMARY` list/detail/attachment visibility is restricted to historical Class 1-5 snapshots, with a current-student fallback only for rows without a snapshot.
- `VP_SECONDARY` visibility is restricted to historical Class 6-10 snapshots with the same legacy fallback.
- `PRINCIPAL` and `DIRECTOR` visibility is limited to tickets escalated to that role, taken up by that admin, or resolved by that admin.
- `app/api/tickets/route.ts` applies the predicate before Neon returns admin list rows.
- `app/api/tickets/[ticketNumber]/route.ts` and `app/api/admin/attachments/[attachmentId]/route.ts` reuse the same authorization function for detail, mutation, and signed attachment retrieval.

Verification:

- Actual API matrix passed with disposable Class 3, Class 7, and Director-workflow Class 9 fixtures.
- VP_PRIMARY list: Class 3 only; Class 7 and Class 9 detail requests denied.
- VP_SECONDARY list: Class 7/Class 9 scope; Class 3 detail denied.
- Principal list/detail: workflow-visible ticket allowed; Director-only ticket denied.
- Director list/detail: Director-escalated ticket allowed.
- Authorized attachment retrieval returned `307`; out-of-scope VP and unauthorized Director returned `403`.
- Temporary admin sessions and disposable fixtures were deleted in cleanup.
- Unauthorized API responses contained no ticket records.

# Ticket Audit

- Ticket creation persists reporter, linked student, parent/student snapshots, category, status, and activities in Neon.
- Parent ticket list/detail access is reporter-scoped.
- Admin detail access is class-scoped.
- Admin status, escalation, taken-up, resolution, resolvedBy, activities, notes, and historical snapshots are represented in the reviewed code paths.
- The admin mutation workflow was previously exercised successfully on a disposable ticket.
- The admin list now returns only server-authorized workflow/class rows.

# Attachment Audit

- Uploads use the private `ticket-attachments` bucket and persist metadata in `Attachment` rows.
- Upload failure and ticket-transaction failure attempt object cleanup.
- Parent retrieval uses a server-checked reporter relationship and a short-lived signed URL.
- Admin retrieval uses `/api/admin/attachments/[attachmentId]`, checks admin session, attachment ownership through its ticket, class authorization, and then redirects to a five-minute signed URL.
- Download mode adds response content disposition and content type using the stored original filename.
- The admin UI now renders View and Download actions without exposing storage credentials or permanent URLs.
- Unauthenticated smoke tests returned `401` for both attachment routes.
- Authenticated production view/download testing was not run because the new implementation is uncommitted and the deployed site still runs the previous build.
- No duplicate storage client or public object URL was introduced.

# Dashboard Image Audit

- Principal/Director authorization is enforced for dashboard image mutation.
- Upload creates a private `dashboard-images` object before the CarouselSlide row is created.
- DB-create failure attempts orphan cleanup.
- Replacement uploads the new object, updates the row, then removes the old object; failure paths attempt rollback and new-object cleanup.
- Delete removes the targeted object before deleting the row and returns retryable errors for storage/DB failures.
- Homepage/dashboard reads use signed URLs for stored objects.
- MEDIUM: if old-object deletion fails and the compensating DB update also fails, the code deletes the new object while the row can still point at that new key. This is a real residual consistency risk in the exceptional replacement path.
- MEDIUM: if storage deletion succeeds but CarouselSlide deletion fails, the row remains while its object is gone. The endpoint reports a retryable error, but automatic restoration is not possible with the current ordering.

# Neon Database Audit

The Prisma schema and route usage cover the requested models:

- `User`, `Student`, `ParentStudent`, and `Session`: parent identity and ownership.
- `Ticket`, `TicketActivity`, and `TicketNote`: ticket lifecycle and audit history.
- `Attachment`: file metadata and storage keys.
- `CarouselSlide`: dashboard image metadata.
- `AdminAccount` and `AdminSession`: admin identity and sessions.

`npx prisma validate` passed. No local database fallback is used when `DATABASE_URL` is present; the fallback in `lib/prisma.ts` is for missing configuration only.

# Object Storage Audit

- Buckets are separated into `dashboard-images` and `ticket-attachments`.
- Credentials are read server-side from environment variables only.
- Retrieval uses presigned URLs with a five-minute expiry.
- The public object URL helper is not used by application routes reviewed here.
- Upload and failure cleanup paths exist for ticket attachments and dashboard publishing.
- Path-style configuration is supported through `OBJECT_STORAGE_FORCE_PATH_STYLE`.
- No object-storage credentials or permanent private URLs are returned by the reviewed API paths.

# Vercel Deployment Audit

- `package.json` build is `prisma generate && next build`.
- `prisma.config.ts` loads environment configuration and reads `DATABASE_URL`.
- `.env.example` contains placeholders only; no production secret file is tracked.
- Runtime assumptions require Neon `DATABASE_URL`, `AUTH_SECRET`, and server-only S3-compatible storage variables.
- No Vercel or Neon configuration was changed during this audit.
- The uncommitted Step 97 implementation is not yet deployed to Vercel.

# Git/Security Audit

- Branch: `main`.
- `origin/main` is synchronized with local `main`.
- Existing committed latest commit: `2e0af70`.
- Current worktree includes the uncommitted Step 97 attachment changes, the high-priority remediation, and `FINAL-AUDIT.md`.
- No tracked secret files were found. `.env.example` contains placeholders only.
- Static searches found legacy admin localStorage migration code and ordinary catch blocks; these were not automatically removed because they are outside this review's approved change scope.
- No force push, commit, or application-code modification was performed in this audit.

# Remaining Issues

## MEDIUM

- **Dashboard replacement rollback edge case**: if old-object deletion fails and the compensating DB restore also fails, the new object is deleted while the row may retain the new storage key.
- **Dashboard delete consistency edge case**: if object deletion succeeds and CarouselSlide deletion fails, the row remains with a missing object. The endpoint reports a retryable error but does not restore the object.

## LOW

- **Legacy admin localStorage migration surface**: `lib/client-admin-auth.ts` still contains migration/read helpers for old localStorage admin accounts, including client-visible password hashes. Active authentication uses server sessions, and the import route refuses to import when admin accounts already exist, but the legacy surface should be removed or isolated in a planned cleanup.

# Final Assessment

READY

The HIGH admin data exposure is remediated and passed the actual API authorization matrix. Parent ownership paths, admin workflow authorization, signed storage design, database persistence, and build checks remain healthy. Medium dashboard storage consistency edges and the low legacy migration surface remain documented and were not changed in this step. The Step 97 attachment feature remains uncommitted and undeployed.

Validation completed:

- `npx prisma validate`: passed
- `npx tsc --noEmit`: passed
- `npm run lint`: passed with existing warnings only
- `npm run build`: passed
- `git diff --check`: passed
- Unauthenticated attachment endpoint smoke checks: `401` for parent and admin routes
- Server-side admin list/detail/attachment authorization matrix: passed
