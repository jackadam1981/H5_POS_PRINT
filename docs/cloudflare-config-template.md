# Cloudflare / GitHub Actions 配置模板

本文提供一份可直接照着填写的最终配置模板，适合在你已经决定：

- 使用 Cloudflare Workers + Pages
- 使用 GitHub Actions 自动部署
- `main` 作为生产分支
- `cursor/**` 作为预览分支

时直接落地。

> 更完整的上下文和排查说明见：[`docs/cloudflare-deployment-checklist.md`](./cloudflare-deployment-checklist.md)

## 1. 先确定这些固定值

按当前仓库默认约定，建议使用以下值：

| 项目 | 建议值 | 说明 |
| --- | --- | --- |
| Pages 项目名 | `h5-pos-print` | 与 README / workflow 默认值一致 |
| Workers 正式名称 | `h5-pos-print` | 对应 `wrangler.toml` 的 `name` |
| 生产分支 | `main` | workflow 已按此处理 |
| 预览分支 | `cursor/**` | workflow 已按此处理 |

## 2. Cloudflare 侧记录模板

先在 Cloudflare 控制台把这些值准备好：

```text
Cloudflare Account ID = <你的 Cloudflare Account ID>
Workers 正式名称 = h5-pos-print
Pages 项目名 = h5-pos-print
Workers 子域 = <your-subdomain>.workers.dev
```

建议你自己再补一份内部记录：

```text
Cloudflare Account Name = <账号名称>
Cloudflare Account ID = <账号 ID>
Workers Subdomain = <your-subdomain>.workers.dev
Pages Project Name = h5-pos-print
Worker Production Name = h5-pos-print
```

## 3. GitHub Repository Secrets 模板

进入：

- GitHub 仓库
- `Settings`
- `Secrets and variables`
- `Actions`
- `Repository secrets`

新增以下两个 Secret：

```text
CLOUDFLARE_ACCOUNT_ID=<你的 Cloudflare Account ID>
CLOUDFLARE_API_TOKEN=<你的 Cloudflare API Token>
```

要求：

- `CLOUDFLARE_ACCOUNT_ID` 必须属于真正部署目标账号
- `CLOUDFLARE_API_TOKEN` 必须可同时用于：
  - Workers 部署
  - Pages 部署

如果不确定 token 权限，最稳妥做法是：

- 从 Cloudflare Workers 的编辑模板起步
- 确认同时具备 Pages 所需的编辑权限
- 并把资源范围限制在目标账号

## 4. GitHub Repository Variables 模板

进入：

- GitHub 仓库
- `Settings`
- `Secrets and variables`
- `Actions`
- `Repository variables`

### 4.1 最小可运行模板

如果你想最少配置就先跑通，建议只填这一项：

```text
CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print
```

### 4.2 完整推荐模板

如果你想把默认值也显式落盘，可以填成这样：

```text
CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print
CLOUDFLARE_WORKERS_WORKING_DIRECTORY=.
CLOUDFLARE_WORKERS_BASE_NAME=h5-pos-print
```

### 4.3 仅在特殊场景下再配置

下面这项不是默认必需，只有你想覆盖 workflow 自动生成命令时再填：

```text
CLOUDFLARE_WORKERS_DEPLOY_COMMAND=<自定义 wrangler deploy 命令>
```

例如：

```text
CLOUDFLARE_WORKERS_DEPLOY_COMMAND=deploy --config wrangler.toml --env production
```

> 一旦你设置了 `CLOUDFLARE_WORKERS_DEPLOY_COMMAND`，workflow 会优先使用你提供的命令。

## 5. 当前仓库的最终推荐配置

如果你只是想让当前仓库稳定工作，直接用下面这套：

### GitHub Secrets

```text
CLOUDFLARE_ACCOUNT_ID=<真实账号 ID>
CLOUDFLARE_API_TOKEN=<真实 token>
```

### GitHub Variables

```text
CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print
```

### Cloudflare 侧

```text
Pages Project Name = h5-pos-print
Worker Production Name = h5-pos-print
```

## 6. 部署后你应看到什么

### 推送到 `main`

- Pages：生产部署
- Worker：部署到 `h5-pos-print`

### 推送到 `cursor/**`

- Pages：preview 部署
- Worker：部署到派生名称，例如：
  - `h5-pos-print-cursor-xxx`

说明：

- preview 分支名会被归一化
- 带 `/`、空格或特殊字符的 Git 分支名不会原样传给 Cloudflare

## 7. 如果还没配好 secrets，会看到什么

当前 workflow 已做保护：

- 缺 `CLOUDFLARE_ACCOUNT_ID`
- 或缺 `CLOUDFLARE_API_TOKEN`

时不会直接报 deploy 命令错误，而会：

- 在日志中打印 warning
- 在 Step Summary 里显示缺失项
- 跳过部署步骤

## 8. 一次性核对清单

复制下面这段，逐项自检：

```text
[ ] Cloudflare 已创建 Pages 项目 h5-pos-print
[ ] Cloudflare 已可用 workers.dev 子域
[ ] GitHub Secret: CLOUDFLARE_ACCOUNT_ID 已填写
[ ] GitHub Secret: CLOUDFLARE_API_TOKEN 已填写
[ ] GitHub Variable: CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print
[ ] main 作为生产分支
[ ] cursor/** 作为预览分支
```
