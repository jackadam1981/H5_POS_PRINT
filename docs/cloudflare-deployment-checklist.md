# Cloudflare 部署落地清单

本文是仓库当前 GitHub Actions 与 Cloudflare 部署配置的落地说明，目标是让你按步骤完成一次可工作的配置，而不是只知道“理论上需要哪些东西”。

适用范围：

- Cloudflare Workers
- Cloudflare Pages
- GitHub Actions 自动部署
- 当前仓库已有的两个 workflow：
  - `.github/workflows/deploy-workers.yml`
  - `.github/workflows/deploy-pages.yml`

## 1. 当前仓库的部署约定

先明确本仓库现在的默认行为：

- **Pages workflow**
  - 执行 `npm ci`
  - 执行 `npm run web:build`
  - 发布 `dist-web/`
  - `main` 分支作为生产部署
  - `cursor/**` 分支作为 preview 部署

- **Workers workflow**
  - 执行 `npm ci`
  - 执行 `npm run web:build`
  - 执行 `wrangler deploy`
  - `main` 分支使用 `wrangler.toml` 中的正式 Worker 名称
  - `cursor/**` 分支自动派生隔离的 preview Worker 名称

当前 `wrangler.toml` 默认值：

```toml
name = "h5-pos-print"
main = "worker/index.ts"
compatibility_date = "2026-04-08"

[assets]
directory = "./dist-web"
```

也就是说：

- **Workers 生产名称**默认是 `h5-pos-print`
- **Pages 项目名**若不单独配置，也建议使用 `h5-pos-print`

## 2. 部署前准备

在开始配置前，请先确认：

- 你有目标 Cloudflare 账号的管理权限
- 你有 GitHub 仓库的 Settings / Actions Secrets / Variables 配置权限
- 你准备把 `main` 作为生产分支
- 你接受 `cursor/**` 分支作为预览环境分支

## 3. Cloudflare 侧清单

### 3.1 获取 Account ID

在 Cloudflare 控制台找到目标账号的 **Account ID**。

后面会写入 GitHub Secret：

- `CLOUDFLARE_ACCOUNT_ID`

### 3.2 创建 API Token

当前仓库两个 workflow 共用同一个 Secret：

- `CLOUDFLARE_API_TOKEN`

因此最简单的做法是创建**一个**足够覆盖 Workers 与 Pages 发布的 token，并将资源范围限制到目标账号。

建议原则：

- 只授权目标 Cloudflare 账号
- 只给部署需要的最小权限
- 不要使用 Global API Key

参考 Cloudflare 文档：

- Workers 侧：可从 **Edit Cloudflare Workers** 模板开始
- Pages 侧：至少需要 **Account / Cloudflare Pages / Edit**

如果你使用一个统一 token，建议至少确保它具备：

- Workers 部署所需编辑权限
- Pages 部署所需编辑权限

如果未来需要更严格隔离，可以把 workflow 再拆成：

- `CLOUDFLARE_WORKERS_API_TOKEN`
- `CLOUDFLARE_PAGES_API_TOKEN`

但**当前仓库还没有这么拆**，所以现阶段请先使用一个统一的 `CLOUDFLARE_API_TOKEN`。

### 3.3 开通 Workers 开发域名

如果你的账号还没有启用 `workers.dev` 子域，建议先在 Cloudflare 控制台完成一次初始化。

否则第一次在 CI 中执行 `wrangler deploy` 时，可能会因为缺少可用的 workers.dev 子域而失败。

目标效果：

- 生产 Worker 可访问：`https://h5-pos-print.<your-subdomain>.workers.dev`
- 预览 Worker 可访问：`https://h5-pos-print-<preview-name>.<your-subdomain>.workers.dev`

### 3.4 创建 Pages 项目

在 Cloudflare Pages 中先创建一个项目。

建议值：

- **项目名**：`h5-pos-print`
- **生产分支**：`main`

注意：

- 当前 GitHub Actions 使用的是 `wrangler pages deploy`
- 也就是说它依赖**Pages 项目已存在**
- 如果项目名不同，需要在 GitHub Variables 中配置 `CLOUDFLARE_PAGES_PROJECT_NAME`

### 3.5 可选：自定义域名

如果后续需要正式业务域名，可在 Cloudflare 中分别给：

- Workers
- Pages

配置自定义域名或路由。

这一步不是当前仓库 workflow 的前置条件，默认可以先用：

- `workers.dev`
- `pages.dev`

把自动部署打通后再接正式域名。

## 4. GitHub 侧清单

### 4.1 必填 Secrets

进入：

- GitHub 仓库
- `Settings`
- `Secrets and variables`
- `Actions`

新增 **Repository secrets**：

| 名称 | 必填 | 用途 |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 是 | Cloudflare 账号 ID |
| `CLOUDFLARE_API_TOKEN` | 是 | 同时用于 Workers 与 Pages 发布 |

说明：

- 当前 workflow 没有声明 `environment:`
- 所以最直接的配置方式是 **Repository secrets**
- 如果你想改成 Environment secrets，需要同步改 workflow

### 4.2 可选 Variables

同样进入：

- GitHub 仓库
- `Settings`
- `Secrets and variables`
- `Actions`

新增 **Repository variables**：

| 名称 | 必填 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | 否 | `h5-pos-print` | Pages 项目名 |
| `CLOUDFLARE_WORKERS_WORKING_DIRECTORY` | 否 | `.` | Workers 工程目录 |
| `CLOUDFLARE_WORKERS_BASE_NAME` | 否 | `h5-pos-print` | 预览 Worker 名称前缀 |
| `CLOUDFLARE_WORKERS_DEPLOY_COMMAND` | 否 | 自动生成 | 自定义 Workers deploy 命令 |

当前仓库推荐最小配置：

- 可只配置：
  - `CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print`
- 其余保持默认

## 5. 首次落地推荐顺序

建议按下面顺序执行，排查最省事：

### 第一步：Cloudflare 侧准备完成

确认：

- 已拿到 `CLOUDFLARE_ACCOUNT_ID`
- 已创建 `CLOUDFLARE_API_TOKEN`
- 已开通 workers.dev 子域
- 已创建 Pages 项目 `h5-pos-print`

### 第二步：GitHub Secrets / Variables 配好

至少要有：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

建议同时补上：

- `CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print`

### 第三步：用 preview 分支试跑

推荐先不要直接测 `main`，而是先从 `cursor/**` 分支验证。

原因：

- Pages 会走 preview 部署
- Workers 会走隔离的 preview 名称
- 不会污染正式环境

你当前就已经在使用 `cursor/**` 风格分支，适合先验证 workflow。

### 第四步：观察 GitHub Actions 日志

重点看：

- `npm ci` 是否成功
- `npm run web:build` 是否成功
- Pages workflow 打印出的：
  - project
  - deploy dir
  - deploy branch
- Workers workflow 打印出的：
  - preview Worker 名称或生产 Worker 提示

### 第五步：验证 Cloudflare 结果

Pages：

- 确认 Cloudflare Pages 控制台出现新 deployment
- 预览分支应看到对应 preview 部署

Workers：

- 确认 Cloudflare Workers 中出现：
  - `h5-pos-print`（生产）
  - 或 `h5-pos-print-<preview>`（预览）

## 6. 推荐的最小配置模板

如果你想要“最少手工配置就能跑”，建议按下面设置：

### Cloudflare

- Pages 项目名：`h5-pos-print`
- Workers 正式名称：`h5-pos-print`

### GitHub Secrets

```text
CLOUDFLARE_ACCOUNT_ID=<你的 Cloudflare Account ID>
CLOUDFLARE_API_TOKEN=<一个同时可部署 Workers 和 Pages 的 token>
```

### GitHub Variables

```text
CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print
```

## 7. 上线后的预期行为

### 推送到 `main`

- Pages：生产部署
- Workers：发布到 `wrangler.toml` 中的正式 Worker

### 推送到 `cursor/**`

- Pages：preview 部署
- Workers：自动生成 preview Worker 名称，不覆盖生产

## 8. 常见问题排查

### 8.1 Pages 报项目不存在

原因通常是：

- 还没在 Cloudflare 创建 Pages 项目
- 项目名与 `CLOUDFLARE_PAGES_PROJECT_NAME` 不一致

先检查：

- Cloudflare Pages 项目是否已创建
- GitHub Variables 中的项目名是否正确

### 8.2 Workers 报认证失败

优先检查：

- `CLOUDFLARE_ACCOUNT_ID` 是否正确
- `CLOUDFLARE_API_TOKEN` 是否过期或权限不够
- token 是否只限制到了错误的账号

### 8.3 Workers 首次部署失败，提示域名或子域问题

通常表示：

- workers.dev 子域还没有准备好

先在 Cloudflare 控制台完成 Workers 初始化，再重跑 workflow。

### 8.4 Preview Worker 名称不符合预期

当前 workflow 会自动：

- 把分支名转小写
- 非字母数字字符转为 `-`
- 做长度裁剪

如果你想统一前缀，可配置：

- `CLOUDFLARE_WORKERS_BASE_NAME`

### 8.5 自定义 deploy 命令后行为变了

如果你设置了：

- `CLOUDFLARE_WORKERS_DEPLOY_COMMAND`

那么 workflow 会优先使用这个命令，而不是自动生成的 deploy 命令。

这适合高级场景，但也意味着你需要自己保证：

- 正式 / 预览环境区分
- `--name` 或 `--env` 参数正确

## 9. 建议的最终检查表

在你准备正式使用前，建议逐项勾掉：

- [ ] Cloudflare 账号与 Account ID 已确认
- [ ] API Token 已创建，且权限覆盖 Workers + Pages
- [ ] workers.dev 子域已可用
- [ ] Pages 项目已创建，生产分支为 `main`
- [ ] GitHub Repository secrets 已配置
- [ ] GitHub Repository variables 已配置
- [ ] `cursor/**` 分支预览部署已成功
- [ ] `main` 分支生产部署已成功
- [ ] Pages 预览与生产 URL 可访问
- [ ] Workers 预览与生产实例命名符合预期

## 10. 与其他文档的关系

- 方案与打印链路：`docs/printing-spec.md`
- 实现与数据结构：`docs/printing-implementation-guide.md`
- H5 真机测试：`docs/h5-real-device-testing.md`

如果你是第一次配置 Cloudflare，建议先看本文；
如果你是第一次做 Android 真机 Web Bluetooth 验证，再继续看 `docs/h5-real-device-testing.md`。
