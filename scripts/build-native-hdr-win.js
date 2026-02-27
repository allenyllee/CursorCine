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

const quietBuild = String(process.env.CURSORCINE_NATIVE_BUILD_QUIET || "") === "1";

function runNodeGyp(args) {
  const nodeGypScript = path.join(__dirname, "..", "node_modules", "node-gyp", "bin", "node-gyp.js");
  const result = spawnSync(process.execPath, [nodeGypScript, ...args], {
    cwd: path.join(__dirname, ".."),
    stdio: quietBuild ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: quietBuild ? "utf8" : undefined,
    env: process.env,
  });
  if (result.status !== 0) {
    if (quietBuild) {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    process.exit(result.status || 1);
  }
}

function cleanBuildDir(moduleDir) {
  const buildDir = path.join(moduleDir, "build");
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
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
  cleanBuildDir(absDir);
  runNodeGyp(["configure", "--directory", moduleItem.dir]);
  patchPlatformToolset(absDir, moduleItem.vcxproj);
  runNodeGyp(["build", "--directory", moduleItem.dir]);
}
