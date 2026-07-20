# Waiter App Audit

Audit date: 2026-07-20 · Branch: `aditya/main`

The waiter app is three routes under `frontend/src/routes/waiter/`, running on a
device-paired session. Today it does exactly one job: pair the device, pick a
table, send items to the kitchen. Everything else — editing an order, seeing
whether it's ready, printing, settling — lives only in the manager app. This
document records the current state, the gaps, and a suggested build order.

---

## 1. Current state

### Authentication — `WaiterAuthPage.tsx`

- Device generates and stores its own id in `localStorage["waiter_device_id"]`.
- `POST /waiters/devices/request` returns a grouped 12-char code
  (`backend/app/routers/waiters.py:186`); the screen polls
  `POST /waiters/devices/poll` every 3s until a manager activates it.
- The issued JWT carries `device_id` and **no** `user_id`. `get_current_user`
  (`backend/app/core/deps.py:25-36`) resolves the currently assigned staff member
  live on every request, so a manager reassigning the device takes effect at once.
  Role is always `"staff"`.
- The waiter never picks who they are — assignment is manager-only via
  `PATCH /waiters/devices/{activation_id}` (`waiters.py:302`).

### Tables — `WaiterTablesPage.tsx`

- Floor-grouped grid from `useFloors()` + `useTables()` (8s poll,
  `api/queries.ts:49`).
- Status colours for `available` / `occupied` / `reserved`, `DwellTimer` driven by
  `table.seated_at`, `searchFloors()` text filter, `OfflineStatus` badge, and
  logout via `waiterLogout()` (best-effort network call, then local sign-out).

### Ordering — `WaiterOrderPage.tsx`

- Reuses the shared `MenuBrowser`, `CartPanel`, and `useCart` — the same
  components the manager's `OrderPage` uses.
- Sends `createOrder({ table_id, items, status: "pending" })` through
  `idempotentPost` (`lib/offlineQueue.ts:85`), then navigates back to the grid.
- Waiter attribution is stamped **server-side** from the device assignment
  (`backend/app/routers/orders.py:47-53`) — the client sends no `waiter_id`.

### Platform already available (built, not waiter-specific)

| Capability | Where |
|---|---|
| PWA shell precache + autoUpdate SW | `frontend/vite.config.ts` |
| React Query cache persistence | `frontend/src/main.tsx` |
| IndexedDB offline write queue + drain on reconnect | `lib/offlineQueue.ts` |
| Device-allocated invoice serials (works offline) | `lib/series.ts` |
| Local ESC/POS thermal printing | `lib/printer.ts`, `lib/escpos.ts` |
| Notification store + alerts panel | `lib/notifications.ts`, `components/AlertsBell.tsx` |
| Order lifecycle state machine | `backend/app/services/orders.py`, `PUT /orders/{id}/status` |
| Offline-replay conflict reconciliation | `backend/app/routers/reconciliation.py`, `/reconcile` |

Most of what the waiter app is missing does **not** need new infrastructure —
the plumbing exists and is simply not wired into the waiter routes.

---

## 2. Backlog

Effort: **S** ≈ under a day · **M** ≈ 1–3 days · **L** ≈ multi-day / needs design.

### P0 — correctness bugs ✅ done

| # | Area | Issue | Files | Status |
|---|---|---|---|---|
| 1 | Ordering | Existing open order for a table was never loaded — every send created a **new** order, producing duplicates that surface in `/reconcile` as `duplicate_table_orders`. | `routes/waiter/WaiterOrderPage.tsx` | **Fixed** — cart seeds from `useActiveOrders` and a second round calls `updateOrder`. Seeding *merges* with anything already tapped so a late poll can't drop items. |
| 2 | Ordering | `taxPercentage={0}` hardcoded, so the waiter's on-screen total disagreed with the bill. | `routes/waiter/WaiterOrderPage.tsx` | **Fixed** — uses `useCafe()` cgst + sgst, same as the counter. |
| 3 | Ordering | No `invalidate(["orders","tables"])` after sending — the grid stayed stale up to 8s. | `routes/waiter/WaiterOrderPage.tsx` | **Fixed** — `useInvalidate()` before navigating back. |
| 4 | Auth | `/waiter/*` had no `allowedRoles` guard, so a manager navigating client-side entered the waiter app holding a manager-scoped token. | `App.tsx` | **Fixed** — `allowedRoles={["staff"]}`. |
| 5 | Auth | Suspected unhandled 401 after a manager revokes a device. | — | **Not a bug.** `POST /auth/refresh` 401s for a revoked device (`routers/auth.py:225-230`), so the axios interceptor clears the waiter-scoped session and redirects to `/waiter` (`api/client.ts:90-93`). Verified, no change needed. |

**Known limitation introduced by #1:** the offline queue only replays POSTs
(`lib/offlineQueue.ts`), so an *edit* to an open order can't be queued. When the
device is offline the waiter page falls back to firing a new queued order and
tells the waiter it will need merging — the pre-existing behaviour. Queuing PUTs
is Phase-2 offline work.

### P1 — core waiter workflow

| # | Area | Feature | Notes | Status / Effort |
|---|---|---|---|---|
| 6 | Ordering | View and edit an open table order — see what was already fired, append. | | **Done** (with #1). Removing an already-fired item is deliberately *not* offered — pulling a dish the kitchen is cooking is a manager action. |
| 7 | Kitchen | Order status visibility. | | **Done.** Each tile shows the order's kitchen state; a served table gets a success ring so an unpaid bill is the loudest thing on the floor. `components/OrderStatusBadge.tsx` holds the labels. |
| 8 | Kitchen | Advance status from the device. | | **Done.** Sending a round moves `pending → preparing`; a "Mark served" button moves `preparing → ready`. |
| 9 | Printing | KOT print from the device. | | **Done.** `buildKOT` (`lib/escpos.ts`) + `printKitchenTicket` (`lib/printer.ts`), local-first so it prints during an outage. |
| 10 | Ordering | Take-away / counter order from a waiter device. | | **Done.** `/waiter/order` with no `tableId`. Fired to the kitchen like any other order; the customer pays at the till, since devices never settle. |
| 11 | Tables | Table actions: free, transfer. | | **Done.** New `POST /tables/{id}/transfer` moves the order, the occupied state, and the dwell clock, then frees the source. Merge & split not built — they need an order-splitting model that doesn't exist yet. |
| 12 | Billing | Settle a bill from the device. | **Won't do — decided 2026-07-20.** Money stays on one till: the waiter stops at "Mark served" and the manager settles. This is now enforced server-side, not just hidden in the UI (see #25). |

**Lifecycle semantics settled while doing #7/#8.** The backend has modelled
`pending → preparing → ready → completed` since `services/orders.py` was written,
but nothing in the app ever produced those states — `AlertsBell` listened for
`ready` and it never arrived. The waiter device is now the producer, using the
meaning `AlertsBell.tsx:92` already assumed:

| State | Means | Set by |
|---|---|---|
| `pending` / `active` | Order taken, kitchen doesn't have it yet | order created |
| `preparing` | KOT fired, kitchen is cooking | waiter sends a round |
| `ready` | Food is on the table, bill is due | waiter taps "Mark served" |
| `completed` | Settled | `POST /bills` (`routers/bills.py:123`) |

Only `completed`/`cancelled` free the table, so marking served never releases a
table before it has paid.

**One gap this surfaced, still open:** `POST /printer/kot` is a **mock** that only
logs (`routers/printer.py:1`). There is no real server-side print fallback, so
the waiter app always warns when the local printer is unavailable rather than
reporting a false success.

**Kitchen display — built.** `/waiter/kitchen` (`routes/waiter/WaiterKitchenPage.tsx`)
runs on the same paired device session, so a tablet on the pass becomes the
kitchen screen with no extra login. It owns `preparing → ready` properly: tickets
oldest-first, un-started ones outlined in warning, notes never truncated. The
waiter's own "Mark served" stays as the fallback for a café with no kitchen
screen.

### P2 — polish and device fit

| # | Area | Item | Files | Effort |
|---|---|---|---|---|
| 13 | Billing | Capture customer name/phone at the waiter step instead of only at manager settle. | `WaiterOrderPage.tsx` | S — open |
| 14 | Tables | Reservations invisible to the waiter — a `reserved` table shows no name, time, or guest count. Device reads of `/reservations` are allowed (see #25), so this is frontend-only. | `WaiterTablesPage.tsx`, `useReservations` | S — open |
| 15 | Menu | Per-item modifiers / variants — only free-text `notes` exists today. | `useCart.ts`, `CartPanel.tsx`, menu model | L — open |
| 16 | Reporting | No shift view for the waiter ("what did I fire this hour"). `/waiters/{id}/stats` is manager-gated, and devices are now blocked from reporting endpoints entirely (#25) — this needs a deliberate device-safe endpoint, not a loosened one. | new route + endpoint | M — open |
| 17 | Layout | Desktop-only split with no mobile breakpoint. | | **Done.** On a phone the menu owns the screen and the cart slides over it, with a running-total bar as the way in. Splitting the width leaves neither usable. |
| 18 | Touch | Cart quantity buttons were 28px. | | **Done** — 44px. Tapped one-handed, mid-service. |
| 19 | Ordering | Double-submit guard. | | **Done** with Phase A (early return on `sending`, plus the send button disables when there's no new round). |
| 20 | Sync | No manual refresh on the tables grid. | | **Done** — retry lives on the error state, where it's actually needed. Pull-to-refresh and a "last synced" stamp still open. |
| 21 | States | A failed `useTables()` rendered as "No tables configured yet". | | **Done.** Loading, error-with-retry, and genuinely-empty are now three different screens — the old copy sent waiters to their manager for a network problem. |
| 22 | Pairing | Code never refreshed on expiry. | | **Done** — live countdown, self-clears at zero with an explanation, and a "Get a new code" button. |
| 23 | Display | No dark mode or large-type mode for floor use. | `index.css`, waiter routes | M — open |

### Device scope (#25) — what a paired tablet may do

A device token is issued to a *tablet*, not a person: it is long-lived, whoever
is holding the device is the user, and a manager reassigns it without the device
re-authenticating. Right for taking orders, wrong for everything else. Enforced
by `require_user_session` (`backend/app/core/deps.py`), a separate axis from
`require_role` — it answers "is a person behind this request".

| Device **can** | Device **cannot** |
|---|---|
| Read menu, floors, tables, orders, cafe settings, reservations | Settle a bill (`POST /bills`) or claim invoice serials |
| Create / edit orders, advance status | Cancel an order (`DELETE /orders/{id}`) |
| Print a KOT | Print a bill |
| Read its own device record | Read bills, revenue reports, or inventory |
| | Open or close the day session |
| | Create, edit, or cancel reservations |

Covered by `backend/app/tests/test_device_scope.py` (21 cases, including one that
asserts managers are *not* caught by the lockdown).

### P3 — hardening / ops

| # | Area | Item | Effort |
|---|---|---|---|
| 24 | Auth | Refresh-token flow exists, but there's no visible re-pair path if refresh fails mid-shift. | S |
| 25 | Security | A device session passed plain `get_current_user` with no scope check, so a paired tablet could settle bills, cancel orders, read every bill and revenue report, and open/close the day. | **Fixed** — `require_user_session` in `core/deps.py`. |
| 26 | Ops | `waiterLogout` is fire-and-forget (`WaiterTablesPage.tsx:39`) — a device that loses network stays "signed in" in the manager panel. A heartbeat or last-seen timeout would fix it. | S |

---

## 3. Suggested build phases

**Phase A — make it correct** (#1–#5) — ✅ done
Duplicate orders and a wrong on-screen total were the two that hurt in service.
#5 turned out to be already handled. Next up: Phase B.

**Phase B — close the kitchen loop** (#6, #7, #8, #9) — ✅ done
Open-order editing, status visibility, KOT print. The screen is no longer a
one-way send button. Next up: Phase C.

**Phase C — extend authority** (#10, #11, #25) — ✅ done
Take-away and table transfer shipped. #12 (settle-from-device) was decided
against: money stays on one till. #25 landed alongside, so the widening came with
the scope check that bounds it.

**Phase D — device fit** (#17–#22) — ✅ done
Mobile layout, touch targets, states, pairing UX.

## Still open

| # | Item | Why it was left |
|---|---|---|
| 13 | Customer name/phone at the waiter step | Manager captures it at settle today; no one is blocked. |
| 14 | Reservation detail on a `reserved` tile | Frontend-only; device reads are already permitted. |
| 15 | Per-item modifiers / variants | Needs a menu-model change, not a waiter-app change. |
| 16 | Waiter's own shift summary | Devices are now blocked from reporting endpoints. This wants a purpose-built device-safe endpoint, not a hole in #25. |
| 23 | Dark / large-type mode | `next-themes` is already a dependency, so this is mostly token work. |
| — | Merge & split tables | Needs an order-splitting model that doesn't exist. |
| — | Real server-side printing | `POST /printer/kot` and `/printer/bill` are still mocks that log. |
| 26 | Device "signed in" goes stale on network loss | Wants a heartbeat or a last-seen timeout. |

## Verification

- `cd backend && python -m pytest` — 112 passing, including
  `test_device_scope.py` (21) and `test_table_transfer.py` (9).
- `cd frontend && yarn typecheck && yarn build`.
- By hand: pair a device, fire a round at a table, watch the ticket print and the
  tile move to "In kitchen"; open `/waiter/kitchen` on a second device and mark
  it Ready; confirm the tile rings green; move the sitting to another table and
  check the dwell timer does not reset.
