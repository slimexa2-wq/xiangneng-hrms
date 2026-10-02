# 好工到蓝领招聘模块集成测试报告

日期：2026-10-02。项目：`xiangneng-hrms`。范围：四川蓝领招聘、HRMS 报名记录与推荐奖励闭环。

## 实测结论

在专用本地 PostgreSQL 17 数据库中，已有 6 个迁移与新增 `20261002090000_bluecollar_recruitment` 迁移全部成功执行。通过真实 Prisma Client、Fastify `app.inject` 和数据库事务执行的 **12 个集成场景全部通过**；最终后端权限收紧后的完整运行耗时 4.69 秒。

另在临时隔离数据库执行了**旧 HRMS 升级检查**：先应用原有 6 个 SQL 迁移并注入历史待达标、已付款推荐记录，再执行新增迁移，验证历史推荐、奖励金额、状态、付款时间、备注与原始政策快照完整保留，没有补造历史付款凭证。旧库重复推荐会使唯一索引明确失败，不会删除历史记录。检查通过后，该临时升级数据库自动清理。

数据库、账号、候选人及付款凭证均为独立测试数据；没有连接实际业务服务器或实际业务数据库，没有执行真实付款或发送外部消息。

| 场景 | 实测结果 |
| --- | --- |
| 数据库健康、真实登录、岗位发布、城市/分类/福利字段、项目权限 | 通过 |
| 分享 token 绑定推荐人，公开报名不返回身份证与手机号 | 通过 |
| 重复报名保留原档案，报名、奖励各一份，原始政策快照不随政策变更 | 通过 |
| 暂停、过期岗位与跨岗位分享 token 拒绝报名 | 通过 |
| 换推荐人争抢被拒绝；公开请求伪造推荐人不生效 | 通过 |
| 未登录、员工及分公司范围外账号不能审核；未满期、提前离职不能达标 | 通过 |
| 约定期限已经完成后离职，按原始规则仍可人工核实达标 | 通过 |
| 门户“我的报名”仅返回已绑定本人，不混入推荐他人的报名 | 通过 |
| 报名、面试、入职、资源核实、财务审批、出纳凭证发放完整链路 | 通过 |
| 真实并发付款仅一次成功、一次冲突，付款与审计各保留唯一有效记录 | 通过 |
| 真实并发推荐争抢，仅一名推荐人、一条报名、一份奖励 | 通过 |
| 自荐身份不能生成推荐报名或奖励 | 通过 |
| 重复付款流水号导致第二笔奖励状态、付款记录及审计完整回滚 | 通过 |

其中部分断言合并在同一测试用例内，所以表中的验证点多于 12 个用例。

奖励操作权限已实际验证：`reward:read` 只提供列表与详情入口；资源专员使用 `reward:review` 核实 `ACHIEVED`，财务使用 `reward:approve` 审核 `APPROVED`，出纳使用 `reward:pay` 登记 `PAID`；财务与出纳不会因可查看奖励而获得资源核实权限。付款需要流水号、凭证和付款时间。已发放奖励不可回退；重复发放返回冲突。

只读迁移预检命令 `pnpm --filter @xiangneng/api db:recruitment-preflight` 在专用 QA 库实际执行成功，退出码 0，结果 `readOnly=true`、`ready=true`、重复推荐数 0、缺少留存天数快照的待处理奖励数 0。预检实现只执行 SELECT，不修改记录。

## 首次微信求职者报名补充验证

新增独立 `candidate-onboarding.integration.test.ts`，没有更改原有招聘奖励测试文件。针对首次微信账号、本人档案绑定及安全衔接已有 HRMS 账号的修复，**11 个补充真实数据库场景全部通过**，最终运行耗时 8.18 秒。

微信 `jscode2session` 上游使用隔离的 `fetch` stub：只接受预设的合成 code 与 OpenID，拒绝任何其他网络请求。因此以下结论验证服务端接收微信验证结果后的账号与数据库行为，不代表已经验证实际微信 AppID 或真机登录。账号、本人档案、报名、推荐关系、奖励快照、数据库锁和事务均使用真实 PostgreSQL。

| 补充场景 | 实测结果 |
| --- | --- |
| 上游凭证校验失败或返回无效 JSON 时，拒绝登录且不创建账号 | 通过 |
| 同一陌生 OpenID 并发登录只创建一个 `JOB_SEEKER`，仅授予岗位读取及报名权限 | 通过 |
| 已停用微信账号返回 401，不重新激活、不改写原角色、不产生第二个账号 | 通过 |
| 无人员或权限范围的空临时微信账号安全衔接已登录 HRMS 员工，原临时 JWT 失效，双方审计落库，员工角色不变 | 通过 |
| 已有本人档案的微信账号不能转移，返回 409，双方绑定、角色、token 版本和报名完整保留 | 通过 |
| 首次 SELF 报名同事务创建全新本人档案、绑定账号并创建报名；当前 token 即可查询本人记录 | 通过 |
| 首次携带推荐 token 的报名同事务绑定候选人、真实推荐人及原始奖励规则快照 | 通过 |
| 陌生账号提交已有身份证返回 403，账号不绑旧档案，原始档案与报名不被覆盖 | 通过 |
| 同账号并发提交不同身份证，仅成功一份；失败事务不留下孤立人员或报名 | 通过 |
| 不同账号并发提交同一全新身份证，仅一个账号成功绑定，另一个保持未绑定 | 通过 |
| 未绑定本人档案的账号读不到他人报名、推荐奖励及后台管理列表 | 通过 |

微信上游 `session_key` 不出现在登录响应与存储的账号字段中；新账号没有分公司、供应商、项目绑定或管理角色授权。

临时账号安全衔接保留旧账号记录，清空其微信关联、停用并增加 token 版本，不删除历史记录。微信身份已关联本人档案或权限范围时，必须人工核实，不自动夺取绑定。

## 可复现方式

测试位于 `tests/bluecollar/recruitment.integration.test.ts`，使用独立 `tests/bluecollar/vitest.config.ts`。测试明确拒绝普通应用 `DATABASE_URL`，仅接受 `BLUECOLLAR_QA_DATABASE_URL`，并强制检查地址为 `127.0.0.1:55432/xiangneng_bluecollar_qa`，以降低误用正式数据库的风险。

首次微信账号流程使用独立 `candidate-onboarding.vitest.config.ts`，沿用相同数据库地址检查，可以单独运行而不重复招聘奖励测试。

从仓库根目录执行。先创建专用数据库容器；如果该容器已经存在并正在运行，直接执行迁移与测试即可。

```sh
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS \
  -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  docker --host=unix:///var/run/docker.sock run --detach \
  --name xiangneng-bluecollar-qa-postgres \
  --publish 127.0.0.1:55432:5432 \
  --env POSTGRES_DB=xiangneng_bluecollar_qa \
  --env POSTGRES_USER=qa \
  --env POSTGRES_PASSWORD=bluecollar-local-test-only \
  postgres:17-alpine

DATABASE_URL='postgresql://qa:bluecollar-local-test-only@127.0.0.1:55432/xiangneng_bluecollar_qa?schema=public' \
  pnpm --filter @xiangneng/api db:migrate

pnpm --filter @xiangneng/api db:generate

BLUECOLLAR_QA_DATABASE_URL='postgresql://qa:bluecollar-local-test-only@127.0.0.1:55432/xiangneng_bluecollar_qa?schema=public' \
  pnpm --filter @xiangneng/api exec vitest run \
  --config ../../tests/bluecollar/vitest.config.ts

BLUECOLLAR_QA_DATABASE_URL='postgresql://qa:bluecollar-local-test-only@127.0.0.1:55432/xiangneng_bluecollar_qa?schema=public' \
  pnpm --filter @xiangneng/api exec vitest run \
  --config ../../tests/bluecollar/candidate-onboarding.vitest.config.ts

bash tests/bluecollar/migration-upgrade-check.sh

DATABASE_URL='postgresql://qa:bluecollar-local-test-only@127.0.0.1:55432/xiangneng_bluecollar_qa?schema=public' \
  pnpm --filter @xiangneng/api db:recruitment-preflight
```

可重复运行测试，每轮使用新的随机测试组织与候选人。测试数据只保留在专用 QA 容器内。验证结束后如需清理，仅移除该专用容器：

```sh
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS \
  -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  docker --host=unix:///var/run/docker.sock rm --force \
  xiangneng-bluecollar-qa-postgres
```

## 验证中修复的问题

真实数据库测试发现报名串行锁最初使用 `$queryRaw` 读取 `pg_advisory_xact_lock` 的 `void` 返回值，Prisma 无法反序列化，导致报名失败。后端改用 `$executeRaw` 后完整链路与并发推荐测试通过。这一问题无法由原先的 Prisma mock 测试发现。

## 集成与发布边界

- 自动资格门槛按报名时的 `retentionDays` 快照及该次报名的入职、离职日期计算；提前离职拒绝达标，满期后离职保留可审核权益。其他文字条件由有权审核人员结合原始政策快照核实并填写说明，不自动解析文字规则。
- 未验证真实微信 AppID 登录、手机号授权、订阅消息、微信二维码、真机体验与平台审核；缺少实际微信配置时不能宣称已经发布微信小程序。
- “已发放”表示有权出纳登记了实际付款记录和凭证。本次测试未连接资金支付接口。
- 正式迁移新增 `referral_records(person_id, job_demand_id)` 唯一索引。真实旧库如存在重复推荐，需要先核对、归并业务记录；迁移不会自动删除历史财务记录。
- 门户 API 故障兜底应由 `VITE_PORTAL_DEMO_FALLBACK=true` 显式开启演示；生产不能依靠本地演示状态证明报名或付款已经成功。

本报告的通过结论仅覆盖上述真实数据库接口集成场景。各应用编译、类型检查、单元测试与界面预览应结合本次分支的总体交付记录查阅。
