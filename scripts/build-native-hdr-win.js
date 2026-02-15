#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const moduleDir = path.join(__dirname, "..", "native", "windows-hdr-capture");
const vcxprojPath = path.join(moduleDir, "build", "windows_hdr_capture.vcxproj");

function runNodeGyp(args) {
  const cmd = process.platform === "win32" ? "node-gyp.cmd" : "node-gyp";
  const result = spawnSync(cmd, args, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function patchPlatformToolset() {
  if (!fs.existsSync(vcxprojPath)) {
    console.error("[build:native-hdr-win] vcxproj not found:", vcxprojPath);
    process.exit(1);
  }
  const content = fs.readFileSync(vcxprojPath, "utf8");
  const replaced = content.replace(/<PlatformToolset>[^<]+<\/PlatformToolset>/g, "<PlatformToolset>v143</PlatformToolset>");
  if (replaced !== content) {
    fs.writeFileSync(vcxprojPath, replaced, "utf8");
  }
}

if (process.platform !== "win32") {
  runNodeGyp(["rebuild", "--directory", "native/windows-hdr-capture"]);
  process.exit(0);
}

runNodeGyp(["configure", "--directory", "native/windows-hdr-capture"]);
patchPlatformToolset();
runNodeGyp(["build", "--directory", "native/windows-hdr-capture"]);
