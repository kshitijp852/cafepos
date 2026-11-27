# Frontend Slice Plan — Catch Up to the New Backend + Responsive + Admin Dashboard

**Date:** 2026-10-08
**Scope:** Frontend (`frontend/src/`) only. Builds on the backend rework already
landed on `vivek/changes` (slices 1–8 of `my-brainstorming/plans/backend/slice-plan-07102026.md`).
**Locked decisions** (from discussion, same day):

- **Phase 1 is a rework, not a rewrite.** Keep the existing stack (Vite, React 18,
  React Router 7, TanStack Query, Radix UI primitives under `components/ui`,
  Tailwind, the offline-queue for orders/bills, the printer code) and the existing
  page inventory. No new libraries, no restructuring that isn't forced by the
  backend changes.
- **Cookie-based auth: descoped for this phase.** Hosting topology (same
  top-level domain vs. not) isn't decided yet, and cookie auth needs that
  decided first to pick a CSRF strategy. Keep the current bearer-token-in-
  localStorage + axios-interceptor approach exactly as it is.
- **Cafe-scoped URLs (`base-url/cafe-slug/...`): descoped for this phase.**
  No `slug` field, no path-based tenancy. Routes stay flat, exactly as today.
  Login stays a single global `/login`.
- **What's actually mandatory, not optional polish:** the app is currently
  broken against the live backend in three concrete ways, independent of any
  "let's modernize it" ambition:
  1. Device-pairing is 100% gone server-side (backend Slice 6) — every screen
     that calls `/waiters/devices/*` or `/devices/me` now 404s. The waiter app
     cannot be logged into at all today.
  2. The staff roster moved from `/waiters` to `/staff` with a different
     payload shape (backend Slice 5) — today's "Add staff" (name + optional
     username, no email) 404s/422s against the real API.
  3. The login page only ever calls `POST /auth/login` — it has no path for a
     newly-invited staff member's first OTP-based sign-in (`login-start` /
     `first-login`, backend Slice 4), so an invited waiter/manager/kitchen
     member can never complete their first login from the UI at all.
  Slices 1–4 below fix these three; they are corrections, not enhancements.
- **Waiter/kitchen UX stays as-is, just re-plumbed.** The existing dedicated
  `WaiterTablesPage` / `WaiterOrderPage` / `WaiterKitchenPage` screens (a
  deliberately simpler, focused UI vs. the full manager `AppLayout`) are kept
  as-is. Only *how someone gets there* changes: instead of pairing a device and
  getting a device token, a waiter/kitchen staff member now logs in with their
  own email+password (invited by the owner/manager, same as everyone else) and
  lands on `/waiter/tables` or `/waiter/kitchen` based on their real role.
  "Assigned waiter" (a device concept) goes away — the signed-in user *is* the
  waiter, same simplification the backend already made (Slice 6).
- **One login, one session, no more scopes.** The dual `manager`/`waiter`
  localStorage-scope design in `auth/storage.ts` existed only to let a manager
  session and a device session coexist in one browser. With device sessions
  gone there is exactly one kind of session; it collapses to a single
  unqualified `user`/`token`/`refresh_token` in localStorage, and `client.ts`'s
  scope-aware redirect-on-refresh-failure goes away too.
- **Platform-admin dashboard is new and deliberately small.** A cafe list
  (filterable by status) and approve/reject actions. No cafe-specific nav
  (Menu/Tables/Reservations/etc. are meaningless for a platform_admin) — its
  own minimal layout, not `AppLayout`.
- **"Awaiting approval" needs a real UI state**, not a wall of toast errors.
  A pending cafe's owner can log in (backend design) but every management
  call 403s with `"Your cafe is awaiting approval."` — today that would just
  surface as scattered red toasts on every page load. Needs one clear blocking
  screen instead.
- **Responsiveness is the one discretionary ask in this plan** (the rest above
  is correctness). Audit every page against the full mobile→desktop range; the
  two concrete weak spots already found (`OrderPage`'s menu pane that's fully
  `hidden` below `md`, and `<table>`-based list pages with no reflow) get fixed
  properly; everything else gets at least a pass/fail check.

Each slice below is one commit-sized, sequential, independently verifiable
change, same discipline as the backend plan. There is no automated frontend
test suite (`package.json` has no vitest/jest) — verification is `tsc --noEmit`
(already wired into `npm run build`) plus a concrete manual click-through list
per slice against the real running backend.

---

## Slice 1 — Role/type rework + delete device-pairing code

**What changes**
- `src/lib/types.ts`: `Role` becomes `"platform_admin" | "owner" | "manager" | "waiter" | "kitchen"`. Drop `DeviceActivation` interface; drop `username` from `User` (backend dropped it in Slice 5). `AuthResponse`/`User` otherwise unchanged.
- `src/api/endpoints.ts`: delete the entire "Devices" section (`requestDeviceCode`, `pollDeviceCode`, `getDeviceMe`, `waiterLogout`, `activateWaiterDevice`, `assignDevice`, `getWaiterDevices`, `revokeWaiterDevice`, `AssignedUser`/`DeviceInfo`/`DevicePollResult` types).
- `src/api/queries.ts`: delete `useDevice`, `useWaiterDevices` and their query keys.
- Delete `src/routes/waiter/WaiterAuthPage.tsx` entirely (the device-code pairing screen — no backend left to talk to).
- `src/auth/storage.ts`: collapse the `Scope`/`PREFIX` design to a single unqualified key space (`user`, `token`, `refresh_token`). Delete `scopeForPath`.
- `src/api/client.ts`: remove the `scopeForPath`-based branch in the 401-refresh-failure handler — always redirect to `/login`.
- `src/components/RequireAuth.tsx`: remove `redirectStaffToWaiter` and the `scopeForPath`-based login redirect (both device-session concepts); it becomes a plain "logged in + role in `allowedRoles`" guard.
- `src/components/AppLayout.tsx`: remove the "Waiter Mode" account-menu item (it opened `/waiter`, the now-deleted pairing screen) and its `DeviceMobile` icon import.
- `src/App.tsx`: remove the `/waiter` route (pairing screen) and the `allowedRoles={["staff"]}` guard group's dependency on the old role value — role literals get fixed in Slice 2 alongside the real routing rework.

**Confidence:** 98%+. Mechanical deletion of code whose backend no longer exists, plus a type-literal rename. The only judgment call (keeping the waiter/kitchen screens, just re-pointed) is already locked above.

**Verification:** `npm run build` (tsc) passes with zero errors after every other file that imported the deleted exports is fixed (expect this slice to *surface* those call sites via type errors — fixing them is Slices 2–3, so this slice may need to land together with enough of Slice 2 to compile; see note below).

> **Sequencing note:** Slice 1's deletions and Slice 2's login/routing rework are tightly coupled (`RequireAuth`, `App.tsx`, and `storage.ts` all change in both). They may need to land as one combined commit rather than two if `tsc` can't pass in between — treat the split above as a description of *what* changes, not a hard requirement to commit them separately.

---

## Slice 2 — Unified login UI + role-based post-login routing

**What changes**
- `src/api/endpoints.ts`: add `loginStart(email)` → `POST /auth/login-start` (returns `{next: "password"|"verify", dev_otp?}`) and `firstLogin({email, otp, password, confirm_password})` → `POST /auth/first-login` (returns `AuthResponse`, same shape `loginUser` already returns).
- `src/routes/LoginPage.tsx`: the **Login** tab's single email+password form becomes a 2-step flow:
  1. Email only → call `loginStart`. If `next === "password"`, reveal the password field (existing behavior, same screen, no extra navigation). If `next === "verify"`, reveal OTP + new-password + confirm-password fields and submit through `firstLogin` instead of `loginUser`.
  - DEV convenience: if `dev_otp` comes back, prefill it (same pattern already used in the register tab).
  - The existing **Register** tab (owner self-signup) is untouched — it already does its own separate OTP flow for a different purpose (creating a brand-new cafe, not a staff member's first login).
- Post-login redirect becomes role-based instead of the current unconditional `/dashboard`:
  - `platform_admin` → `/admin` (new, built in Slice 5 — route to a placeholder until then)
  - `owner` / `manager` → `/dashboard`
  - `waiter` → `/waiter/tables`
  - `kitchen` → `/waiter/kitchen`
- `src/App.tsx`: role literals updated everywhere (`"owner","superadmin"` → `"owner","manager"`; `"staff"` → `"waiter","kitchen"`); the waiter-app route group's guard becomes `allowedRoles={["waiter","kitchen"]}` with no `redirectStaffToWaiter` (that prop is gone per Slice 1 — the guard itself is now sufice since waiter/kitchen never reach the manager route group at all).
- `src/routes/waiter/WaiterTablesPage.tsx`, `WaiterKitchenPage.tsx`, `WaiterOrderPage.tsx`: replace `useDevice()` (deleted in Slice 1) with `useAuth()` — the signed-in user's own `name`/`id` *is* the waiter identity, no "assigned user" lookup needed. Replace the `waiterLogout(deviceId)` call with the ordinary `useAuth().logout()`.
- `src/routes/StaffDetailPage.tsx` / wherever `/waiters/{id}/stats` is called: update the endpoint path to `/staff/{id}/stats` (trivial rename, matches backend Slice 5).

**Confidence:** 95%. The login-flow rework itself (login-start/first-login wiring) is mechanical and mirrors the existing register-tab OTP pattern closely — high confidence. The slightly-lower-than-98% is the role-based redirect table: a `platform_admin` landing page doesn't exist until Slice 5, so this slice ships a placeholder route for it, which is a minor, explicitly-flagged loose end rather than an unknown.

**Verification:** Manually click through: (a) an owner logging in with an existing password lands on `/dashboard`; (b) a freshly-invited staff member (created via Slice 3's invite flow, or directly via `POST /api/staff` through Swagger in the interim) completes `login-start`→`first-login` and lands on the correct role-based route; (c) a waiter/kitchen session can still use their existing floor/kitchen screens end-to-end (seat a table, fire an order, advance its status) with no references to a device identity left anywhere in the UI.

---

## Slice 3 — Staff roster rework (invite-based)

**What changes**
- `src/api/endpoints.ts`: replace the "Staff roster" section — `getWaiters`→`getStaff` (`GET /staff`), `createWaiter`→`inviteStaff({name, email, role})` (`POST /staff`, returns the created user plus `dev_otp` in DEV mode), add `resendInvite(id)` (`POST /staff/{id}/resend-invite`), `updateWaiter`→`updateStaff` (name only now — `username` is gone), `deactivateWaiter`/`reactivateWaiter`/`deleteWaiter` repointed to `/staff/*`.
- `src/api/queries.ts`: `useWaiters` → `useStaff` (same shape, new query key/endpoint).
- `src/routes/StaffPage.tsx`: substantial rework —
  - Delete the entire "Devices" section (table, "Activate a device" dialog, rename dialog, assign-waiter `<Select>`) — none of it has a backend anymore.
  - "Add staff member" form becomes **name + email + role** (`owner` can pick `manager`/`waiter`/`kitchen`; a `manager`-logged-in user's role `<Select>` only offers `waiter`/`kitchen`, matching the backend's "a manager can't add another manager" rule — mirror that restriction in the UI so the 403 is never actually hit in normal use, not just caught after the fact).
  - Each roster row shows invite status: unverified (never logged in) vs. active, with a "Resend invite" action for the unverified ones instead of nothing.
  - Remove `username`-related UI (the slugify-on-type behavior, the `@username` display under each name).
- `src/routes/StaffDetailPage.tsx`: drop any `username` display; otherwise unchanged (stats view already works against the renamed endpoint from Slice 2).
- `src/routes/DashboardPage.tsx`: swap `useWaiters` import for `useStaff` (used only for an id→name lookup map — no behavior change).

**Confidence:** 97%. Same shape of change as the backend's own Slice 5, just the UI side of it — the main judgment call (mirror the manager/owner role-option restriction client-side) is a small, well-understood addition, not a new design question.

**Verification:** Owner invites a manager, a waiter, and a kitchen member from the UI; confirm each gets a `dev_otp` surfaced somewhere reachable for manual testing (toast or inline, matching how register's `dev_otp` is surfaced today); confirm a manager session's invite form never offers "manager" as a role option; confirm deactivate/reactivate/delete still work.

---

## Slice 4 — "Awaiting approval" blocking screen

**What changes**
- A pending cafe's owner/manager can authenticate but every management call now 403s with `detail: "Your cafe is awaiting approval."` (backend Slice 3). Today that detail string would render as a generic toast on whichever screen happened to load first — confusing and easy to miss the actual cause.
- Add a one-time check after login (and on app load, for an already-logged-in session): call `GET /cafe` and read its `status` field (backend Cafe model now includes `status: "pending"|"approved"|"rejected"`, Slice 2/3). If not `"approved"` (and the user isn't `platform_admin`, who has no cafe), render a dedicated full-page state — "Your cafe is awaiting approval" for `pending`, a distinct message for `rejected` — instead of the normal app chrome. `/profile` stays reachable from this screen (it's explicitly meant to work for a pending cafe per the backend design) so the owner isn't totally stuck.
- This is most naturally a thin wrapper placed where `AppLayout` already sits in the route tree (`App.tsx`), not a per-page check.

**Confidence:** 96%. The concept and the data needed (`Cafe.status`) already exist server-side; the only design judgment is exactly where in the component tree to place the check, which is a small, contained decision.

**Verification:** Manually flip a test cafe's `status` to `"pending"` directly in Mongo, confirm the blocking screen appears instead of a page full of failed-request toasts, and that `/profile` still works from it; flip back to `"approved"` and confirm normal access resumes.

---

## Slice 5 — Platform-admin dashboard

**What changes**
- `src/api/endpoints.ts`: new "Admin" section — `getAdminCafes(status?)` (`GET /admin/cafes`), `approveCafe(id)` (`POST /admin/cafes/{id}/approve`), `rejectCafe(id)` (`POST /admin/cafes/{id}/reject`).
- New route group in `App.tsx`: `/admin` and `/admin/cafes` (or just `/admin` as the one screen — see below), guarded by `allowedRoles={["platform_admin"]}`, with its **own minimal layout** (a thin header + the content, not `AppLayout` — no cafe-specific nav makes sense for a platform_admin).
- New page `src/routes/admin/AdminCafesPage.tsx`: a filterable list (pending/approved/rejected/all) of cafes with name, owner contact, created date, and status; Approve/Reject buttons on pending rows. Given the "simple" ask, this can reasonably be a single page rather than a multi-screen admin section in phase 1.
- Resolves the placeholder from Slice 2 — `platform_admin` now has a real `/admin` to land on post-login.

**Confidence:** 97%. Small, self-contained, no interaction with any other slice's internals beyond the route guard and the login redirect target already wired in Slice 2.

**Verification:** Log in as a platform_admin (created via `scripts/create_platform_admin.py`), confirm the cafe list loads and filters by status, approve a pending test cafe and confirm its owner immediately stops seeing the Slice 4 blocking screen.

---

## Slice 6 — Menu price-change-approval UI

**What changes**
- `src/api/endpoints.ts`: `updateMenuItem`'s response type gains an optional `price_change_status?: "pending_approval"` (backend Slice 8 — present only when a manager's price edit was held back). New "Price requests" section: `getPriceRequests(status?)` (`GET /menu/price-requests`), `approvePriceRequest(id)`, `rejectPriceRequest(id)`.
- `src/routes/MenuPage.tsx`: when a manager edits an item's price and the response carries `price_change_status === "pending_approval"`, show that inline (e.g. a small badge/note next to the item: "Price change to ₹X pending owner approval") instead of the UI implying the edit simply saved — today's code would silently display the *old* price with no explanation, since the backend deliberately doesn't apply it yet.
- New small section (owner-only — reuse the existing `allowedRoles`/role-check pattern already used elsewhere) listing pending price-change requests with Approve/Reject actions. Given "simple" + "no major changes," this can live as a collapsible section on `MenuPage` itself rather than a new route.

**Confidence:** 97%. Same shape as Slice 5 — small, self-contained, single-file-centric.

**Verification:** As a manager, edit an item's price; confirm the item keeps showing its old price with the pending-approval note. As the owner, see the request, approve it, confirm the new price now shows; reject a second one and confirm the price stays unchanged.

---

## Slice 7 — Responsiveness pass

**What changes**
- `src/routes/OrderPage.tsx`: the menu-browse pane is currently `hidden ... md:block` (fully absent below `md`) with a fixed `md:w-[380px]` cart pane — below `md` there is no way to browse the menu at all in the current markup. Rework to a mobile-usable layout: e.g. a tab/segmented-control switch between "Menu" and "Cart" below `md`, keeping the existing side-by-side layout at `md`+ unchanged.
- `<table>`-based list screens with no reflow (`StaffPage`, `HistoryPage`, `InventoryPage`, `AnalyticsPage`, `ReservationsPage`, `StaffDetailPage`): add a card-list presentation below a breakpoint (likely `sm` or `md`, matched per-page to its column count/density) so rows reflow into stacked cards instead of horizontally scrolling inside a bordered `<div>`.
- Full-range audit pass over every remaining page (`DashboardPage`, `CustomersPage`, `ReconciliationPage`, `SettingsPage`, `ProfilePage`, the three waiter/kitchen screens) at a representative set of widths (≈320px, 375px, 768px, 1024px, 1280px+) — most of these already carry `sm:`/`md:`/`lg:` classes per the research pass, so this is mostly verification with small targeted fixes rather than a rework, except where it surfaces a real gap.
- `AppLayout.tsx`'s existing `hidden lg:flex` sidebar / mobile drawer pattern is already sound (confirmed in research) — not touched structurally, just re-verified once the role set changes (Slice 2) don't break its nav-item visibility logic.

**Confidence:** 90%. Lower than the rest of this plan on purpose: "audit every remaining page at every width" is inherently open-ended compared to the other slices' well-defined diffs, and the OrderPage mobile layout is a real (if small) UX design decision, not a mechanical fix. Flagging rather than claiming 98%+ like the rest of this plan.

**Verification:** Manual check at the five widths above for every page in the inventory; OrderPage specifically must be fully usable (browse menu, add items, see cart, pay) on a 375px-wide viewport with no horizontal page scroll.

---

## Summary table

| Slice | Commit boundary | Depends on | Confidence |
|---|---|---|---|
| 1 | Role/type rework + delete device-pairing code | backend slices 1–6 | 98%+ |
| 2 | Unified login UI + role-based routing | 1 | 95% |
| 3 | Staff roster rework (invite-based) | 1, 2 | 97% |
| 4 | "Awaiting approval" blocking screen | 1 | 96% |
| 5 | Platform-admin dashboard | 2 | 97% |
| 6 | Menu price-change-approval UI | — | 97% |
| 7 | Responsiveness pass | 1–6 (touches their screens) | 90% |

Cookie-based auth and cafe-scoped URLs are explicitly out of this plan for
now (see locked decisions above) — revisit once hosting topology is decided.
