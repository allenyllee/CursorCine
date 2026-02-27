#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");

const rootDir = path.resolve(__dirname, "..");
const devcontainerDir = path.join(rootDir, ".devcontainer");
const targetPath = path.join(devcontainerDir, "devcontainer.json");
const portablePath = path.join(devcontainerDir, "devcontainer.portable.json");
const linuxPath = path.join(devcontainerDir, "devcontainer.linux.json");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function detectLinuxGuiAudioReady() {
  if (os.platform() !== "linux") return false;

  const x11SocketDir = "/tmp/.X11-unix";
  const xdgRuntimeDir = process.env.XDG_RUNTIME_DIR || "";
  const waylandDisplay = process.env.WAYLAND_DISPLAY || "";
  const homeDir = process.env.HOME || "";

  const hasX11 = exists(x11SocketDir);
  const hasWaylandSocket =
    !!xdgRuntimeDir &&
    !!waylandDisplay &&
    exists(path.join(xdgRuntimeDir, waylandDisplay));
  const hasPulseSocket =
    !!xdgRuntimeDir && exists(path.join(xdgRuntimeDir, "pulse", "native"));
  const hasPulseCookie =
    !!homeDir && exists(path.join(homeDir, ".config", "pulse", "cookie"));

  return hasX11 && hasWaylandSocket && hasPulseSocket && hasPulseCookie;
}

function resolveMode() {
  const arg = process.argv[2];
  if (arg === "--linux") return "linux";
  if (arg === "--portable") return "portable";
  return detectLinuxGuiAudioReady() ? "linux" : "portable";
}

function main() {
  const mode = resolveMode();
  const sourcePath = mode === "linux" ? linuxPath : portablePath;

  if (!exists(sourcePath)) {
    console.error(`[devcontainer] Missing config template: ${sourcePath}`);
    process.exit(1);
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(
    `[devcontainer] Selected ${mode} config -> ${path.relative(rootDir, targetPath)}`
  );
}

main();
