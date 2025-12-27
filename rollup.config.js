"use strict";

import clear from 'rollup-plugin-clear';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import screeps from 'rollup-plugin-screeps';
import { existsSync, mkdirSync, accessSync, constants } from 'fs';

const defaultLocalHostLocation = "/mnt/c/Users/rafes/AppData/Local/Screeps/scripts/127_0_0_1___21025/default";

const localHostLocation = process.env.SCREEPS_LOCAL_PATH || defaultLocalHostLocation;

//C:\\Users\\rafes\\AppData\\Local\\Screeps\\scripts\\127_0_0_1___21025\\default";
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
      console.error("Ensure your Windows drive is mounted and the path is correct before running deploy_private.");
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
  cfg = require("./screeps.json")[dest];
  if (cfg == null) {
    throw new Error("Invalid upload destination");
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
