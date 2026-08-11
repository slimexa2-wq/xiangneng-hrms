#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PART_DIR=".github/deployment"
ARCHIVE="/tmp/xiangneng-upgrade-patches.tar.xz"
PATCH_DIR="/tmp/xiangneng-upgrade-patches"

expected_parts=12
mapfile -t parts < <(find "$PART_DIR" -maxdepth 1 -type f -name 'upgrade-patches.tar.xz.b64.part*' | sort)
if [[ "${#parts[@]}" -ne "$expected_parts" ]]; then
  echo "Expected ${expected_parts} upgrade bundle parts, found ${#parts[@]}" >&2
  printf '%s\n' "${parts[@]}" >&2
  exit 1
fi

for number in $(seq -w 1 "$expected_parts"); do
  expected="$PART_DIR/upgrade-patches.tar.xz.b64.part${number}"
  if [[ ! -s "$expected" ]]; then
    echo "Missing or empty upgrade bundle part: $expected" >&2
    exit 1
  fi
done

cat "${parts[@]}" | tr -d '\r\n' | base64 --decode > "$ARCHIVE"
xz --test "$ARCHIVE"

rm -rf "$PATCH_DIR"
mkdir -p "$PATCH_DIR"
tar -xJf "$ARCHIVE" -C "$PATCH_DIR"

patches=(
  "祥能HRMS-小程序报销与岗位职级权限优化-20260727.patch"
  "祥能HRMS-内部组织按业务部门修正版-20260727.patch"
  "祥能HRMS-AI模块化维护基础优化-20260727.patch"
)

archive_entries="$(tar -tJf "$ARCHIVE" | sed 's#^\./##' | sed '/^$/d' | sort)"
expected_entries="$(printf '%s\n' "${patches[@]}" | sort)"
if [[ "$archive_entries" != "$expected_entries" ]]; then
  echo "Upgrade archive entries do not match the approved patch chain." >&2
  echo "Expected:" >&2
  printf '%s\n' "$expected_entries" >&2
  echo "Actual:" >&2
  printf '%s\n' "$archive_entries" >&2
  exit 1
fi

sha256sum "$ARCHIVE"
for patch_name in "${patches[@]}"; do
  patch_path="$PATCH_DIR/$patch_name"
  if [[ ! -s "$patch_path" ]]; then
    echo "Missing or empty patch: $patch_path" >&2
    exit 1
  fi
  echo "Checking $patch_name"
  git apply --check "$patch_path"
  echo "Applying $patch_name"
  git apply --whitespace=nowarn "$patch_path"
done

test -f AI_PROJECT_MAP.md
test -f config/project-modules.json
test -f docs/business-rules/organization.md
test -f docs/business-rules/reimbursement.md
grep -q '业务部门' docs/business-rules/organization.md
grep -q 'PositionRoleBinding' prisma/schema.prisma
grep -R -q '发起报销' apps/miniapp/src apps/admin/src apps/portal/src
grep -R -q '最终付款凭证' apps/api/src apps/admin/src apps/miniapp/src

node scripts/generate-project-index.mjs
node --test scripts/project-tools/*.test.mjs apps/sites-demo/*.test.mjs
node scripts/check-architecture.mjs
git diff --check

echo "Latest upgrade chain applied and verified."
