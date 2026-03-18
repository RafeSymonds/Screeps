# Deploying

The repository uses `rollup` to bundle your TypeScript code and optionally upload it to a Screeps server. This process is configured via `screeps.json`.

## Common Deploy Commands

- **`npm run push-main`**: Bundles and uploads to the `main` target in `screeps.json`.
- **`npm run push-pserver`**: Bundles and uploads to the `pserver` target (standard for generic private servers).
- **`npm run privateServer`**: A custom shortcut for local development that deploys to a local filesystem directory (controlled by `SCREEPS_LOCAL_PATH` or the default path in `rollup.config.js`).

## Deploying to a Local Private Server

For local development, `npm run privateServer` is the recommended way to quickly verify your changes. If you are running a private server locally, you can specify where the code should be deployed using the `SCREEPS_LOCAL_PATH` environment variable.

{% hint style="info" %}
The `privateServer` command does not use `screeps.json`. Instead, it copies the bundled `main.js` and sourcemaps directly to your local Screeps scripts folder.
{% endhint %}

### Configuring the local path

If the default path in `rollup.config.js` doesn't match your system (e.g., you are on macOS or using a different Windows user), export the `SCREEPS_LOCAL_PATH` variable:

```bash
export SCREEPS_LOCAL_PATH="/path/to/your/screeps/scripts/default"
npm run privateServer
```

Ready for more details on how code is bundled? See [Module Bundling](../in-depth/module-bundling.md).


