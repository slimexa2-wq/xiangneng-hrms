# 祥能 HRMS V6 GitHub 完整源码备份

本分支用于保存 **祥能 HRMS 小程序完善与全端联动 V6.0**。

由于 GitHub App 当前不会触发仓库的临时上传工作流，完整 V6 增量以九段 Base64 载荷保存在仓库 Issue #5 中，并通过本分支脚本进行 SHA-256 校验和自动还原。载荷、还原脚本和原项目基线都位于 GitHub，不依赖聊天附件或本地临时下载链接。

## 恢复完整 V6 工作区

```bash
git clone --branch codex/miniapp-complete-v6 https://github.com/slimexa2-wq/xiangneng-hrms.git
cd xiangneng-hrms
node scripts/apply-v6-upload-payload.mjs
```

Windows PowerShell 同样执行：

```powershell
git clone --branch codex/miniapp-complete-v6 https://github.com/slimexa2-wq/xiangneng-hrms.git
Set-Location .\xiangneng-hrms
node .\scripts\apply-v6-upload-payload.mjs
```

脚本会：

1. 从 GitHub Issue #5 读取九段源码载荷；
2. 合并并验证 SHA-256；
3. 解压覆盖到当前工作区；
4. 删除 V6 中已经移除的文件；
5. 删除临时压缩包。

## 校验信息

- 载荷段数：9
- 压缩格式：`tar.xz`
- SHA-256：`f823a0650a3656bf7a7e07971385a78fb04ede37e60ec45c6115d5552d8ae032`
- 本地 V6 最终提交：`e88297f`
- 完整 V6 交付包 SHA-256：`ae26d55911e0d73cf1946acf0ba9fd511ece08dfca22f355816ed4450526f71e`

## 已排除内容

GitHub 备份不包含：

- `.env` 与真实环境变量；
- 数据库备份和 Docker 数据卷；
- 密钥、Token、短信及云服务凭证；
- `node_modules`；
- 构建缓存和运行时日志。

恢复后应重新执行 `pnpm install --frozen-lockfile`、`pnpm db:generate` 和项目验证命令。
