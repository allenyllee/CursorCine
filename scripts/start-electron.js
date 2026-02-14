#!/usr/bin/env node

const { spawn } = require("child_process");
const electron = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = ["--no-sandbox", "--disable-setuid-sandbox", "."];
const child = spawn(electron, args, {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(typeof code === "number" ? code : 0);
});

child.on("error", (error) => {
  console.error("Failed to launch Electron:", error.message);
  process.exit(1);
});
