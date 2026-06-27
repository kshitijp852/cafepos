# Environment Configuration Guide

This guide explains what `.env` files are and how to set them up for sharing your app with others.

## What Are `.env` Files?

`.env` files contain **sensitive configuration** that should never be committed to GitHub:
- Database connection strings
- API keys and secrets
- JWT signing keys
- Database names
- API URLs (for different environments)

## Why Not Commit `.env` Files?

### Security Risks
- **Exposed Credentials**: Anyone with repo access gets your database URL, API keys, secrets
- **Compromised Accounts**: Attackers can connect to your real MongoDB database
- **Data Breach**: User data, payment info, everything is at risk

### Privacy
- Different developers need different `.env` values (local vs staging vs production)
- `.env` files are machine-specific
- Each person's machine should have its own configuration

## How to Share Your Project Safely

### Step 1: Create `.env.example` Files ✅

These are **template files** that show what variables are needed without containing secrets.

**backend/.env.example:**
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=pos_database
CORS_ORIGINS=*
JWT_SECRET=change-this-to-a-strong-random-string
```

**frontend/.env.example:**
```
REACT_APP_BACKEND_URL=http://localhost:8001
ENABLE_HEALTH_CHECK=false
WDS_SOCKET_PORT=3000
```

### Step 2: Add `.env` to `.gitignore` ✅

Make sure your `.gitignore` has:
```
# Environment files (DO NOT COMMIT - contains secrets)
.env
.env.local
.env.*.local
frontend/.env
backend/.env
```

This prevents accidentally committing real `.env` files.

### Step 3: Document Setup in SETUP.md ✅

Create clear instructions so your friend knows:
1. What `.env` files are needed
2. Where to copy `.env.example` to `.env`
3. What values to use for local development
4. What values they need to change

**Example from SETUP.md:**
```bash
# Copy the example files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# For local development, defaults work fine:
# - MONGO_URL stays as mongodb://localhost:27017
# - REACT_APP_BACKEND_URL stays as http://localhost:8001
# - JWT_SECRET can be any random string for dev
```

## File Structure After Setup

Your friend's local repo will look like:

```
pos/
├── backend/
│   ├── .env                 ← Created by them (not in repo)
│   ├── .env.example         ← In repo (template)
│   ├── server.py
│   └── requirements.txt
├── frontend/
│   ├── .env                 ← Created by them (not in repo)
│   ├── .env.example         ← In repo (template)
│   └── package.json
├── SETUP.md                 ← Your setup guide
├── ENV_SETUP.md             ← This file
└── .gitignore               ← Contains .env rules
```

## For Each Environment

### Local Development (`backend/.env`)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=pos_development
CORS_ORIGINS=*
JWT_SECRET=dev-secret-not-for-production
```

### Staging (`backend/.env.staging`)
```
MONGO_URL=mongodb://staging-server:27017
DB_NAME=pos_staging
CORS_ORIGINS=https://staging.yourapp.com
JWT_SECRET=<use a strong random string>
```

### Production (`backend/.env.production`)
```
MONGO_URL=<production-mongodb-connection-string>
DB_NAME=pos_production
CORS_ORIGINS=https://yourapp.com
JWT_SECRET=<use openssl rand -hex 32 to generate>
```

**Note:** Only production secrets need to be stored securely (use secrets management tools).

## How Your Friend Sets Up

1. **Clone your repo:**
   ```bash
   git clone https://github.com/yourusername/pos-system.git
   cd pos
   ```

2. **Create `.env` files from templates:**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. **Edit them for their machine** (if defaults don't work):
   ```bash
   # Usually no changes needed for local development
   # Backend connects to localhost MongoDB by default
   # Frontend connects to localhost backend by default
   ```

4. **Install and run:**
   ```bash
   cd backend
   pip install -r requirements.txt
   python server.py
   
   # In another terminal:
   cd frontend
   npm install
   npm start
   ```

That's it! No special secrets needed to be shared.

## Generating Strong Secrets

If you need to generate a strong JWT secret:

```bash
# macOS/Linux
openssl rand -hex 32

# Windows PowerShell
[convert]::ToHexString((1..32 | ForEach-Object {Get-Random -Maximum 256}) -as [byte[]])

# Online (less secure, use only for dev)
# https://www.uuidgenerator.net/guid
```

Use this in production `.env` files.

## `.gitignore` Example

Here's what your `.gitignore` should have:

```ignore
# Environment files (NEVER commit these!)
.env
.env.local
.env.*.local
.env.development
.env.staging
.env.production
frontend/.env
backend/.env

# But DO commit these templates
!.env.example
!.env.*.example
```

The `!` means "don't ignore these even though .env matches".

## Checklist for Sharing

Before pushing to GitHub:

- [ ] `.env` files are in `.gitignore`
- [ ] `.env.example` files exist with template values
- [ ] No real credentials in `.env.example` (use placeholders)
- [ ] SETUP.md explains how to create `.env` from `.env.example`
- [ ] Git status shows `.env` files are untracked:
  ```bash
  git status
  # Should NOT show backend/.env or frontend/.env
  ```

- [ ] `.env.example` files ARE tracked:
  ```bash
  git ls-files | grep env.example
  # Should show both example files
  ```

## Testing

To verify everything works:

```bash
# Run from repo root
git ls-files --others --exclude-standard | grep -E "\.env$"
# Should be empty (no .env files tracked)

git ls-files | grep env.example
# Should show both .env.example files

git status
# Should NOT show .env files in "Changes not staged"
```

## Common Mistakes

❌ **Don't do this:**
- Commit `.env` files with real secrets
- Share secrets via email or Slack
- Put secrets in comments in source code
- Use the same secret for all environments

✅ **Do this instead:**
- Keep `.env` files local only
- Use `.env.example` as a template
- Generate different secrets for each environment
- Use environment-specific `.env.staging`, `.env.production`
- Store production secrets in secure vaults (AWS Secrets Manager, etc.)

## Further Reading

- [Node.js dotenv documentation](https://github.com/motdotla/dotenv)
- [Environment variables best practices](https://12factor.net/config)
- [GitHub: Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
