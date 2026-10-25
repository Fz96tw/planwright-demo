# planwright-demo

A tiny notes API used to demo [Planwright](https://planwright.tools)'s verifiable test evidence:
invariants, error cases, and CI results recorded alongside the agent's own test report.

```bash
npm install
npm test
```

CI runs the Playwright API tests on every push and pull request and uploads
`test-results/report.json` as the `playwright-report` artifact.
