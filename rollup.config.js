"use strict";

import clear from 'rollup-plugin-clear';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import screeps from 'rollup-plugin-screeps';
import { existsSync, mkdirSync, accessSync, constants, readdirSync } from 'fs';
import os from 'os';

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';
const isWsl = isLinux && (process.env.WSL_DISTRO_NAME || os.release().toLowerCase().includes('microsoft'));

const localPathSuffix = "Screeps/scripts/127_0_0_1___21025/default";

const findFirstExistingPath = candidates => {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
};

const findWslLocalHostLocation = () => {
  const usersRoot = "/mnt/c/Users";
  if (!existsSync(usersRoot)) {
    return undefined;
  }

  const userDirs = readdirSync(usersRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  return findFirstExistingPath(
    userDirs.map(user => `${usersRoot}/${user}/AppData/Local/${localPathSuffix}`)
  );
};

let defaultLocalHostLocation;
if (isWindows) {
  defaultLocalHostLocation = `${process.env.APPDATA}\\${localPathSuffix.replace(/\//g, "\\")}`;
} else if (isMac) {
  defaultLocalHostLocation = `${os.homedir()}/Library/Application Support/${localPathSuffix}`;
} else {
  const linuxDefault = `${os.homedir()}/.config/${localPathSuffix}`;
  const wslDefault = isWsl ? findWslLocalHostLocation() : undefined;
  defaultLocalHostLocation = wslDefault || linuxDefault;
}

const localHostLocation = process.env.SCREEPS_LOCAL_PATH || defaultLocalHostLocation;

// Example for macOS or custom paths:
// export SCREEPS_LOCAL_PATH="/Users/rafe/Library/Application Support/Screeps/scripts/127_0_0_1___21025/default"
// Example for Linux:
// export SCREEPS_LOCAL_PATH="$HOME/.config/Screeps/scripts/127_0_0_1___21025/default"
let cfg;
const dest2 = process.env.DEST;
let dest;
let dist = "dist";
if (dest2 === "local") {
  if (!existsSync(localHostLocation)) {
    try {
      mkdirSync(localHostLocation, { recursive: true });
    } catch (error) {
      console.error(`Failed to prepare the local Screeps directory at ${localHostLocation}: ${error.message}`);
      console.error("Ensure the path is correct and writable before running deploy_private.");
      console.error("You can override the destination by exporting SCREEPS_LOCAL_PATH.");
      process.exit(1);
    }
  }

  try {
    accessSync(localHostLocation, constants.W_OK);
  } catch (error) {
    console.error(`Cannot write to the local Screeps directory at ${localHostLocation}: ${error.message}`);
    console.error("Ensure the path is writable or override it by exporting SCREEPS_LOCAL_PATH before running deploy_private.");
    process.exit(1);
  }

  dest = localHostLocation;
  dist = localHostLocation;

} else {
  dest = dest2;
}
console.log(dest);
if (!dest) {
  console.log("No destination specified - code will be compiled but not uploaded");
} else if (dest2 !== "local") {
  // screeps.json holds API tokens, so it is gitignored and never committed —
  // which means a fresh clone has no prod credentials at all. Without this guard
  // that surfaces as a bare Node MODULE_NOT_FOUND stack from deep inside rollup,
  // which reads like a build failure rather than "you have not configured a
  // destination yet".
  if (!existsSync("./screeps.json")) {
    console.error("");
    console.error(`Cannot deploy to "${dest}": screeps.json is missing.`);
    console.error("");
    console.error("It holds your API token, so it is gitignored and must be created locally:");
    console.error("  cp screeps.sample.json screeps.json");
    console.error(`  # then edit the "${dest}" entry and paste your token`);
    console.error("");
    console.error("Get a token at https://screeps.com/a/#!/account/auth-tokens");
    console.error("Deploying to a local private server instead needs no token: npm run privateServer");
    console.error("");
    process.exit(1);
  }

  const all = require("./screeps.json");
  cfg = all[dest];
  if (cfg == null) {
    console.error("");
    console.error(`Cannot deploy to "${dest}": screeps.json has no "${dest}" entry.`);
    console.error(`Found: ${Object.keys(all).join(", ") || "(nothing)"}`);
    console.error("");
    process.exit(1);
  }
  if (typeof cfg.token === "string" && cfg.token.startsWith("replace-with-your")) {
    // Otherwise the upload runs with the placeholder and fails at the server with
    // an auth error that looks nothing like "you forgot to paste your token".
    console.error("");
    console.error(`Cannot deploy to "${dest}": the token is still the sample placeholder.`);
    console.error(`Edit screeps.json and set the "${dest}" token to a real one.`);
    console.error("");
    process.exit(1);
  }
}

export default {
  input: "src/main.ts",
  output: {
    file: dist + "/main.js",
    format: "cjs",
    sourcemap: true
  },

  plugins: [
    clear({ targets: ["dist"] }),
    resolve({ rootDir: "src" }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" }),
    screeps({ config: cfg, dryRun: cfg == null })
  ]
}
