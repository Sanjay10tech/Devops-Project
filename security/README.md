# Security Scanning Configuration

Layered "shift-left" scanning. Each tool is a gate in the Jenkins pipeline
([`../jenkins/Jenkinsfile`](../jenkins/Jenkinsfile)); a failing gate blocks promotion.

| Tool | Scope | Config | Pipeline stage |
|---|---|---|---|
| SonarQube | Code quality / SAST | [`../sonar-project.properties`](../sonar-project.properties), `sonarqube/README.md` | SonarQube + Quality Gate |
| OWASP Dependency-Check | Application dependency CVEs | `owasp-dependency-check/suppression.xml` | Dependency Scan |
| Trivy (filesystem) | Source deps, secrets, misconfig | `trivy/.trivyignore` | Trivy Filesystem Scan |
| Trivy (image) | Container image & OS package CVEs | `trivy/.trivyignore` | Trivy Image Scan |
| Gitleaks | Committed secrets | `gitleaks/.gitleaks.toml` | (CI + GitHub Actions) |

## Gates

- **Trivy** fails on `HIGH,CRITICAL` (both filesystem and image scans).
- **OWASP Dependency-Check** fails on CVSS ≥ 7.
- **SonarQube** enforces the project Quality Gate (`waitForQualityGate abortPipeline: true`).
- **Gitleaks** blocks any commit/PR containing secrets.

## Principles

- No secrets in Git or images — secrets live in AWS Secrets Manager and are injected
  at runtime (see [`../ARCHITECTURE.md`](../ARCHITECTURE.md)).
- Suppressions/ignores require a written justification and periodic review; prefer
  upgrading over ignoring.
