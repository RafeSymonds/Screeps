# Testing

Automated testing in this repository is currently in a **legacy state**. While the structure for unit and integration testing exists, the standard `npm test` command is known to fail under current environment assumptions.

## Current Test Status

- **`npm run test`**: Runs both unit and integration tests. Expect failures due to legacy Mocha/TypeScript harness mismatches.
- **Unit Testing**: Tests core logic in isolation. These are generally faster but may require updates to match the current world-model behavior.
- **Integration Testing**: Designed to run against a mock Screeps server. These tests are currently scaffolded but not fully integrated into the development loop.

### Running Legacy Tests

If you need to run tests for reference or to reproduce specific logic issues, use these commands:

```bash
# Run unit tests only
npm run test-unit

# Run integration tests only
npm run test-integration
```

For more details on why tests might be failing, check [AGENTS.md](../../AGENTS.md).

## Future Directions

Improving the test harness is a known backlog item. New features should ideally include unit tests, but be aware that you may need to fix or bypass pre-existing harness issues in `tsconfig.test.json` or the `test/helpers` setup.

### Unit Testing Strategy

Unit tests are located in `test/unit/**/*.test.ts`. They use `mocha` and `chai` for assertions.

### Integration Testing Strategy

Integration tests are located in `test/integration/**/*.ts`. They utilize `screeps-server-mockup` to simulate a live game environment. Note that these tests are significantly slower than unit tests.
