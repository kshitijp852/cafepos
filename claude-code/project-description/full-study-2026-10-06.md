# Cafe POS — Full Project Study

**Date:** 2026-10-06
**Branch at time of study:** `aditya/main`
**Scope:** Full backend (`backend/`) and frontend (`frontend/`), docs, tests, git history.

---

## 1. Project Purpose & Domain

**Cafe POS** is a multi-tenant point-of-sale system for cafes/restaurants in India (GST-aware, INR currency, Indian phone/pincode formats).

Core value proposition (from `README.md`):

- **Multi-tenant**: every cafe is isolated by `cafe_id`, derived strictly from the JWT (never a query param) — tenant data can never leak across cafes.
- **Tamper-evident billing**: every bill carries a SHA-256 hash over its immutable content (bill number, items, total, timestamp, series); bills are never hard-deleted (soft-delete/void only) — positions the product for GST/tax-audit compliance.
- **Unified order model**: the same `Order` document and state machine (`pending → preparing → ready → completed`/`cancelled`) covers both dine-in (table-based) and counter/quick-sale (`table_id: null`).
- **Offline resilience**: the frontend is a PWA with an IndexedDB-backed write queue, device-local invoice serial allocation, and a server-side reconciliation workflow for conflicts introduced by offline replay (duplicate orders, double-settled bills).

**Target users / personas**:

1. **Owner/manager** — registers the cafe (mandatory GST capture, OTP-verified email signup), configures menu/tables/staff/tax, settles bills, views analytics/customer insights, resolves offline-sync conflicts.
2. **Waiter/staff** — never logs in with credentials; operates through a manager-paired tablet ("device-first" model). Takes orders, fires KOTs, advances kitchen status, cannot settle bills or see financial reports.
3. **Kitchen staff** (documented, aspirational) via a kitchen-display route (`/waiter/kitchen`) on the same paired-device infrastructure.

Supporting docs and their reliability:

| Doc | Status |
|---|---|
| `QUICKSTART.md` | Current — UI walkthrough for a fresh cafe |
| `SETUP.md` | **Stale** — references `python server.py`, `npm start`, `REACT_APP_BACKEND_URL` (pre-Vite, pre-refactor) |
| `ENV_SETUP.md` | **Partly stale** — same `REACT_APP_BACKEND_URL` issue |
| `CSV_IMPORT_GUIDE.md` | Describes a flow with **no matching backend endpoint found** (see Gaps) |
| `GITHUB_SETUP_CHECKLIST.md` | Generic pre-push security checklist, not project-specific |
| `WAITER_AUDIT.md` | Dated 2026-07-20 — detailed internal audit/backlog of the waiter app; highest-value source for active development context |
| `frontend/DESIGN.md` | Strict monochrome/square-corner design system spec (Archivo Expanded + Montserrat, Phosphor icons only, semantic-only color) |

---

## 2. Backend Architecture (`backend/app/`)

### Stack

FastAPI 0.110.1 + Uvicorn, Python 3.13. **MongoDB** via Motor (async) + PyMongo — no SQL anywhere. Pydantic v2 + pydantic-settings. Auth: custom JWT (PyJWT), bcrypt (passlib) for password hashing, Fernet symmetric encryption available for reversible secrets (legacy, now purged — see `scripts/purge_staff_secrets.py`). httpx for the pincode-lookup proxy and as the async test client. Tests run with pytest + pytest-asyncio **against a real MongoDB**, wiped between tests.

### `backend/app/core/`

- **`config.py`** — `Settings(BaseSettings)` from `backend/.env`. No insecure fallback for `mongo_url`/`jwt_secret`. JWT expiry (access 24h, refresh 30d), `credential_enc_key` (derived from `jwt_secret` if unset), SMTP settings (DEV mode when empty — OTPs/reset links returned directly in the API response), OTP/reset lifetimes, device-pairing code lifetime (15 min), RapidAPI key for pincode lookup, `test_signup_code` (bypasses mandatory GST for QA accounts), `default_country_code` (91).
- **`deps.py`** — three dependencies:
  - `get_current_user` — decodes the Bearer token; for device tokens (`device_id`, no `user_id`), resolves the *currently assigned* staff member live from `device_activations` on every request, so reassigning a device takes effect immediately.
  - `require_user_session` — rejects device-token sessions outright (403) — a separate axis from role checks, used to lock waiter tablets out of money/reporting/destructive actions.
  - `require_role(allowed_roles)` — factory for role-based 403s.
- **`security.py`** — password hashing, Fernet encrypt/decrypt, OTP generation, reset-token generation, device-pairing code generation (`XXXX-XXXX-XXXX`), JWT create/decode for access/refresh/device/device-refresh tokens, each carrying a `type` claim so token kinds can't be swapped.
- **`exceptions.py`** — catch-all handler logging + generic 500 (no stack-trace leakage).
- **`email.py`** — Gmail SMTP via threadpool (non-blocking); DEV mode logs instead of sending.

### `backend/app/db/`

- **`mongo.py`** — single shared `AsyncIOMotorClient`/`db` singleton.
- **`indexes.py`** — startup index setup: unique `users.email`; partial unique `users.username` (ignores nulls); compound unique `(cafe_id, series, bill_number)` on bills (migrated from a legacy `(cafe_id, bill_number)` index via `_migrate_bill_series`); unique `(cafe_id, series_code)` on `bill_series`; TTL indexes on `device_activations`, `pending_registrations`, `password_resets`, `action_otps`.
- **`serialization.py`** — `to_mongo()` wraps `jsonable_encoder` for Mongo-safe writes.

### `backend/app/models/`

- **`common.py`** — `new_id()`, `utcnow()`, `DBModel` base, enums: `Role`, `TableStatus`, `OrderStatus` (`active` kept as alias of `pending`), `PaymentMethod`, `SessionStatus`, `ReservationStatus`.
- **`user.py`** — `User`, signup models with phone/GSTIN normalization validators, reset/profile/password models, waiter-roster models (name-only, no credentials), device-pairing models (`DeviceActivate`, `DeviceCodeRequest`, `DevicePoll`, `DeviceAssign`, `DeviceLogout`, `DeviceActivation`).
- **`cafe.py`** — GSTIN regex validation, CGST/SGST split, packing/delivery charge defaults, `is_test_account` flag.
- **`order.py`** — `Order`/`OrderItem`/`OrderCreate` (client-suppliable `id` for idempotent offline replay).
- **`bill.py`** — `Bill`/`BillItem` with `series`, CGST/SGST amounts and percentages, `bill_hash`, `cloud_synced`, `waiter_id`/`waiter_name`, `dwell_seconds`, `customer_name`/`customer_phone`, `soft_deleted`.
- **`menu.py`** — `Category`, `MenuItem` (`food_type: Literal["veg","non_veg","egg"]`, `variants`/`addons` as untyped `list[dict]`).
- **`table.py`** — `Floor`, `Table` (floor-scoped `code`, `current_order_id`, `seated_at` drives dwell timer), `TableBulkCreate`, `TableTransfer`.
- **`reservation.py`**, **`session.py`** (day/cash-drawer), **`inventory.py`** (no recipe linkage to menu items — roadmap gap).

### `backend/app/services/`

- **`billing.py`** — `calculate_bill_hash` (SHA-256); `next_bill_number` (atomic `$inc` on a per-cafe counter, collision-proof under concurrency); per-device invoice-serial series (`claim_series`, `reserve_series_block` for atomic offline serial blocks).
- **`orders.py`** — state machine: `ALLOWED_TRANSITIONS`, `can_transition()`, `is_terminal()`.
- **`cafe.py`** — `get_tax_percentage()`, single source of truth shared by orders and bills.
- **`phone.py`** — `to_e164()`, best-effort normalization defaulting to India's "91" code, never raises.

### `backend/app/routers/` (all under `/api`)

| Router | Key endpoints | Notes |
|---|---|---|
| `auth.py` | `/register`, `/register/start`, `/register/verify`, `/login`, `/reset/request`, `/reset/confirm`, `/refresh` | OTP-based signup; generic response on reset-request (no email enumeration) |
| `waiters.py` | `/waiters*` CRUD, `/waiters/devices/request|poll|activate|logout`, `/devices/me` | Credential-less device pairing; stats endpoint per staff |
| `menu.py` | categories/items CRUD, `/menu/purge/request|confirm` | OTP-gated bulk purge; **no CSV import endpoint** despite docs |
| `cafe.py` | `GET/PATCH /cafe` | GST cannot be cleared unless `is_test_account` |
| `profile.py` | `GET/PATCH /profile`, `/profile/password` | Owner's own account |
| `pincode.py` | `GET /pincode/{pincode}` | RapidAPI proxy, in-memory cache, `require_user_session` |
| `printer.py` | `POST /bill`, `POST /kot` | **Both are mocks** — log only, no real printing |
| `reservations.py` | CRUD | Device-readable, write-locked to users |
| `sessions.py` | `/current`, `/open`, `/close`, `/history` | Cash drawer, user-only |
| `reports.py` | `/daily`, `/analytics`, `/customers` | Large analytics endpoints; all user-only |
| `inventory.py` | CRUD | Device-blocked even on reads; no recipe auto-deduction |
| `health.py` | `/`, `/health` | Mongo ping |
| `orders.py` | `GET/POST /orders`, `PUT /{id}`, `PUT /{id}/status`, `DELETE /{id}` | Idempotent create; `PUT` edit is **not** offline-queueable; `DELETE` user-only |
| `bills.py` | `POST /bills`, `/series/claim`, `/series/reserve`, `GET /bills`, `POST /{id}/void`, `GET /{id}` | User-only settle; void reverses day-session accrual |
| `tables.py` | floors + tables CRUD, `/tables/bulk`, `/{id}/transfer` | Device writes restricted to `status`/`current_order_id` only |
| `reconciliation.py` | `GET /reconciliation`, `POST /tables/{id}/resolve` | Owner/superadmin-only; surfaces duplicate-order and double-settled-bill conflicts from offline replay |

### `backend/app/main.py` vs `backend/server.py`

`app/main.py` is the real app factory (lifespan index setup, CORS, exception handler, routers mounted under `/api`). `server.py` is a deliberate backwards-compatible shim (`from app.main import app`) for legacy `uvicorn server:app` invocations — not dead code, but `SETUP.md` still instructs the old entrypoint while `README.md`/`Dockerfile` use the new one.

### `backend/scripts/`

- **`seed_demo_data.py`** — generates realistic bill history (configurable days/volume) with weighted hour/weekday patterns, Zipf-distributed item popularity, a 700-customer churn-modeled pool; fully reversible via `--purge`.
- **`purge_staff_secrets.py`** — one-time migration removing now-dead `password`/`pin` fields from staff users and dropping a legacy `credential_audit` collection — evidence of the move away from staff-credential login toward device pairing.
- **`setup_sample_data.py`** (at `backend/`) — basic onboarding seeder (16 menu items, 9 tables, 5 inventory items).

### Key dependencies (`requirements.txt`)

fastapi 0.110.1, uvicorn 0.25.0, motor 3.3.1, pymongo 4.5.0, pydantic 2.12.5, PyJWT 2.10.1, passlib 1.7.4, bcrypt 4.1.3, cryptography≥43.0.0, httpx 0.28.1, pytest 8.4.2, pytest-asyncio 0.24.0.

### Test coverage (113 tests across 15 files)

| File | Tests | Covers |
|---|---|---|
| test_auth.py | 10 | register/login/refresh/reset |
| test_bills.py | 11 | settlement, idempotency, void, series |
| test_cafe.py | 5 | settings, GST rules |
| test_device_scope.py | 9 | device lockdown from money/reporting/destructive actions |
| test_menu.py | 5 | categories/items CRUD |
| test_orders.py | 3 | order lifecycle |
| test_phone.py | 4 | `to_e164` |
| test_pincode.py | 4 | pincode proxy |
| test_profile.py | 10 | profile/password |
| test_reconciliation.py | 2 | conflict detection/resolution |
| test_reports.py | 6 | daily/analytics/customers |
| test_security.py | 3 | JWT/token-type enforcement |
| test_table_transfer.py | 8 | table transfer |
| test_tables.py | 6 | table/floor CRUD |
| test_waiters.py | 14 | roster + device pairing |

**Gaps**: no `test_inventory.py`, no `test_reservations.py`, unclear/likely-absent coverage for the menu purge-OTP flow, `printer.py`, and `/waiters/{id}/stats`. A top-level `tests/__init__.py` at the repo root is an empty vestigial file unrelated to the real suite.

---

## 3. Frontend Architecture (`frontend/src/`)

### Stack

React 18.3.1 + TypeScript 5.6.3, Vite 5.4.10 (+ `vite-plugin-pwa`), React Router 7.5 (`createBrowserRouter`), TanStack Query 5.59 (+ IndexedDB persistence via `idb-keyval`), Tailwind CSS 3.4 + Radix UI primitives (shadcn-style), `@phosphor-icons/react` (icon system of record — `lucide-react` is being migrated out per `DESIGN.md`), axios, `sonner` (toasts), `next-themes` (installed, unused — no dark mode yet).

Build: `tsc --noEmit && vite build` — typecheck gates the build.

### `App.tsx` — routing

Three auth zones:

1. Public: `/login`, `/reset`, `/waiter` (device pairing).
2. **Waiter app** (`allowedRoles={["staff"]}`): `/waiter/tables`, `/waiter/kitchen`, `/waiter/order[/:tableId]`.
3. **Manager app** (`allowedRoles={["owner","superadmin"]}`): `/order[/:tableId]` (chrome-free focused task route), plus `AppLayout`-wrapped `/dashboard`, `/menu`, `/tables`, `/staff[/:id]`, `/reservations`, `/analytics`, `/customers`, `/history`, `/reconcile`, `/inventory`, `/settings`, `/profile`.

Every branch has its own `errorElement` so a render crash shows a recoverable page.

### `main.tsx`

Self-hosted fonts, `initOfflineSync()`, `QueryClient` with 24h `gcTime` (must be ≥ IDB persister's `maxAge`), `PersistQueryClientProvider` with a `CACHE_VERSION` buster, Phosphor icon defaults, `AuthProvider`, `RouterProvider`.

### `api/`

- **`client.ts`** — single axios instance; backend URL resolvable at runtime via `localStorage` override; request interceptor attaches Bearer token; response interceptor does **silent, single-flight 401 refresh** shared across concurrent requests, redirecting to the correct login (`/waiter` vs `/login`) on failure.
- **`endpoints.ts`** — typed wrappers for every backend route. `createOrder`/`createBill` go through `idempotentPost` (offline queue); `createBill` also calls `drawSerial()` first for an offline-safe invoice number.
- **`queries.ts`** — TanStack Query hooks with polling (`useTables`/`useActiveOrders` 8s, `useReconciliation` 15s), plus `useInvalidate()`.

### `auth/`

- **`AuthContext.tsx`** — requires both cached user and token for `isAuthenticated`.
- **`storage.ts`** — **dual-session design**: manager (`pos_*`) and waiter-device (`waiter_pos_*`) sessions coexist in the same browser, scoped by URL path — lets a manager pair a device from the same tab they're signed into.

### `components/`

`AppLayout.tsx` (sidebar shell, GST-missing compliance banner, `OfflineStatus`, `AlertsBell`), `RequireAuth.tsx`, `DwellTimer.tsx`, `FoodTypeMarker.tsx`, `charts.tsx` (dependency-free SVG/CSS chart primitives — no recharts/visx), `ui/` (shadcn-style primitives per `DESIGN.md`: forced-zero border radius, hairline borders, semantic-only color).

### `features/`

`cart/useCart.ts`, `MenuBrowser.tsx`, `CartPanel.tsx` — shared between the manager's `OrderPage` and the waiter's `WaiterOrderPage`, same ordering code path for both roles. `billing/PaymentMethodPicker.tsx`.

### `routes/waiter/`

- **`WaiterAuthPage.tsx`** — device pairing: generates+stores `waiter_device_id`, requests a pairing code, polls every 3s.
- **`WaiterTablesPage.tsx`** — floor-grouped grid (8s poll), `DwellTimer`, search.
- **`WaiterOrderPage.tsx`** — seeds cart from the table's existing open order with **merge** semantics (not overwrite, so a late poll can't drop already-made taps); sends only the delta round so a repeated KOT never re-lists fired items; prints locally via ESC/POS first, falls back to the mocked server endpoint + an explicit toast warning (never silently claims success); auto-advances `pending/active → preparing` on send; offers "Mark served" as a kitchen-loop fallback. An order *edit* that fails offline falls back to creating a new queued order (since the offline queue only replays POSTs) — a documented Phase-2 gap.
- **`WaiterKitchenPage.tsx`** — owns `preparing → ready`.

### `lib/`

- **`offlineQueue.ts`** — `idempotentPost()` attaches a client UUID, queues only on genuine network errors (not HTTP 4xx/5xx, which are rethrown since retrying can't help); `drainQueue()` replays FIFO on reconnect, drops permanently-rejected items with an error notification (never silently swallowed); `usePendingSync()` via `useSyncExternalStore`.
- **`series.ts`** — client counterpart to the backend's per-device series: claims a series code, reserves a block of 100 serials in IndexedDB, hands them out via `drawSerial()`; explicitly skipped for waiter devices (would 403 server-side).
- **`printer.ts`/`escpos.ts`** — **real** local ESC/POS thermal printing (Web USB/Bluetooth types), in contrast to the backend's mock.
- **`csv.ts`** — exists client-side despite no confirmed backend import endpoint (see Gaps).

---

## 4. Data Flow / End-to-End Flow

**Owner onboarding**: `/auth/register/start` (GST mandatory unless `test_code` matches) → OTP (emailed or dev-returned) → `/auth/register/verify` creates `Cafe` + owner `User` → tokens stored under `pos_*`.

**Waiter/device pairing** (credential-less): tablet generates `device_id` → `POST /waiters/devices/request` → 15-min pairing code → polls `/waiters/devices/poll` every 3s → manager calls `/waiters/devices/activate` with the code (optionally assigning a staff roster entry) → device gets a device-scoped JWT (no `user_id`), stored under `waiter_pos_*`. Reassignment from the manager panel takes effect live, no device re-auth needed.

**Order → kitchen → settle**: waiter picks a table → cart seeded from any open order (merge) → delta round POSTed (idempotent, offline-queued) or PUT-edited (not queueable) → status auto-advances to `preparing` → KOT printed locally with mock-fallback + toast → `AlertsBell` surfaces `ready`. **Settlement is manager-only**: draws an invoice serial, computes CGST/SGST + packing/delivery, captures customer name/phone (E.164-normalized), creates the tamper-hashed `Bill`, completes the order, frees the table, accrues into the day's open cash session.

**Offline resilience/reconciliation**: PWA keeps the query cache in IndexedDB for offline reads; writes are idempotent and queued on network failure, drained FIFO on reconnect. Because two tablets can independently act on the same table while offline, `/reconciliation` surfaces duplicate open orders per table and double-settled orders; a manager resolves via `/reconciliation/tables/{id}/resolve` or `/bills/{id}/void` (which reverses the day-session accrual if the bill belongs to today's still-open session).

**Device-scope security model**: `require_user_session` is a hard axis separate from role checks. Devices can read menu/floors/tables/orders/cafe-settings/reservations, create/edit orders, advance kitchen status, print KOTs — but **cannot** settle bills, claim invoice serials, cancel orders, print bills, read bills/reports/inventory, open/close the day session, or write reservations.

**Customer capture / GST / pincode**: GST mandatory for real accounts, enforced at signup and at `PATCH /cafe`; a `gst_required` flag drives a persistent compliance banner. Pincode lookup proxies RapidAPI server-side (key never reaches the browser) for city/state auto-fill. Customer capture currently happens at the manager's settle step only (waiter-side capture is an open backlog item) and feeds `/reports/customers` (capture rate, repeat rate, active/lapsed segmentation).

---

## 5. Recent Development Context

Git history (after an initial run of auto-generated scaffolding commits, likely from the `.emergent` tooling referenced at the repo root) shows a deliberate feature sequence:

1. `5939339` — JWT auth, CSV menu import, table dashboard, environment setup
2. `38cbec4`/`6bedf13` — bill settlement dialog, payment methods, print bill
3. `b510e7b` — premium UI rebuild, credentialed waiter flow, analytics + alerts
4. `440ea12` — **device-first waiter model**, table dwell timer, customer capture (the pivot away from staff credentials, matching `purge_staff_secrets.py`)
5. `68009a5` — **offline resilience, reconciliation, header connectivity status**
6. `643a03a` — owner profile section with mandatory GST and pincode lookup
7. `8854f74` (HEAD) — analytics charts, customer insights, device-session hardening (tightened `require_user_session`)

`WAITER_AUDIT.md` (2026-07-20) tracks a four-phase waiter-app build-out (A: correctness bugs — fixed; B: close the kitchen loop — done; C: extend authority (take-away, table transfer, device-scope lockdown) — done; D: device/mobile polish — done), with an explicit "still open" backlog — the richest single source for what's actively being iterated on.

---

## 6. Gaps, TODOs, and Visible Issues

No `TODO`/`FIXME`/`HACK`/`XXX` comments and no stray `console.log` found anywhere in `backend/` or `frontend/src/` — tracked instead via the structured `WAITER_AUDIT.md` backlog.

### Open backlog (from `WAITER_AUDIT.md`)

- Customer name/phone capture only happens at manager settle, not at the waiter step.
- Reservation details aren't shown on a `reserved` table tile in the waiter grid (frontend-only fix).
- No typed menu-item modifiers/variants — `variants`/`addons` are untyped `list[dict]`.
- No waiter-specific shift-summary endpoint (devices are blocked from `/waiters/{id}/stats`).
- No dark mode / large-type mode (`next-themes` installed but unused).
- No table merge/split — needs an order-splitting model that doesn't exist yet.
- **Real server-side printing is unimplemented** — `POST /printer/kot` and `POST /printer/bill` only `logger.info(...)` a formatted ticket. Only the frontend's local ESC/POS path does real printing, with no network fallback.
- Device "signed in" status goes stale on network loss — logout is fire-and-forget, no heartbeat/timeout.
- No visible re-pairing path if the refresh-token flow fails mid-shift.

### From `README.md`'s own roadmap

Real server-side ESC/POS printing, WebSocket live sync (currently polling: 8s tables/orders, 10s device info, 15s reconciliation), full offline-first coverage (order *edits* aren't queued, only creates), payment-gateway integration, inventory auto-deduction from recipes (inventory and menu are disconnected models), multi-location reporting, self-serve multi-tenant signup+billing (this is a single-tenant-per-cafe internal tool today, not SaaS).

### Documentation/implementation mismatches

- **CSV import**: `CSV_IMPORT_GUIDE.md` and `sample-menu.csv` describe a full bulk-import flow, and `frontend/src/lib/csv.ts` exists client-side, but **no matching backend endpoint was found** in `backend/app/routers/menu.py` (only single-item/category CRUD + OTP-gated purge). Either items are parsed client-side and POSTed one-by-one through the existing endpoint, or the documented flow doesn't fully match what's implemented — worth reconciling.
- **Stale setup docs**: `SETUP.md` and `ENV_SETUP.md` reference `REACT_APP_BACKEND_URL`, `python server.py`, `npm start` — predating the Vite migration and modular `app/` refactor. A new developer following `SETUP.md` literally will hit friction; `README.md` has the current instructions.

### Test coverage gaps

No `test_inventory.py`, no `test_reservations.py` — full CRUD routers with (apparently) zero dedicated tests. Unclear/likely-absent coverage for the menu purge-OTP flow and the printer mocks. A vestigial, empty `tests/__init__.py` sits at the repo root, unrelated to the real `backend/app/tests/` suite.

### Security posture — generally strong, with a few operational notes

- JWT secret has no insecure fallback in `config.py`, but `docker-compose.yml` ships a **default insecure dev secret** (`JWT_SECRET: ${JWT_SECRET:-dev-insecure-change-me-...}`) — explicitly commented as "never ship this default," but still a real risk if someone runs `docker compose up` without overriding it.
- CORS correctly refuses to combine `allow_credentials=True` with a wildcard origin.
- Pincode API key is proxied server-side only, never shipped to the browser.
- Email enumeration is mitigated on `/auth/reset/request` (always returns a generic message).
- Bills are never hard-deleted — appropriate for GST/audit retention.
- A `vivek-venv/` Python virtualenv directory is present inside `backend/` in the working tree — worth double-checking it isn't accidentally tracked by git.
- `pincode.py`'s in-memory cache is process-local, unbounded, and lost on restart — fine for a single instance, would just under-cache (not a correctness issue) if horizontally scaled.

### Architectural note

`backend/server.py` is not dead code — it's a deliberate compatibility shim re-exporting `app.main:app` for legacy `uvicorn server:app` invocations. Low risk, but it's the same divergence reflected in the stale setup docs above.
