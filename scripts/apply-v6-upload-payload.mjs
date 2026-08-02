import { createHash } from "node:crypto";
import { createWriteStream, existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "slimexa2-wq/xiangneng-hrms";
const ISSUE_NUMBER = 5;
const EXPECTED_CHUNKS = 9;
const EXPECTED_SHA256 = "f823a0650a3656bf7a7e07971385a78fb04ede37e60ec45c6115d5552d8ae032";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archivePath = resolve(root, ".v6-upload-payload.tar.xz");

function fail(message) {
  console.error(`[V6 upload] ${message}`);
  process.exit(1);
}

async function loadPayloadChunks() {
  const url = `https://api.github.com/repos/${REPOSITORY}/issues/${ISSUE_NUMBER}/comments?per_page=100`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "xiangneng-hrms-v6-restorer"
    }
  });
  if (!response.ok) fail(`读取 GitHub 载荷失败：${response.status} ${await response.text()}`);
  const comments = await response.json();
  return comments
    .map((item) => String(item.body || "").trim())
    .filter((body) => body.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(body));
}

function extractArchive() {
  if (process.platform === "win32") {
    const result = spawnSync("tar", ["-xJf", archivePath, "-C", root], { stdio: "inherit" });
    if (result.status !== 0) fail("Windows tar 解压失败，请确认 Windows 自带 tar 可用");
    return;
  }
  const result = spawnSync("tar", ["-xJf", archivePath, "-C", root], { stdio: "inherit" });
  if (result.status !== 0) fail("tar 解压失败，请安装支持 xz 的 tar");
}

function removeDeletedFiles() {
  const deletedList = resolve(root, "V6_DELETED_FILES.txt");
  if (!existsSync(deletedList)) return;
  for (const entry of readFileSync(deletedList, "utf8").split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const target = resolve(root, entry);
    if (!target.startsWith(`${root}/`) && !target.startsWith(`${root}\\`)) fail(`拒绝删除工作区外路径：${entry}`);
    rmSync(target, { recursive: true, force: true });
  }
  unlinkSync(deletedList);
}

const chunks = await loadPayloadChunks();
if (chunks.length !== EXPECTED_CHUNKS) fail(`载荷段数错误：期望 ${EXPECTED_CHUNKS}，实际 ${chunks.length}`);
const archive = Buffer.from(chunks.join(""), "base64");
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== EXPECTED_SHA256) fail(`SHA-256 校验失败：${digest}`);
createWriteStream(archivePath).end(archive);
await new Promise((resolvePromise, reject) => {
  const stream = createWriteStream(archivePath);
  stream.on("error", reject);
  stream.on("finish", resolvePromise);
  stream.end(archive);
});
extractArchive();
removeDeletedFiles();
unlinkSync(archivePath);
console.log(`[V6 upload] 已恢复完整 V6 工作区，SHA-256：${digest}`);
