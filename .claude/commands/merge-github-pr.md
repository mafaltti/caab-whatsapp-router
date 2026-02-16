---
description: Review, merge a PR to develop, and clean up the local feature branch.
---

## User Input

```text
$ARGUMENTS
```

The user input is an **optional** PR number (e.g. `84`). If empty, auto-detect the PR from the current branch.

## Outline

### 1. Identify the PR

- If `$ARGUMENTS` contains a number, use it as the PR number.
- If `$ARGUMENTS` is empty, detect the PR associated with the current branch:

  ```bash
  gh pr view --json number --jq .number
  ```

- If neither yields a valid PR number, **STOP** and ask the user to provide one.

### 2. Fetch PR Details

Retrieve full PR information:

```bash
gh pr view <number> --json title,body,state,headRefName,baseRefName,statusCheckRollup,mergeable,url,number,reviewDecision
```

Parse and validate:

- **State** must be `OPEN`. If the PR is already merged or closed, inform the user and **STOP**.
- **Base branch** must be `develop`. If it targets a different branch, warn the user and ask whether to proceed.
- **Mergeable** status — note if there are merge conflicts.

### 3. Check CI Status

Inspect `statusCheckRollup` for all CI checks:

- List each check with its name, status, and conclusion.
- If **all checks pass**: indicate the PR is ready.
- If **any checks are failing**: warn the user and list the failures. Ask if they want to proceed anyway or abort.
- If **checks are pending**: inform the user and ask if they want to wait, proceed anyway, or abort.

### 4. Present Summary and Confirm

Display a clear summary:

```
## PR Merge Summary

**PR**: #<number> — <title>
**URL**: <url>
**Branch**: <headRefName> → <baseRefName>
**CI Status**: <pass/fail/pending summary>
**Mergeable**: <yes/no/conflicts>

### Changed Files
<list files changed, from gh pr diff --stat>

### Description
<PR body, truncated if very long>
```

Ask the user to choose:

- **Merge** — proceed with merging the PR
- **Cancel** — abort without merging

**Do NOT proceed without explicit user approval.** Merging is irreversible.

### 5. Merge the PR

Execute the merge:

```bash
gh pr merge <number> --merge --delete-branch
```

- Uses `--merge` strategy (merge commit) to preserve history.
- Uses `--delete-branch` to automatically delete the remote feature branch after merging.

If the merge fails (e.g., conflicts, branch protection), report the error and **STOP**.

### 6. Local Cleanup

After a successful merge, clean up the local environment:

1. **Switch to develop:**

   ```bash
   git checkout develop
   ```

2. **Pull the latest changes:**

   ```bash
   git pull origin develop
   ```

3. **Delete the local feature branch:**

   ```bash
   git branch -d <headRefName>
   ```

   Use `-d` (safe delete) so Git will refuse to delete if there are unmerged changes.

If any cleanup step fails, report the issue but do NOT treat it as a critical failure — the PR is already merged at this point.

### 7. Report Result

Display a final summary:

- Confirm the PR was merged successfully with the PR URL.
- Confirm the remote branch was deleted.
- Confirm the local branch was deleted (or note if it wasn't).
- Show that the local `develop` branch is now up to date.
