# 祥能 HRMS 微信小程序

现有 Taro 4 + React + TypeScript 小程序，根据真实登录角色进入内部运营、供应商、求职者或内部员工入口。求职模块使用「好工到」暂定品牌，面向成都、宜宾、绵阳及四川省内工厂普工、仓储物流等岗位；其他业务身份继续使用祥能 HRMS。没有另建独立小程序或另一套人员档案。

## 本次求职流程

- 默认启动 `pages/index/index`。未登录和求职者进入找工作首页；运营、供应商和内部员工仍进入原有角色工作台。保留 `pages/demo/index` 作为既有开发演示页，不作为默认入口，其本地演示数据不用于求职流程。
- 首页只保留找工作标题，搜索在前；城市使用灰色容器白色选项的分段控件，工种使用文字标签和黑色下划线。浅灰背景、白色大圆角卡片、系统黑灰字色，蓝色只用于主操作。
- 岗位卡显示大号黑色工资与小号灰色单位、真实工作地点/班次和少量福利文字，每张卡有完整宽度报名按钮和次要详情入口。提供成都、宜宾、绵阳筛选及工种、文本搜索。全部城市保留其他既有岗位；没有伪造或替换真实项目。
- 城市和工种优先使用新增 `city`、`category`。未补结构化字段的旧岗位，以 `workLocation` 和岗位标题兼容筛选。福利仅使用 `benefits`，不默认承诺包吃住。
- 详情底部固定电话咨询和报名按钮；电话来自真实项目负责人，无电话号码时按钮不可用。未补项目资料保持缺失。
- 从详情进入报名后预选岗位，姓名、手机号、身份证号为必填（沿用原系统身份证查重要求），联系人与备注折叠为选填。一页提交，无需长简历。求职与推荐报名必须主动勾选服务与隐私说明，默认未选；请求携带 `consent: true`，锁定重复点击。
- 我的报名读取本人记录，显示现有面试与入职日期，可返回岗位联系负责人。未登录时明确引导本人身份登录，不显示本地模拟报名结果。

## 推荐与奖励

沿用内部员工推荐权限及真实身份绑定，求职者和游客可阅读奖励说明，但不会得到员工推荐权限。岗位中的有效 `referralOffer` 展示金额、员工类型、入职满期天数、达成与排除条件。服务端返回未发布或不适用政策时，不填示例奖励。

推荐使用 `/referrals/share-token` 生成的路径与签名令牌，并由 `onShareAppMessage` 转发。推荐记录和奖励记录均读取本人 API；奖励满期日期和当前原因读取服务端 `eligibility`，达成条件读取报名时的 `policySnapshot`。状态依次为待达成、已达成、已审核待发放、已发放；只有真实付款记录才展示已发放。

## API 与权限

业务数据继续调用统一 `/api`，只保存现有登录会话，不本地伪造岗位、报名或奖励：

| 场景 | 沿用接口 |
| --- | --- |
| 公开浏览 | `GET /public/job-demands`、`GET /public/job-demands/:id` |
| 首次公开报名 | `POST /public/applications` |
| 登录角色岗位 | `GET /job-demands`、`GET /job-demands/:id` |
| 求职报名和进度 | `POST /applications`、`GET /applications/me` |
| 员工推荐 | `POST /referrals`、`POST /referrals/share-token`、`GET /referrals/me` |
| 员工奖励 | `GET /referral-rewards/me` |

内部运营继续按 `people:read` / `people:write` 查询和更新状态；供应商只访问服务端按 `supplierId` 限定的数据与政策；求职者只看本人报名；员工只看本人推荐、奖励和工资条。原有报人、面试、入职、离职、人员查询、工资条入口均保留。

## 本地验证

```bash
pnpm --filter @xiangneng/miniapp typecheck
pnpm --filter @xiangneng/miniapp test
pnpm --filter @xiangneng/miniapp build:weapp
```

构建产物在 `apps/miniapp/dist`。微信开发者工具打开 `apps/miniapp/project.config.json`，调试本机后端可在开发者工具关闭合法域名检查；该设置仅用于本地调试。

## 正式发布配置

- `TARO_APP_API_BASE_URL`：统一 API 基址，开发默认 `http://127.0.0.1:3310/api`；正式环境应填写合法 HTTPS 域名并在微信公众平台配置。
- `TARO_APP_WECHAT_CONFIGURED`：仅在真实 AppID、服务端 AppSecret、合法域名均完成后设为 `true`。
- `TARO_APP_NOTIFICATION_CONFIGURED`：仅在通知身份绑定和模板 ID 完成后设为 `true`。

当前 `project.config.json` 的 `touristappid` 仅支持构建和开发预览，不能代替真实 AppID 发布。`Taro.login` 的临时 code 交由 `/wechat/auth/login` 处理，小程序不保存 AppSecret。未配置微信时不会伪造登录、身份绑定、二维码或通知成功。

`pages/policy/index` 提供与现有报名流程一致的服务和隐私说明。运营方正式发布前需要核实并补充完整的服务主体、联系方式、人力资源服务资质、个人信息保存与删除规则，并在微信公众平台配置隐私保护指引。当前身份绑定和微信支付/通知是否可用，仍取决于真实生产配置与既有后端，不代表已经完成微信平台审核。
