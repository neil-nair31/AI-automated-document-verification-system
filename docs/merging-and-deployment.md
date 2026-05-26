# Merging pull requests and deployment

This guide covers how to merge your own work on GitHub and how to think about deployment as the project grows.

## Accepting and merging pull requests

On GitHub, “accepting” a change usually means **merging a pull request** into a branch such as `main`.

### If the merge button is disabled or missing

1. **Draft pull requests**  
   Draft PRs cannot be merged until they are marked ready. Open the PR, click **Ready for review**, then use **Merge pull request**.

2. **Branch protection or rulesets**  
   If merging is blocked by policy (required reviews, required status checks, linear history, etc.), adjust repository settings:

   - Go to **Settings** → **Rules** → **Rulesets** (or **Branches** → **Branch protection rules** for the classic UI).
   - Select the rule that applies to `main` (or your default branch).
   - Common fixes for a solo maintainer:
     - **Require a pull request before merging**: either turn this off, or set **Required approvals** to `0` if the platform allows self-approval.
     - **Require review from Code Owners**: disable unless you have a `CODEOWNERS` file and want that workflow.
     - **Allow specified actors to bypass**: add your GitHub user so you can merge when checks are still pending (use sparingly).
   - Repo admins can often merge with **administrator privileges** if the rule allows bypass for admins (depends on the exact rule).

3. **Required checks failing**  
   Fix failing CI jobs, or temporarily relax the rule that requires those checks—only if you understand the risk.

4. **Merge conflicts**  
   Resolve conflicts on the PR branch (GitHub’s web editor or locally with `git merge` / `git rebase`), push updates, then merge.

### Typical merge flow

1. Open the PR from your branch into `main`.
2. Confirm CI (if any) is green.
3. Choose **Squash and merge**, **Merge**, or **Rebase and merge** according to your team convention.
4. Delete the remote branch after merge if you no longer need it.

---

## How to deploy

This repository is currently a **placeholder** (no application or `Dockerfile` yet). Deployment steps depend on what you build. Below is a practical map you can follow once you have a runnable service.

### 1. Define what you are deploying

- **Static site or SPA** (e.g. Vite, Next.js static export): host on **GitHub Pages**, **Netlify**, **Vercel**, or **Cloudflare Pages**.
- **Node API or full-stack app**: **Railway**, **Render**, **Fly.io**, **Azure App Service**, **AWS Elastic Beanstalk / ECS**, etc.
- **Containers**: build an image in CI, push to a registry (**GHCR**, **ECR**, **Docker Hub**), run on **Kubernetes**, **ECS**, **Cloud Run**, or a VM with Docker.

### 2. Continuous deployment (recommended)

- Add a workflow under `.github/workflows/` that runs on `push` to `main` (or on release tags).
- Steps usually: install dependencies → test/lint → build → deploy (using the host’s CLI or official GitHub Action).
- Store secrets (**API keys**, **cloud credentials**) in **GitHub Actions secrets** (`Settings` → `Secrets and variables` → `Actions`), never in the repo.

### 3. Manual deploy (fine for early experiments)

- Build artifacts locally or on a server.
- Copy files or run `docker compose up` / your platform’s deploy command.
- Point DNS and TLS at the host’s instructions.

### 4. When this repo has an app

Update this document (or add a `DEPLOY.md` next to the code) with:

- Exact build command (e.g. `npm run build`).
- Runtime (Node version, Python version, etc.).
- Environment variables and where to set them in production.
- Health check URL and rollback procedure if applicable.

---

## Quick reference: GitHub settings paths

| Goal | Where to go |
|------|----------------|
| Change who can merge / bypass rules | **Settings** → **Rules** → **Rulesets** (or **Branches**) |
| Actions secrets for deploy | **Settings** → **Secrets and variables** → **Actions** |
| General collaboration | **Settings** → **General** (features, merge button types) |

If you tell us your stack (e.g. “Next.js on Vercel” or “FastAPI in Docker on Fly.io”), these steps can be narrowed to a single copy-paste checklist.
