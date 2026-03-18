# Authenticating with Screeps

Screeps uses a token-based authentication system. This repository is configured to pull your authentication token from `screeps.json`.

## Setting up Screeps Authentication

A sample configuration file (`screeps.sample.json`) is provided. To use it, copy it and rename it to `screeps.json`.

```bash
cp screeps.sample.json screeps.json
```

{% hint style="danger" %}
**IMPORTANT:** The `screeps.json` file contains your Screeps credentials. It is already included in `.gitignore` to prevent it from being committed. **DO NOT** check this file into source control.
{% endhint %}

## Generating an Auth Token

1. Log in to the official Screeps website.
2. Go to **Account Settings** (click your username > Manage account).
3. Select **Auth Tokens**.
4. Generate a **Full Access** token.
5. Copy the generated token immediately (it is only shown once).

## Adding the Token to `screeps.json`

Open `screeps.json` and paste your token into the `token` field for the relevant environment (e.g., `main`).

```json
{
  "main": {
    "token": "YOUR_TOKEN_HERE",
    "branch": "main",
    "shard": "shard3"
  }
}
```

## Verifying Authentication

To verify that your token is working, perform a test build or deploy:

```bash
npm run build
# Or push to your main target
npm run push-main
```

If the upload succeeds, your authentication is correctly configured.

Next up, [learn more about deploying](deploying.md).

