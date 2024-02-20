"use strict";

import clear from 'rollup-plugin-clear';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import screeps from 'rollup-plugin-screeps';


const { execSync } = require('child_process');

// Function to check if the C drive is mounted
function isCDriveMounted() {
  try {
    execSync('ls /mnt/c');
    return true; // Mounted
  } catch (error) {
    return false; // Not mounted
  }
}

// Mount the C drive if not already mounted
if (!isCDriveMounted()) {
  try {
    execSync('sudo mount -t drvfs C: /mnt/c');
    console.log('C drive mounted successfully.');
  } catch (error) {
    console.error('Failed to mount the C drive:', error.message);
    process.exit(1);
  }
}

const localHostLocation = "/mnt/c/Users/rafes/AppData/Local/Screeps/scripts/127_0_0_1___21025/default";

//C:\\Users\\rafes\\AppData\\Local\\Screeps\\scripts\\127_0_0_1___21025\\default";
let cfg;
const dest2 = process.env.DEST;
let dest;
let dist = "dist";
if (dest2 === "local") {

  dest = localHostLocation;
  dist = localHostLocation;

} else {
  dest = dest2;
}
console.log(dest);
if (!dest) {
  console.log("No destination specified - code will be compiled but not uploaded");
} else if ((cfg = require("./screeps.json")[dest]) == null && dest2 !== "local") {
  throw new Error("Invalid upload destination");
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
