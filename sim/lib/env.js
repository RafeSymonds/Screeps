"use strict";
/*
 * Node-24 container fixes, shared by the runner and the test harness. Must be
 * applied before any ScreepsServer is connected (i.e. before storage is forked).
 */
const fs = require("fs");

let applied = false;

function applyFixes() {
  if (applied) return;
  applied = true;

  // @screeps/storage binds listen(PORT, 'localhost'); on Node 17+ that resolves to
  // IPv6 ::1 first, while the driver dials 127.0.0.1 -> ECONNREFUSED forever. The
  // storage child is forked with a replaced env (can't pass STORAGE_HOST), so force
  // `localhost` -> IPv4 for every process in this container.
  try {
    const hosts = fs.readFileSync("/etc/hosts", "utf8");
    const patched = hosts.replace(/^::1[ \t]+.*localhost.*$/m, "::1 ip6-localhost ip6-loopback");
    if (patched !== hosts) fs.writeFileSync("/etc/hosts", patched);
  } catch (e) {
    console.warn("[sim] could not patch /etc/hosts for IPv4 localhost:", e.message);
  }
  process.env.STORAGE_HOST = process.env.STORAGE_HOST || "127.0.0.1";

  // Swallow the benign storage-reconnect noise the driver emits in the ~1s before
  // the storage child binds its port. Only these exact patterns are dropped.
  for (const stream of [process.stdout, process.stderr]) {
    if (stream.__simFiltered) continue;
    const orig = stream.write.bind(stream);
    stream.write = (chunk, ...args) => {
      const s = typeof chunk === "string" ? chunk : chunk && chunk.toString();
      if (
        s &&
        (s.includes("Storage connection lost") ||
          s === "Connecting to storage\n" ||
          (s.includes("ECONNREFUSED") && s.includes("21025")))
      ) {
        const cb = args[args.length - 1];
        if (typeof cb === "function") cb();
        return true;
      }
      return orig(chunk, ...args);
    };
    stream.__simFiltered = true;
  }
}

module.exports = { applyFixes };
