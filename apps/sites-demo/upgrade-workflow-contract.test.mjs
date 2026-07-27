import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../.github/workflows/public-demo.yml", import.meta.url), "utf8");

test("public demo upgrades the repository baseline through the three verified patches in order", () => {
  const reimbursement = "*小程序报销与岗位职级权限优化-20260727.patch";
  const organization = "*内部组织按业务部门修正版-20260727.patch";
  const maintainability = "*AI模块化维护基础优化-20260727.patch";
  assert.match(workflow, /Upgrade source to latest verified baseline/);
  assert.match(workflow, /upgrade-patches\.tar\.gz/);
  assert.match(workflow, /Normalize patched text line endings/);
  assert.ok(workflow.includes("sed -i 's/\\r$//'"));
  for (const marker of [reimbursement, organization, maintainability]) {
    assert.ok(workflow.includes(marker), `missing patch marker: ${marker}`);
  }
  assert.ok(workflow.indexOf(reimbursement) < workflow.indexOf(organization));
  assert.ok(workflow.indexOf(organization) < workflow.indexOf(maintainability));
});
