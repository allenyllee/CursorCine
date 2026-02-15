#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const modules = [
  {
    dir: "native/windows-hdr-capture",
    vcxproj: "windows_hdr_capture.vcxproj",
  },
  {
    dir: "native/windows-wgc-hdr-capture",
    vcxproj: "windows_wgc_hdr_capture.vcxproj",
  },
];

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

function patchPlatformToolset(moduleDir, vcxprojName) {
  const vcxprojPath = path.join(moduleDir, "build", vcxprojName);
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

for (const moduleItem of modules) {
  if (process.platform !== "win32") {
    runNodeGyp(["rebuild", "--directory", moduleItem.dir]);
    continue;
  }

  const absDir = path.join(__dirname, "..", moduleItem.dir);
  runNodeGyp(["configure", "--directory", moduleItem.dir]);
  patchPlatformToolset(absDir, moduleItem.vcxproj);
  runNodeGyp(["build", "--directory", moduleItem.dir]);
}
