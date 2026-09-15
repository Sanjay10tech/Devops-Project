# GitHub Repository Settings Checklist

One-time configuration to apply after pushing the project to
`https://github.com/Sanjay10tech/Devops-Project`. These settings enforce the
`main` / `develop` / `feature/*` workflow and the security posture described in
[`SECURITY.md`](../SECURITY.md).

> Settings live under the repository **Settings** tab unless noted otherwise.
> The exact labels vary slightly between the classic **Branch protection rules**
> and the newer **Rulesets**; both achieve the same result.

## 1. Default branch & branches

- [ ] Set the **default branch** to `develop` (day-to-day integration) — Settings → General.
- [ ] Ensure both `main` and `develop` exist and are long-lived.

## 2. Branch protection — `main`

Settings → Branches → Add rule for `main`:

- [ ] Require a pull request before merging
- [ ] Require approvals: **at least 1** (2+ recommended for production branch)
- [ ] Dismiss stale approvals when new commits are pushed
- [ ] Require review from **Code Owners** (uses [`.github/CODEOWNERS`](../.github/CODEOWNERS))
- [ ] Require status checks to pass before merging, and require branches to be up to date:
  - [ ] `Backend (typecheck + tests)`
  - [ ] `Frontend (typecheck + build)`
  - [ ] `Gitleaks`
- [ ] Require conversation resolution before merging
- [ ] Require linear history (pairs well with squash merge)
- [ ] Do not allow bypassing the above (include administrators)
- [ ] Restrict who can push (no direct pushes; PRs only)
- [ ] Block force pushes and deletions

## 3. Branch protection — `develop`

Add a rule for `develop` (same as `main`, may be slightly lighter):

- [ ] Require a pull request before merging
- [ ] Require approvals: **at least 1**
- [ ] Require the same status checks (`Backend…`, `Frontend…`, `Gitleaks`)
- [ ] Require conversation resolution
- [ ] Block force pushes and deletions

## 4. Merge settings

Settings → General → Pull Requests:

- [ ] Allow **squash merging** (recommended default for a clean history)
- [ ] Disable merge commits (optional) to enforce squash
- [ ] Enable **Automatically delete head branches** after merge

## 5. Required pull-request reviews

- [ ] Minimum **1 approving review** on protected branches (see above)
- [ ] Code Owner review required for high-risk paths (`infra/`, `k8s/`, `argocd/`,
      `jenkins/`, `security/`, `.github/`) via CODEOWNERS
- [ ] PR template is in place ([`.github/pull_request_template.md`](../.github/pull_request_template.md))

## 6. Secret management

- [ ] Confirm **no secrets are committed** (only `.env.example` files exist)
- [ ] Add CI/CD secrets under Settings → Secrets and variables → **Actions**
      (e.g. `GITLEAKS_LICENSE` if using org features). Never hardcode them in workflows.
- [ ] Enable **Secret scanning** (Settings → Code security) — and **Push protection**
      to block commits that contain detected secrets
- [ ] Rotate any secret immediately if it is ever exposed

## 7. Dependency & security alerts

Settings → Code security and analysis:

- [ ] Enable **Dependabot alerts**
- [ ] Enable **Dependabot security updates**
- [ ] Confirm the version-update config is present
      ([`.github/dependabot.yml`](../.github/dependabot.yml))
- [ ] Enable **Secret scanning** + **Push protection** (see above)
- [ ] Enable **Private vulnerability reporting** (lets researchers use the Security tab)
- [ ] (Optional) Enable **CodeQL** code scanning for deeper SAST on GitHub

## 8. CODEOWNERS

- [ ] [`.github/CODEOWNERS`](../.github/CODEOWNERS) is committed
- [ ] Replace `@Sanjay10tech` with team handles (e.g. `@org/backend`) as the team grows
- [ ] "Require review from Code Owners" is enabled in branch protection (step 2/3)

## 9. General hygiene

- [ ] Add a repository description and topics (e.g. `devops`, `kubernetes`, `argocd`, `react`)
- [ ] Confirm the **LICENSE** is detected (MIT)
- [ ] Enable **Issues** and confirm issue templates appear
      ([`.github/ISSUE_TEMPLATE`](../.github/ISSUE_TEMPLATE))
- [ ] Restrict **Actions permissions** to what's needed (Settings → Actions → General):
      set workflow permissions to **read-only** by default

## Verifying it works

1. Push a `feature/*` branch and open a PR into `develop`.
2. Confirm the PR checks (`Backend…`, `Frontend…`, `Gitleaks`) run and are **required**.
3. Confirm merging is blocked until checks pass and the review requirement is met.
4. Confirm a direct push to `main`/`develop` is rejected.
