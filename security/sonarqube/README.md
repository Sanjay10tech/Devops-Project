# SonarQube

The scanner configuration lives at the repository root as
[`sonar-project.properties`](../../sonar-project.properties) (the default location
the SonarQube scanner looks for).

- **Server URL and token** are supplied by Jenkins via `withSonarQubeEnv('sonarqube')`
  and the SonarQube server configured under *Manage Jenkins → System*. The token is
  never stored in the repo.
- The **Quality Gate** stage in the [`Jenkinsfile`](../../jenkins/Jenkinsfile) calls
  `waitForQualityGate abortPipeline: true`, so a failing gate fails the build.
- Coverage is read from `backend/coverage/lcov.info` (run `npm run test:coverage`).
