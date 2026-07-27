import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../.github/workflows/public-demo.yml", import.meta.url), "utf8");

test("public demo workflow verifies both public entry URLs after publishing", () => {
  assert.match(workflow, /Verify public demo URLs/);
  assert.match(workflow, /raw\.githack\.com\/slimexa2-wq\/xiangneng-hrms\/public-demo\/index\.html/);
  assert.match(workflow, /raw\.githack\.com\/slimexa2-wq\/xiangneng-hrms\/public-demo\/portal\/index\.html/);
  assert.match(workflow, /grep -q "祥能"/);
});
