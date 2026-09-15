# Contributing

Thanks for contributing. This guide covers the Git workflow, branch model, commit
conventions, and pull-request process for this project.

## Prerequisites

- Node.js 18+ and npm
- Docker + Docker Compose (for running the full stack)
- Git

## Local setup

```bash
git clone https://github.com/Sanjay10tech/Devops-Project.git
cd Devops-Project

# Option A: whole stack in Docker
cp .env.example .env
docker compose up -d --build

# Option B: run services directly (see backend/ and frontend/ READMEs)
```

Before pushing, run the checks locally:

```bash
cd backend && npm install && npm run typecheck && npm test
cd ../frontend && npm install && npm run typecheck && npm run build
```

## Branching model

We follow a `main` / `develop` / `feature/*` model.

| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production-ready, release history. Protected. | prod (via GitOps) |
| `develop` | Integration branch for the next release. Protected. | dev/staging |
| `feature/*` | Individual features/fixes, branched from `develop`. | — |

```
main   ●───────────────●────────────────●        (releases, tagged)
        \             ↑ merge (PR)      ↑ merge (release PR)
develop  ●──●────●────●────────●────────●          (integration)
              \        ↑ merge (PR)
feature/...    ●──●──●                              (your work)
```

Rules:

- Never commit directly to `main` or `develop` — both are protected and require PRs.
- Branch features from `develop`; branch urgent production fixes from `main` as
  `hotfix/*` and merge back into both `main` and `develop`.

### Branch naming

```
feature/<short-description>     e.g. feature/search-pagination
bugfix/<short-description>      e.g. bugfix/hero-image-overflow
hotfix/<short-description>      e.g. hotfix/health-check-timeout
chore/<short-description>       e.g. chore/bump-node-20
```

Use lowercase and hyphens. Reference an issue where relevant (`feature/42-search`).

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short summary>

<optional body>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`.

Examples:

```
feat(backend): add pagination to content list endpoint
fix(frontend): prevent hero image overflow on mobile
docs: document docker compose workflow
```

Keep commits focused and the summary under ~72 characters.

## Pull-request workflow

1. **Create a branch** from `develop` (or `main` for hotfixes).
2. **Make changes** with focused commits; keep the PR small and reviewable.
3. **Run checks locally** (typecheck, tests, build) before pushing.
4. **Open a PR** into `develop` (or `main` for hotfixes). Fill in the PR template.
5. **Automated checks run** — GitHub Actions runs lint, typecheck, unit tests, and a
   secret scan. The full build/scan/deploy pipeline runs in Jenkins.
6. **Request review** — at least **one approving review** is required (see
   [CODEOWNERS](./.github/CODEOWNERS) for areas that require specific reviewers).
7. **Address feedback** and keep the branch up to date with the base branch.
8. **Merge** once approved and all required checks are green. Prefer **squash merge**
   to keep history clean. Delete the branch after merge.

### PR checklist (also in the template)

- [ ] Branch targets the correct base (`develop` for features, `main` for hotfixes)
- [ ] Title follows Conventional Commits
- [ ] `npm run typecheck` and `npm test` pass locally
- [ ] No secrets, credentials, `.env`, kubeconfig, or AWS keys are included
- [ ] Documentation updated if behavior or setup changed
- [ ] Linked to a related issue where applicable

## Releasing

1. Open a PR from `develop` → `main`.
2. After merge, tag the release on `main` (`vX.Y.Z`, semantic versioning).
3. The tag/merge drives the production deployment via the Jenkins → GitOps → ArgoCD flow.

## Code style

- TypeScript in `strict` mode across backend and frontend.
- Keep the clean-architecture layering in the backend (routes → controllers →
  services → repositories). Business logic lives in services and is unit-tested.
- Prefer small, composable React components; keep data-fetching in hooks/pages.

## Reporting security issues

Do **not** open a public issue for vulnerabilities. Follow [SECURITY.md](./SECURITY.md).
