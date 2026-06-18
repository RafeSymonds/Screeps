# Headless Screeps engine on the SAME Node major as production (Node 24).
#
# The stock `screeps-server-mockup` npm release pins the ancient isolated-vm@2.x
# engine (Node <=12 only). We instead install the mockup's git master (which the
# maintainers updated for Node 24) together with @screeps/driver@5.3.0 — the
# `feat-node24` driver that compiles a patched isolated-vm from git. That native
# build is why this image needs a full C/C++ toolchain.
FROM node:24-bookworm

# Acquire::Check-Date=false tolerates Docker Desktop's VM clock drifting behind
# real time (otherwise apt rejects repo release files as "not valid yet").
RUN apt-get -o Acquire::Check-Date=false update && apt-get install -y --no-install-recommends \
    build-essential python3 git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /sim
COPY package.json ./
RUN npm install --no-audit --no-fund

# Baked defaults; bin/sim bind-mounts these (and the bot bundle) at runtime so
# editing a scenario, the harness, or a test needs no image rebuild.
COPY run.js ./
COPY lib ./lib
COPY scenarios ./scenarios
COPY tests ./tests

ENTRYPOINT ["node", "/sim/run.js"]
