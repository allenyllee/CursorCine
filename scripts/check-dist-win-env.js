#!/usr/bin/env node

const { spawnSync } = require("child_process");

function hasCommand(command, args = ["--version"]) {
  try {
    const result = spawnSync(command, args, { stdio: "ignore" });
    return result && result.status === 0;
  } catch (_error) {
    return false;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (process.platform === "win32") {
  process.exit(0);
}

if (!hasCommand("wine")) {
  fail(
    [
      "[dist:win precheck] Non-Windows environment detected without `wine`.",
      "Windows packaging from Linux/WSL requires Wine.",
      "Options:",
      "1) Run `npm run dist:win` on native Windows.",
      "2) Install Wine, then retry in Linux/WSL."
    ].join("\n")
  );
}

process.exit(0);
