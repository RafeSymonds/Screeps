# Deploying

The repository uses `rollup` to bundle your TypeScript code and optionally upload it to a Screeps server. This process is configured via `screeps.json`.

## Common Deploy Commands

- **`npm run push-main`**: Bundles and uploads to the `main` target in `screeps.json`.
- **`npm run push-pserver`**: Bundles and uploads to the `pserver` target (standard for generic private servers).
- **`npm run privateServer`**: A custom shortcut for local development that deploys to the `local` environment in `screeps.json`.

## Deploying to a Local Private Server

For local development, `npm run privateServer` is the recommended way to quickly verify your changes. If you are running a private server locally, you can specify where the code should be deployed using the `SCREEPS_LOCAL_PATH` environment variable if the default path in `screeps.json` is not correct for your environment.

{% hint style="info" %}
You don't have to manually create target branches in your Screeps client. The rollup plugin will do it for you.
{% endhint %}

### Configuring `screeps.json`

Ensure your `screeps.json` has the correct environment definitions. For a local private server:

- **`hostname`**: Typically `127.0.0.1`.
- **`port`**: Default is usually `21025`.
- **`email`**: Your username on the private server.
- **`password`**: Your password on the private server.

Ready for more details on how code is bundled? See [Module Bundling](../in-depth/module-bundling.md).


