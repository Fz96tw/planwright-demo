# planwright-demo

A tiny notes API (Node, no framework) used to demo Planwright's verifiable test evidence.

## Commands

```bash
npm install
npm start      # API on :4010
npm test       # Playwright API tests; writes test-results/report.json
```

## Rules that must always hold

- Every endpoint except `/health` requires a valid, unexpired bearer token.
- A user never sees another user's notes or audit entries.
- Audit log entries are append-only: never modified or deleted.
- Error responses never include stack traces or internal error details.

## Tests

Tests live in `tests/` and use Playwright's API testing (no browser). Tag a test that proves an
acceptance criterion with `[AC:<id>]` in its title, and a test that guards a rule above with
`[INV:<id>]`, using the ids Planwright gives you.
