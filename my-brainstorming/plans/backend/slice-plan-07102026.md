# Backend/DB Slice Plan — Unified Login + Roles + Approval Workflow

**Date:** 2026-10-07
**Scope:** Backend (`backend/app/`) and DB only. Frontend is a separate, later plan.
**Locked decisions this plan builds on** (from brainstorm discussion, same day):

- Replace device-pairing entirely with unified email login for every role.
- Role set simplified to exactly: `platform_admin`, `owner`, `manager`, `waiter`, `kitchen`. Drop `superadmin` (today a bare owner-synonym) and generic `staff`.
- No real production data exists yet — free to drop/reset affected collections and dead fields instead of migrating them.
- Staff invite: adding a waiter/kitchen member creates a real `users` row immediately (`cafe_id` set, role set), with an `is_email_verified` flag. OTP verification happens, then a password is set. No separate pending-record staging like owner signup has.
- Manager cannot: edit cafe business settings (GST/tax/name/address), add/manage other managers, or change menu item prices directly. Everything else a manager tool today (owner/superadmin-gated) is now owner **and** manager.
- Menu price edits by a manager go into a pending-approval queue scoped to price only; the current price stays live/authoritative until the owner approves or rejects.
- Platform-level cafe approval gets a real (undesigned) admin page later — this plan only needs the backend side of it.
- `/profile` is open to every staff role (owner/manager/waiter/kitchen) for self-service account editing; the cafe object it returns is read-only there exactly as `GET /cafe` already is — only `PATCH /cafe` (owner-only) can change it.
- A pending cafe's owner **can** log in; every cafe-scoped action beyond that is blocked downstream with an explicit "awaiting approval" reason.
- Staff invites are one endpoint for every role (`POST /staff {name, email, role}`) — an owner can invite directly into `manager`; a manager can only invite `waiter`/`kitchen` (not another `manager`).
- ~~Concurrent-device cap (added 2026-10-07, folded into Slice 4)~~ — **descoped 2026-10-08**: every non-owner role would have been capped at 2 concurrent devices. Dropped for this phase in favor of per-user action logging (an audit trail of who did what, not a login limiter) as the accountability mechanism instead. Revisit later if a concrete need for the cap itself resurfaces.

Each slice below is one commit-sized, sequential, independently testable change. Later slices assume earlier ones landed. DB/index/model changes live inside the slice that needs them, not split out separately.

---

## Slice 1 — Role taxonomy rewrite

**What changes**
- `app/models/common.py`: `Role` enum becomes `{platform_admin, owner, manager, waiter, kitchen}`. Remove `superadmin`, `staff`.
- Every `require_role([...])` call site gets re-pointed at the new roles, split into two tiers instead of today's single "owner/superadmin" tier:
  - `_OWNER_ONLY` (cafe settings, staff-role promotion/demotion to `manager`, platform-admin-only endpoints): `cafe.py`, the "promote to manager" path in the staff router.
  - `_MANAGEMENT` (owner **and** manager — tables, floors, menu CRUD except price, staff/waiter/kitchen roster, reservations writes, sessions, bills settlement/void, reconciliation): `tables.py`, `menu.py`, `waiters.py`, `reservations.py`, `sessions.py`, `bills.py`, `reconciliation.py`, `inventory.py`.
  - `/profile` (`app/routers/profile.py`) opens to **every** authenticated non-platform-admin role (`owner`, `manager`, `waiter`, `kitchen`) — swap its `_MANAGER` dependency for plain `get_current_user`. This is self-service "my own account" (name, phone, password), identical editable fields regardless of role — there's nothing owner-specific about editing your own name. `GET /cafe` is already unrestricted today (any authenticated role can read the cafe's name/tax/charges), so bundling that same cafe object into `/profile`'s response for every role isn't a new data exposure — `PATCH /cafe` (the business-settings edit) stays owner-only, untouched by this change, which is what actually enforces "only the owner can edit it."
  - **Platform_admin edge case**: `profile.py`'s `_load` does `db.cafes.find_one({"id": current_user["cafe_id"]})` — for a `platform_admin` (`cafe_id=None`) this would 404 with a confusing "Cafe not found." Handle it explicitly: if `cafe_id` is `None`, skip the cafe lookup and return `"cafe": null` in the response instead of erroring.
- `waiters.py`'s `STAFF_ROLES = [Role.staff.value, "waiter"]` constant is deleted; roster queries filter on `role: {"$in": ["waiter", "kitchen", "manager"]}` directly (managers are staff someone invited too — see Slice 5).
- No new endpoints beyond the `/profile` dependency swap — this slice is a pure rename/re-split so every later slice has correct permission boundaries to build on.

**Tests touched:** `test_security.py`, `test_cafe.py`, `test_tables.py`, `test_menu.py`, every test asserting on `"superadmin"` as a role string.

---

## Slice 2 — User/Cafe model + index changes for the new auth & approval model

**What changes**
- `app/models/user.py` — `User`:
  - `cafe_id: Optional[str] = None` (was required `str`) — `platform_admin` has no cafe.
  - Add `is_email_verified: bool = False`.
  - Remove `username`, `pin`, `device_token` fields (dead once device-pairing and username-login are gone — confirmed safe to drop since there's no real data to preserve).
  - Password itself stays a raw Mongo field added at insert time (`user_doc["password"] = get_password_hash(...)`), same pattern the owner path already uses — not part of the Pydantic model, so nothing changes there.
- `app/models/cafe.py` — `Cafe`:
  - Add `status: str = "pending"` (`pending | approved | rejected`).
  - Add `approved_by: Optional[str] = None`, `approved_at: Optional[datetime] = None`.
  - Add `payment_policy: str = "pay_after"` (`pay_first | pay_after`), editable anytime via `CafeSettingsUpdate` (add the field there too, owner-only per Slice 1's `_OWNER_ONLY`).
  - **Test accounts auto-approve**: in `register_verify`, when `is_test_account=True`, set `status="approved"` immediately. Real signups default to `"pending"`. This keeps `pytest`, `setup_sample_data.py`, and local dev frictionless — nothing you run locally ever gets stuck behind the approval gate; only genuine production signups (no `test_code`) do.
- `app/db/indexes.py`:
  - Drop the three `device_activations` indexes.
  - Drop the partial unique index on `users.username` (field is gone).
  - Add `("cafes", [("status", ASCENDING)], {})` for the platform-admin pending-list query.
  - `action_otps` indexes are reused as-is for staff-invite and login-verify OTPs (already generic on `user_id` + `purpose`) — no change needed there.
- One-time cleanup: drop the `device_activations` collection itself (not just its indexes) since no real data depends on it — a one-line step in this slice, not a migration script.

**Confidence:** 98%+. These are additive/removal field changes with no behavioral code yet depending on them.

---

## Slice 3 — Platform admin + cafe approval

**What changes**
- `scripts/create_platform_admin.py` (new, modeled on `setup_sample_data.py`'s style): one-off CLI script that creates a `User` with `role="platform_admin"`, `cafe_id=None`, `is_email_verified=True`, and a password you supply — this is the only way a platform_admin ever gets created; there's no self-serve or invite path for it (nothing exists above it to invite it).
- New router `app/routers/admin.py`:
  - `GET /api/admin/cafes?status=pending` — list cafes by status, `platform_admin`-only.
  - `POST /api/admin/cafes/{id}/approve` — sets `status="approved"`, `approved_by`, `approved_at`.
  - `POST /api/admin/cafes/{id}/reject` — sets `status="rejected"` (owner's existing account stays as-is; rejection is reversible by re-approving later rather than deleting anything).
- `app/core/deps.py`: `require_role` already works for `platform_admin` once Slice 1 lands — no change needed there.
- **Gating what a pending cafe's owner can actually do** (confirmed): login succeeds normally (token issued) even for a `pending` cafe. `get_current_user` additionally stamps the resolved cafe's `status` onto the returned payload, and a new lightweight dependency `require_approved_cafe` (used everywhere `_MANAGEMENT`/`_OWNER_ONLY` is used, platform_admin exempt) rejects with a clear 403 ("Your cafe is awaiting approval") until `status=="approved"`. The owner can log in and see *why* they're blocked instead of a confusing login failure — important once real owners are signing up and need to self-diagnose rather than emailing support over a bare auth error.

**Tests touched:** new `test_admin.py`; `test_auth.py` needs a case for a pending cafe's owner logging in successfully but being blocked downstream.

---

## Slice 4 — Unified login flow (email → OTP-or-password)

**What changes**
- New endpoint `POST /api/auth/login-start` `{email}`:
  - User not found → generic 404-equivalent message (no enumeration — same care as `reset/request`).
  - User found, `is_email_verified=False` → generate+email an OTP (reusing `action_otps`, purpose `"first_login"`), respond `{"next": "verify", "dev_otp": ...}` in DEV mode.
  - User found, `is_email_verified=True` → respond `{"next": "password"}` (no OTP sent — this is the normal returning-user path).
- New endpoint `POST /api/auth/first-login` `{email, otp, password, confirm_password}`:
  - Verifies the OTP against `action_otps` (purpose `"first_login"`), sets `is_email_verified=True` + stores the password hash, deletes the OTP record, returns `AuthResponse` (same shape as today's register/login) — one call completes the whole first-time flow instead of a separate verify-then-set-password round trip.
- Existing `POST /api/auth/login` `{email, password}` keeps its request/response shape unchanged.
- Existing `/auth/reset/*` (forgot password) unchanged — already works for any user once they have a password.
- `/auth/register/*` (owner cafe creation) **unchanged** — this slice doesn't touch owner signup, only adds the generic "I already have a `users` row, first time logging in" path that owner signup doesn't need (owner sets their password at signup, so they're never in the `is_email_verified=False` state login-wise... except: should owner signup also require email verification before first login, for consistency? Today `register/verify` already does its own OTP step before creating the user — so the owner row is created with `is_email_verified=True` directly. No conflict.)

**Confidence:** 98%+. This reuses existing OTP/email/password infrastructure end to end; the only new surface is two endpoints and one new `action_otps` purpose string.

**Tests touched:** new `test_login_flow.py` covering login-start branching + first-login success/expired-OTP/wrong-OTP/already-verified cases.

### Concurrent-device cap — descoped (2026-10-08)

Was folded into this slice at 90% confidence (new design, real frontend
dependency on client-generated `device_id`). Dropped for this phase: per-user
action logging (an audit trail of who did what) was chosen instead as the
accountability mechanism, which needs no login-time device tracking at all.
Nothing in `sessions`/`claim_session`/`POST /auth/logout` was built. Revisit
only if a concrete need for the cap itself resurfaces later.

---

## Slice 5 — Staff invite (replaces name-only roster creation)

**What changes**
- `app/models/user.py`: `WaiterCreate` → `StaffInvite {name, email: EmailStr, role: Literal["waiter","kitchen","manager"]}`. `WaiterUpdate` drops `username`.
- Router (renamed `app/routers/waiters.py` → `app/routers/staff.py`, path `/staff` instead of `/waiters` — pre-launch, no compatibility burden, and "waiters" no longer describes who's in this router):
  - `POST /staff` (`_MANAGEMENT`): **one invite endpoint for every staff role**, confirmed — a manager's onboarding is identical to a waiter's or kitchen staff member's, the only difference is the `role` value the inviter picks. Role-gated at the call site, not via a separate endpoint: if `current_user["role"] == "manager"` and `payload.role == "manager"`, reject with 403 ("Managers can't add other managers") — this is the one case your "manager can't add/manage other managers" boundary actually restricts; an `owner` caller may set `role` to any of `waiter`/`kitchen`/`manager` freely. Creates the `User` row immediately (`is_email_verified=False`, no password), emails the first-login OTP right away (same `action_otps` purpose `"first_login"` from Slice 4 — inviting *is* that user's first-login trigger, reusing Slice 4's flow rather than a parallel one).
  - `POST /staff/{id}/resend-invite` (`_MANAGEMENT`): re-sends the OTP if the first one expired/got lost.
  - `GET /staff`, `PATCH /staff/{id}`, `deactivate/activate/delete` — carried over from today's roster endpoints, filtered on `role: {"$in": ["waiter", "kitchen", "manager"]}`. A `manager` editing/deactivating another `manager` is blocked the same way creation is (role check at the call site); an `owner` can act on anyone.
  - No separate `/promote` endpoint — unnecessary now that `POST /staff` takes `role` directly.
- All device-pairing endpoints (`/waiters/devices/*`, `/devices/me`) are deleted in this slice or the next — see Slice 6 for why I'm keeping that as its own commit.

**Confidence:** 98%+.

**Tests touched:** `test_waiters.py` → rewritten as `test_staff.py`.

---

## Slice 6 — Remove device-pairing; simplify order attribution

**What changes**
- Delete from `waiters.py`/`staff.py`: `request_device_code`, `poll_device`, `device_me`, `activate_device`, `list_devices`, `assign_device`, `logout_device`, `revoke_device`, and their models (`DeviceActivate`, `DeviceActivation`, `DeviceCodeRequest`, `DevicePoll`, `DeviceAssign`, `DeviceLogout`).
- `app/core/security.py`: delete `create_device_token`, `create_device_refresh_token`, `generate_device_code`, `normalize_device_code`.
- `app/core/deps.py` — `get_current_user`: delete the entire `device_id`-without-`user_id` branch. Every session now resolves to a real `users` row, full stop.
- `app/routers/auth.py` — `refresh`: delete the device-refresh branch for the same reason.
- `app/routers/orders.py` — `create_order`: delete the `current_user.get("device_id")` branch. Attribution becomes: if `current_user["role"] in ("waiter", "kitchen")`, the order is always attributed to `current_user["user_id"]` itself (a waiter logged in as themselves *is* the attribution — no client-supplied `waiter_id` needed or trusted). If the caller is `owner`/`manager` placing a counter order on someone's behalf, the existing `payload.waiter_id`/`payload.waiter_name` fields are kept for that explicit case. **This is a small security improvement over today's model**, where a device could claim to be any assigned waiter via payload — now a waiter's own session is the only source of truth for their own orders.
- `app/routers/tables.py` — `update_table`: the `current_user.get("device_id")` structural-restriction branch becomes a role check instead: `if current_user["role"] in ("waiter", "kitchen"): structural = set(updates) - {"status", "current_order_id"}` — same restriction, just keyed on role rather than device-ness, since waiters-on-their-own-phone have the same limited authority a paired tablet used to have.
- `app/db/indexes.py`/collections: `device_activations` is already gone (Slice 2) — nothing left to do here.
- `test_device_scope.py` → rewritten as `test_role_scope.py`: same assertions (money/reporting/destructive actions blocked), but asserting on `role in {"waiter","kitchen"}` instead of "is this a device session".

**Confidence:** 98%+. Everything here is deletion plus a mechanical device→role substitution; the order-attribution tightening is the only genuinely new behavior, and it's strictly more correct than today's trust-the-payload model.

---

## Slice 7 — Order lifecycle: explicit "served / awaiting payment" state

**What changes**
- `app/models/common.py` — `OrderStatus`: add `served` between `ready` and `completed`.
- `app/services/orders.py` — `ALLOWED_TRANSITIONS`: `ready → {served, cancelled}`, `served → {completed, cancelled}` (replacing today's direct `ready → completed`... **except** `completed` is never reached through this manual transition at all — see next point).
- `app/routers/orders.py` — `update_order_status`: disallow `completed` as a target of this endpoint entirely (`can_transition` already won't need to special-case it if `completed` simply isn't reachable from `served` here — only `app/routers/bills.py`'s `create_bill` sets an order to `completed`, by design). **This closes an existing gap**: today any authenticated cafe member can `PUT /orders/{id}/status` straight to `completed` with no bill ever created, bypassing settlement entirely. After this slice, `completed` is only reachable by actually creating a bill (owner/manager, `require_user_session`), which is what "payment_completed" in your brainstorm doc actually means.
- No role restriction is added on `pending→preparing→ready→served` — any authenticated cafe staff member (waiter or kitchen) can drive those transitions. This is deliberate: it's what makes kitchen-staff-optional work for free. If a cafe has no kitchen role, the waiter who's already in the system just moves orders through every non-terminal state themselves; there's no auto-detection logic to write because nothing was ever restricted by role in the first place.
- `Cafe.payment_policy` (added in Slice 2) is exposed via `GET/PATCH /cafe` but has **no enforcement logic yet** — it's stored and editable, but nothing in the order/bill flow branches on it. Flagging explicitly: enforcing "pay_first" (e.g. blocking kitchen prep until a bill exists) is real workflow design that your brainstorm doc left open ("we need to think about that as well") — I'm treating it as out of scope for this plan rather than guessing at a design. Separate slice once you've decided the actual pay-first sequence.

**Confidence:** 98%+ on the state-machine change and closing the manual-`completed` gap. The payment_policy non-enforcement is a deliberate scope cut, not a gap — flagging so it doesn't look like an oversight.

**Tests touched:** `test_orders.py` (new `served` transition cases, assert `completed` now rejects direct PUT), `test_bills.py` (assert settlement still correctly completes an order).

---

## Slice 8 — Menu price-change approval queue

**What changes**
- New collection `price_change_requests`: `{id, cafe_id, menu_item_id, current_price, proposed_price, requested_by, requested_at, status: "pending"|"approved"|"rejected", resolved_by, resolved_at}`.
- Index: `("price_change_requests", [("cafe_id", ASCENDING), ("status", ASCENDING)], {})`.
- `app/routers/menu.py` — item update endpoint: if `current_user["role"] == "manager"` and the payload includes `price`, don't touch `menu_items.price` at all — instead insert a `price_change_requests` row and respond `{"status": "pending_approval", ...}`. If `current_user["role"] == "owner"`, price updates apply immediately exactly as today.
- New endpoints (`_OWNER_ONLY`):
  - `GET /menu/price-requests?status=pending`
  - `POST /menu/price-requests/{id}/approve` — applies `proposed_price` to the menu item, stamps `resolved_by`/`resolved_at`.
  - `POST /menu/price-requests/{id}/reject` — stamps only, item price untouched.

**Confidence:** 98%+. Small, self-contained, no interaction with any other slice.

**Tests touched:** new `test_menu_price_approval.py`.

---

## Summary table

| Slice | Commit boundary | Depends on | Confidence |
|---|---|---|---|
| 1 | Role taxonomy rewrite | — | 98%+ |
| 2 | User/Cafe model + index changes | 1 | 98%+ |
| 3 | Platform admin + cafe approval | 1, 2 | 98%+ |
| 4 | Unified login flow | 2 | 98%+ |
| 5 | Staff invite | 1, 4 | 98%+ |
| 6 | Remove device-pairing | 4, 5 | 98%+ |
| 7 | Order lifecycle `served` state | 6 | 98%+ |
| 8 | Menu price approval queue | 1 | 98%+ |

All three previously-open questions are resolved (see the locked-decisions list above). Every slice is ≥98% confidence — ready to execute slice by slice, starting with Slice 1.
