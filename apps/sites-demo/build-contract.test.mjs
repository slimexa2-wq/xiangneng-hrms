import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const buildSource = await readFile(new URL("./build.mjs", import.meta.url), "utf8");

test("public demo compiles the shared workspace package before Vite bundles", () => {
  const sharedBuild = 'run(["--filter", "@xiangneng/shared", "build"]);';
  assert.ok(buildSource.includes(sharedBuild), "shared package build command is missing");
  assert.ok(
    buildSource.indexOf(sharedBuild) < buildSource.indexOf('"@xiangneng/portal"'),
    "shared package must be compiled before portal/admin bundling"
  );
});
