# Installation

To set up this custom Screeps AI for local development or deployment, follow these steps.

## Requirements

- **Node.js**: `package.json` requires Node `>=20` for the local build/test toolchain (Node 24 is recommended; the dev container ships Node 24). Note this is separate from the **game runtime**, which runs **Node.js 24 (V8 13.6)** as of the April 2026 server upgrade — so deployed code may use modern JavaScript natively.
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
