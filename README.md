# 🍽️ Cafe POS

Point-of-sale system for cafes and restaurants. Multi-tenant (isolated per cafe),
JWT-authenticated, with tamper-evident billing (SHA-256 bill hashes + immutable
records) and a unified order model covering both dine-in (waiter → kitchen →
settle) and counter/quick-sale.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Backend | Python 3.13, FastAPI, Motor (async MongoDB), PyJWT, passlib/bcrypt |
| Frontend | React 18 + TypeScript, Vite, React Router, TanStack Query, Tailwind + shadcn/ui |
| Database | MongoDB |
| Tests | pytest + httpx (backend); `tsc` typecheck + Vite build (frontend) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

## Project Layout

```
backend/
  app/
    core/        config (pydantic-settings), security (JWT), deps, exceptions
    db/          motor client, index setup, serialization
    models/      Pydantic schemas by domain
    services/    billing (atomic bill numbers + hash), order lifecycle, cafe tax
    routers/     auth, waiters, menu, tables, orders, bills, reservations,
                 sessions, reports, inventory, printer, health
    tests/       pytest suite (real MongoDB)
  server.py      compat shim → app.main:app
  Dockerfile
frontend/
  src/
    api/         axios client (+ token refresh), typed endpoints, TanStack hooks
    auth/        AuthContext + storage
    features/    cart (useCart, MenuBrowser, CartPanel), billing (SettleDialog)
    routes/      screens (login, dashboard, live, new-order, menu, staff,
                 reservations, history, inventory, waiter/*)
    components/  AppLayout, RequireAuth, ui/ (shadcn primitives)
docker-compose.yml   MongoDB + backend for local dev
```

## Getting Started

### Option A — Docker (backend + MongoDB)

```bash
JWT_SECRET=$(python -c "import secrets;print(secrets.token_hex(32))") \
  docker compose up --build
# Backend → http://localhost:8001/api/health
```

Then run the frontend:

```bash
cd frontend
cp .env.example .env          # VITE_BACKEND_URL=http://localhost:8001
yarn install && yarn dev      # → http://localhost:3000
```

### Option B — Manual

Prerequisites: Python 3.13, Node 22 (Corepack/yarn), MongoDB running locally.

```bash
# Backend
cd backend
cp .env.example .env          # set a real JWT_SECRET (see command above)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# Frontend
cd frontend
cp .env.example .env
corepack enable && yarn install && yarn dev
```

Seed sample menu/tables/inventory (after registering a cafe):

```bash
cd backend && python setup_sample_data.py
```

## Environment

Backend (`backend/.env`): `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`,
`JWT_SECRET` (required — no fallback), `JWT_ALGORITHM`, `JWT_EXPIRY_HOURS`.

Frontend (`frontend/.env`): `VITE_BACKEND_URL`.

`.env` files are git-ignored (every `*.env` variant). Only `*.env.example`
templates are committed.

## Auth model

- **Owner/manager**: email + password → access token (short-lived) + refresh
  token. `POST /api/auth/refresh` rotates the pair; the frontend refreshes
  transparently on 401.
- **Staff (waiter)**: manager authenticates a device once (Staff → device + PIN),
  then the device logs in with its `device_id` and receives real JWTs.
- Every request derives `cafe_id` from the token, enforcing tenant isolation.

## Billing integrity

- Sequential `bill_number` per cafe via an atomic counter + a unique
  `(cafe_id, bill_number)` index — collision-proof under concurrency.
- SHA-256 `bill_hash` over `bill_number | items | total | timestamp`.
- Tax rate is a single per-cafe source applied to both orders and bills.

## Order lifecycle

`pending → preparing → ready → completed` (or `cancelled`), shared by dine-in
(real `table_id`) and counter sale (`table_id: null`). Transitions are validated
server-side; terminal states free the table.

## Testing

```bash
cd backend && pytest            # needs a MongoDB at MONGO_URL (uses DB_NAME=cafepos_test in CI)
cd frontend && yarn typecheck && yarn build
```

CI runs both on every PR.

## API

Interactive docs at `http://localhost:8001/docs` (FastAPI OpenAPI). All routes are
under `/api`; `cafe_id` is always taken from the JWT, never a query parameter.

## Roadmap (not yet built)

Real ESC/POS printing · WebSocket live sync · offline-first (IndexedDB) ·
payment-gateway integration · inventory auto-deduction from recipes ·
multi-location reporting · public multi-tenant signup + billing.
