# Testing

The repository has two test layers:

- **`npm run test`**: host-side mocha + chai suites compiled via `tsconfig.test.json`. Unit tests
  live in `test/unit/**/*.test.ts`, integration tests in `test/integration/**/*.test.ts`. The
  Screeps globals (game constants, fresh `Game`/`Memory` mocks per test) are provided by
  `test/helpers/setup.ts`. Currently these are placeholder harness tests — the bot is being
  rebuilt from scratch — so add real suites alongside new bot logic.
- **`bin/sim test`**: behavioral regression tests (`sim/tests/`) that run the real bundled bot in
  the real Screeps engine (Node 24, in Docker) for many ticks and assert on the timeline. Much
  slower; use for multi-tick behavior that host-side mocks can't surface. See `sim/README.md`.

## Running Subsets

```bash
# Run unit tests only
npm run test-unit

# Run integration tests only
npm run test-integration

# Run one sim suite
bin/sim test -- --grep smoke
```
