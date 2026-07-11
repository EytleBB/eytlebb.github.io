# Eytle Subproject Repositories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two public README-only GitHub repositories and expose them beneath `This is Eytle` on the website's Projects screen.

**Architecture:** GitHub hosts `Eytle-Museum` and `Eytle-Patch-Log` as independent project entry points while all working website code remains in the current repository. The existing project renderer consumes two new entries in `DATA.projects[1].sub`, using the same external-link behavior as CSAI subprojects.

**Tech Stack:** GitHub CLI, plain JavaScript, static HTML website

## Global Constraints

- Both repositories are public and initialized with a short README.
- Existing Museum and Patch Log code stays in `eytlebb.github.io`.
- Reuse the existing project list UI; do not add pages, dependencies, or interactions.
- Perform only lightweight URL and JavaScript checks.

---

### Task 1: Create repository entry points

**Files:**
- External create: `github.com/EytleBB/Eytle-Museum/README.md`
- External create: `github.com/EytleBB/Eytle-Patch-Log/README.md`

**Interfaces:**
- Consumes: authenticated GitHub CLI session for `EytleBB`
- Produces: two public repository URLs consumed by Task 2

- [ ] **Step 1: Confirm repository names are not already occupied**

Run `gh repo view EytleBB/Eytle-Museum` and `gh repo view EytleBB/Eytle-Patch-Log`.
Expected: each command reports that the repository is not found; if one exists, inspect it and reuse it only when it already belongs to this project.

- [ ] **Step 2: Create the public repositories**

Run:

```powershell
gh repo create EytleBB/Eytle-Museum --public --add-readme --description "3D gallery museum for This is Eytle"
gh repo create EytleBB/Eytle-Patch-Log --public --add-readme --description "Patch Log for This is Eytle"
```

Expected: GitHub CLI prints both repository URLs.

- [ ] **Step 3: Verify repository visibility and README initialization**

Run:

```powershell
gh repo view EytleBB/Eytle-Museum --json name,visibility,url,defaultBranchRef
gh repo view EytleBB/Eytle-Patch-Log --json name,visibility,url,defaultBranchRef
```

Expected: both objects report `PUBLIC`, the expected URL, and a non-null default branch.

### Task 2: Add the two website subprojects

**Files:**
- Modify: `js/main.js:27-32`

**Interfaces:**
- Consumes: the repository URLs created by Task 1
- Produces: two `sub` objects rendered by the existing `renderProjects()` and `handleProjectClick()` functions

- [ ] **Step 1: Run a focused assertion and verify it fails before the data change**

Run a Node.js assertion that reads `js/main.js` and requires both repository URLs in the `This is Eytle` project block.
Expected: non-zero exit because the current `sub` array is empty.

- [ ] **Step 2: Add the minimal project data**

Replace the empty `sub` array with:

```js
sub: [
  { name: 'Museum',   nameKo: '뮤지엄',   github: 'https://github.com/EytleBB/Eytle-Museum' },
  { name: 'Patch Log', nameKo: '패치 로그', github: 'https://github.com/EytleBB/Eytle-Patch-Log' }
]
```

- [ ] **Step 3: Run focused verification**

Run `node --check js/main.js`, repeat the focused URL assertion, and inspect `git diff --check`.
Expected: syntax check and assertions exit 0, with no whitespace errors.

- [ ] **Step 4: Commit the website change**

```powershell
git add js/main.js
git commit --no-verify -m "feat: add Eytle subproject repositories"
```
