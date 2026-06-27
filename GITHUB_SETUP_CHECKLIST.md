# GitHub Setup Checklist - Before Pushing Your Code

Use this checklist to ensure your repo is ready to share with friends safely.

## ✅ Security Checks

- [ ] **No `.env` files committed**
  ```bash
  git status | grep -E "backend/.env|frontend/.env"
  # Should return nothing if clean
  ```

- [ ] **`.env` is in `.gitignore`**
  ```bash
  cat .gitignore | grep "\.env"
  # Should show: .env, .env.local, etc.
  ```

- [ ] **`.env.example` files exist and have NO secrets**
  ```bash
  ls backend/.env.example frontend/.env.example
  # Both should exist with placeholder values only
  ```

- [ ] **No hardcoded secrets in code**
  ```bash
  grep -r "mongodb://" --include="*.py" --include="*.js" src/
  # Should only find examples with localhost
  ```

- [ ] **No API keys in environment files**
  ```bash
  cat backend/.env.example | grep -i "key\|secret\|token"
  # Should show placeholder values, not real keys
  ```

## 📁 File Structure Checks

- [ ] Project has these files:
  - [ ] `backend/.env.example` - Backend template
  - [ ] `frontend/.env.example` - Frontend template  
  - [ ] `SETUP.md` - Setup instructions
  - [ ] `ENV_SETUP.md` - Environment guide
  - [ ] `.gitignore` - With .env rules
  - [ ] `README.md` - Project overview

- [ ] No uncommitted changes to important files:
  ```bash
  git status
  # Should show only untracked files, not modified tracked files
  ```

## 📚 Documentation Checks

- [ ] `SETUP.md` includes:
  - [ ] Prerequisites (Python, Node.js, MongoDB versions)
  - [ ] Step-by-step installation
  - [ ] How to copy `.env.example` to `.env`
  - [ ] How to start backend and frontend
  - [ ] How to verify everything works
  - [ ] Troubleshooting section

- [ ] `README.md` includes:
  - [ ] Quick start link to SETUP.md
  - [ ] Features list
  - [ ] Tech stack
  - [ ] Project structure
  - [ ] API documentation

- [ ] `ENV_SETUP.md` explains:
  - [ ] What `.env` files are
  - [ ] Why not to commit them
  - [ ] How to set up on a new machine
  - [ ] Environment-specific configs

## 🔧 Code Quality

- [ ] No debug code left behind
  ```bash
  grep -r "console.log" src/frontend --include="*.js" --include="*.jsx"
  grep -r "print(" backend --include="*.py"
  # Should have minimal/no debug statements
  ```

- [ ] No commented-out code blocks > 10 lines
  ```bash
  grep -r "^[ ]*#[ ]*" backend --include="*.py" | wc -l
  # Review any large commented sections
  ```

- [ ] No temporary files
  ```bash
  git status | grep -E "\.temp|\.bak|\.swp|debug|test-"
  # Should be empty
  ```

## 🗂️ .gitignore Checks

Verify `.gitignore` has these sections:

- [ ] **Environment files:**
  ```
  .env
  .env.local
  .env.*.local
  backend/.env
  frontend/.env
  ```

- [ ] **Dependencies:**
  ```
  node_modules/
  venv/
  __pycache__/
  *.pyc
  ```

- [ ] **Build artifacts:**
  ```
  /build
  dist/
  /coverage
  ```

- [ ] **System files:**
  ```
  .DS_Store
  .vscode/settings.json
  .idea/
  *.pem
  ```

- [ ] **Exceptions for examples:**
  ```
  !.env.example
  !.env.*.example
  ```

## 🔐 Secrets Management

- [ ] All real secrets are removed from code:
  ```bash
  # Search for common secret patterns
  grep -r "password=" . --include="*.py" --include="*.js"
  grep -r "secret=" . --include="*.py" --include="*.js"
  grep -r "api_key=" . --include="*.py" --include="*.js"
  # Should only find examples with placeholder values
  ```

- [ ] If you accidentally committed secrets:
  ```bash
  # This removes files from git history (destructive!)
  git filter-branch --tree-filter 'rm -f backend/.env' HEAD
  git push origin HEAD --force
  
  # Then create fresh .env and add to .gitignore
  ```

## 📝 README Quality

- [ ] README has clear sections:
  - [ ] Features overview
  - [ ] Quick start (with SETUP.md link)
  - [ ] Tech stack
  - [ ] Architecture diagram or description
  - [ ] API endpoints
  - [ ] Troubleshooting

- [ ] Code examples in README are correct:
  ```bash
  # Test any commands shown in README
  cp backend/.env.example backend/.env  # Works?
  pip install -r backend/requirements.txt  # Works?
  ```

## 🧪 Test Setup on Fresh Clone

Before pushing, test setup on a fresh clone:

```bash
# 1. Create temporary test directory
mkdir /tmp/pos-test
cd /tmp/pos-test

# 2. Clone your repo
git clone <your-repo-url> .

# 3. Follow SETUP.md instructions
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. Try to install
cd backend
pip install -r requirements.txt  # Should work

cd ../frontend
npm install  # Should work

# 5. Check .env files are not in git
git status | grep "\.env$"  # Should be empty

# 6. Check examples are tracked
git ls-files | grep "env.example"  # Should show files
```

If everything works, you're ready to push!

## 🚀 Before Final Push

- [ ] Run `git status` - only shows untracked files, no modified `.env`
- [ ] Run `git diff` - no `.env` changes
- [ ] Run `git log --name-only -1` - last commit doesn't include `.env`
- [ ] Create `.gitattributes` if using Windows/Mac mixed:
  ```bash
  * text=auto
  *.py text eol=lf
  *.js text eol=lf
  *.sh text eol=lf
  ```

- [ ] Add GitHub repository details to code:
  - [ ] Link in README to your GitHub repo
  - [ ] Update any URLs that hardcode "localhost"

- [ ] Add useful files:
  - [ ] `LICENSE` file (choose one: MIT, GPL, Apache, etc.)
  - [ ] `CONTRIBUTING.md` if you want community contributions
  - [ ] `.github/PULL_REQUEST_TEMPLATE.md` for PRs

## 📋 Final Verification

Before pushing:

```bash
# Check git will only push what you want
git diff --cached  # Should be empty or have code changes only

# See what will be pushed
git log -1 --name-status

# Check no secrets in files to be pushed
git diff --cached | grep -i "password\|secret\|key"
# Should return nothing
```

## ✨ Nice to Have (Optional)

- [ ] Add GitHub badges to README
  ```markdown
  ![GitHub stars](https://img.shields.io/github/stars/yourusername/pos-system)
  ![License](https://img.shields.io/badge/license-MIT-green)
  ```

- [ ] Create GitHub issues for features/bugs
- [ ] Add GitHub Actions for CI/CD (tests, linting)
- [ ] Create GitHub Releases for version tags
- [ ] Add CHANGELOG.md for version history

## 🎯 Summary

### What Gets Pushed to GitHub:
✅ Source code (`.py`, `.js`, `.jsx`)  
✅ Configuration templates (`.env.example`)  
✅ Dependencies files (`requirements.txt`, `package.json`)  
✅ Documentation (`README.md`, `SETUP.md`, `ENV_SETUP.md`)  
✅ `.gitignore` and `.gitattributes`  

### What Does NOT Get Pushed:
❌ `.env` files (with real credentials)  
❌ `node_modules/`, `venv/`, `__pycache__/`  
❌ Build artifacts (`/build`, `/dist`)  
❌ IDE settings (`.vscode/settings.json`, `.idea/`)  
❌ System files (`.DS_Store`, `*.log`)  

---

**Last Checked:** [Date]  
**Ready to Share:** ✅ / ❌

If all items are checked, your repo is ready to share safely!
