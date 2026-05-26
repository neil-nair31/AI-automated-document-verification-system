# Merging pull requests

This repo had several feature branches opened in parallel from the same initial commit. If you merge them one-by-one onto an empty `main`, later PRs will conflict. Use either **Option A** (recommended) or **Option B**.

## Option A — Merge the integration PR (recommended)

1. Open the pull request titled **Integrate feature branches into main** (branch `cursor/integrate-branches-400f`).
2. Review the **Files changed** tab.
3. Click **Merge pull request** → **Confirm merge**.
4. Close the older open/draft PRs (#1–#4) as superseded, or leave them; GitHub will show them as closed once their commits are on `main`.

No special permissions are required beyond **Write** access to the repository.

## Option B — Merge the original PRs yourself

If you prefer to keep the original PR numbers:

| Order | PR | Branch | Notes |
|------:|----|--------|-------|
| 1 | #1 | `cursor/scaffold-docverify-8022` | Backend scaffold — merge first |
| 2 | #3 | `cursor/deployment-artifacts-8022` | Includes scaffold + deploy files |
| 3 | #4 | `cursor/dev-env-setup-f22a` | AGENTS.md + frontend demo |
| 4 | #2 | `cursor/entra-sso-frontend-8022` | May already be included after #4 |

### Draft PRs must be marked ready

PRs **#2**, **#3**, and **#4** were opened as **drafts**. GitHub hides the merge button until you:

1. Open the PR on GitHub.
2. Click **Ready for review** (right sidebar or banner).
3. Then **Merge pull request** appears (if there are no conflicts and checks pass).

From the CLI:

```bash
gh pr ready 2 3 4
```

### Merge via GitHub UI

1. Go to **Pull requests** → select the PR.
2. Ensure status is **Ready for review** (not Draft).
3. Wait for checks (if any) to finish.
4. Click **Merge pull request** → choose merge type → **Confirm merge**.

### Merge via GitHub CLI

```bash
gh pr merge 1 --merge    # after #1 is the only one touching main
gh pr ready 3 && gh pr merge 3 --merge
# …and so on
```

## Why merges were blocked before

- **`main` only had the initial README**, while all work lived on Cursor branches — nothing to deploy until those land on `main`.
- **Draft PRs** do not offer a merge button until marked ready.
- **Parallel branches** share no common merge history; merging out of order causes conflicts.

After `main` contains the integrated code, deploy using **[DEPLOY.md](../DEPLOY.md)**.
