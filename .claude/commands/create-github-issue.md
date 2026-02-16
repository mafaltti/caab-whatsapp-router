---
description: Create one or more detailed GitHub issues from the current conversation context (plan, discussion, or description).
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty). It provides context about what the issue is about — e.g., "for this plan", "add dark mode support", "fix the login bug we discussed".

## Outline

### 1. Gather Context

Analyze the current conversation to extract all relevant information:

- **Plans**: Any plan discussion, plan mode output, or implementation strategy
- **Code exploration**: Files read, grep results, code patterns identified
- **Problems identified**: Bugs, inconsistencies, missing features
- **Requirements**: What needs to change, what the desired outcome is
- **Technical details**: Specific files, line numbers, database changes, RLS policies, etc.

Combine the conversation context with the user's `$ARGUMENTS` to understand the full scope of the work.

### 2. Scope Analysis — Single or Multiple Issues?

Analyze whether the work should be a single issue or decomposed into multiple issues.

**Create multiple issues when:**
- A plan has distinct, independently-implementable phases (e.g., migration → backend → frontend)
- The conversation covers multiple unrelated concerns ("fix X AND add Y")
- The user explicitly asks for multiple issues
- The scope would result in a single issue too large for one PR (rule of thumb: >3 files across different concerns)

**Keep as a single issue when:**
- It's a focused bug fix, UI tweak, or single-concern change
- All changes are tightly coupled and can't be merged independently
- The user explicitly asks for one issue

**Present the decision** to the user before drafting:

- **If single**: state that you'll create one issue and proceed to Step 3.
- **If multiple**: show a numbered breakdown with proposed title and 1-line scope for each issue, then ask the user to confirm, adjust, or collapse back to single. Example:

```
I'd break this into 3 issues:

1. **feat: add rapporteur_opinion column to votes table** — migration + type regen
2. **feat: implement rapporteur opinion backend logic** — query hooks, RLS, validation
3. **UI: add rapporteur opinion form to voting page** — form component, integration

Create these 3 issues, or would you prefer to adjust?
```

Wait for user confirmation before proceeding.

### 3. Determine Issue Type and Label

Based on the nature of the change, classify each issue:

| Change Type | Title Prefix | GitHub Label |
|-------------|-------------|--------------|
| New feature or capability | `feat:` | `enhancement` |
| Bug fix or incorrect behavior | `fix:` | `bug` |
| UI/layout improvement | `UI:` | `enhancement` |
| Documentation update | `docs:` | `documentation` |
| Refactoring (no behavior change) | `refactor:` | `enhancement` |
| Performance improvement | `perf:` | `enhancement` |
| Chore / tooling / config | `chore:` | `enhancement` |

For multiple issues, each issue gets its own type and label independently.

### 4. Draft the Issue(s)

**Title**: Use the format `<type>: <concise description>` following the project's existing convention. Keep it under 80 characters. Examples from this repo:

- `fix: Exclude admin role from director voting functionality`
- `UI: Improve layout ratio on director agenda detail page`
- `fix: remove secretariat access to /analysis routes and add read-only case summary view`
- `feat: require rapporteur opinion before directors can vote`

**Body**: Write an adaptive, context-appropriate issue body. Do NOT use a fixed template — choose the right sections based on what kind of issue this is. The goal is to match the detail level.

#### Reference Patterns

**For bug fixes**:
- Problem statement with clear description of current vs expected behavior
- Reproduction steps (if applicable)
- Table showing inconsistencies (if applicable)
- Affected files with line numbers and code snippets
- Suggested fix with before/after code
- Scope boundaries (what changes, what doesn't)

**For features**:
- Summary explaining the feature and why it matters
- "What it adds" bullet points
- Database changes with SQL snippets
- RLS / business logic changes
- UI changes with component descriptions
- Pros and cons / risks

**For UI tweaks**:
- Problem statement (current state vs expected)
- Specific file and line number
- Suggested fix with before/after code snippets
- Minimal scope — only what needs to change

#### Guidelines for Writing the Body

- Be **concrete and specific**: include file paths, line numbers, code snippets, SQL, component names
- Use **tables** when comparing current vs expected behavior or listing multiple related items
- Use **code blocks** with language tags for SQL, TypeScript, TSX snippets
- Include **"Files to Modify"** section when you know which files are affected
- Include **database changes** section with SQL when schema modifications are needed
- Include **scope boundaries** ("What changes" / "What doesn't change") for issues that might be ambiguous
- Include **pros/cons or risks** for features that introduce trade-offs
- Do NOT pad the issue with boilerplate sections that add no value — every section should carry information
- Write in a way that another developer (or Claude Code) can execute without ambiguity

#### Additional Guidelines for Multiple Issues

- Each issue must be **self-contained** — it should be independently implementable without requiring the other issues to be completed first (unless explicitly noted as a dependency)
- Order issues by dependency: foundational work first (migrations, types), then backend logic, then UI
- Add a **"Related Issues"** section at the bottom of each issue body linking to sibling issues using `#<number>` references (for issues created after the first one) or noting "will be linked after creation" (for the first issue)

### 5. Present Draft for Review

#### Single Issue

Show the user the complete draft:

```
## Issue Draft

**Title**: <title>
**Label**: <label>

---

<full issue body in markdown>
```

Ask the user if they want to:
- **Create as-is** — proceed to step 6
- **Edit** — make requested changes and re-present
- **Cancel** — abort without creating

#### Multiple Issues

Present all drafts in sequence with clear numbering:

```
## Issue 1 of 3

**Title**: feat: add rapporteur_opinion column to votes table
**Label**: enhancement

---

<full issue body>

---

## Issue 2 of 3

**Title**: feat: implement rapporteur opinion backend logic
**Label**: enhancement

---

<full issue body>

---

## Issue 3 of 3
...
```

Ask the user if they want to:
- **Create all** — proceed to create all issues in order
- **Edit** — specify which issue(s) to modify
- **Remove** — drop specific issues from the batch
- **Merge** — combine two or more issues into one
- **Cancel** — abort all

### 6. Create the Issue(s)

Once approved, create each issue using `gh`:

```bash
gh issue create --title "<title>" --label "<label>" --body "$(cat <<'EOF'
<issue body>
EOF
)"
```

If the body contains single quotes or special characters that could break the heredoc, write the body to a temporary file first and use `--body-file`:

```bash
gh issue create --title "<title>" --label "<label>" --body-file <temp-file>
```

#### For Multiple Issues

Create issues **sequentially** (not in parallel) so that:

1. Each issue gets a number immediately after creation
2. Later issues can reference earlier ones with `#<number>` in their "Related Issues" section
3. After creating the first issue, update subsequent issue bodies to include the actual `#<number>` references before creating them
4. If any creation fails, report which succeeded and which failed — do not abort the remaining issues

### 7. Report Result

#### Single Issue

Display:
- The issue URL returned by `gh`
- A one-line summary of what was created

#### Multiple Issues

Display a summary table:

```
| # | Issue | Title | URL |
|---|-------|-------|-----|
| 1 | #85   | feat: add migration for X | https://... |
| 2 | #86   | feat: implement backend for X | https://... |
| 3 | #87   | UI: add form for X | https://... |
```

Plus suggested implementation order (matches creation order, since issues were ordered by dependency).
