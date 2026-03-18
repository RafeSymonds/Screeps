# Installation

To set up this custom Screeps AI for local development or deployment, follow these steps.

## Requirements

- **Node.js**: The repository currently specifies `10.x` or `12.x` in `package.json`, though modern environments often use `16.x` or higher.
- **npm**: Standard package manager for dependencies.
- **Python 3**: Required for running the agent management scripts (`scripts/agent_manager.py`).

## Initial Setup

1. **Clone the repository** (if you haven't already).
2. **Install dependencies**:

```bash
npm install
```

3. **Configure Screeps Credentials**:
   Copy `screeps.sample.json` to `screeps.json` and fill in your details for official shards or private servers.

Once you have installed the dependencies, proceed to [authenticating with the Screeps server](authenticating.md) or [deploying](deploying.md).
