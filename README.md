# H5_POS_PRINT

蓝牙标签打印仓库，当前同时包含文档、TypeScript 打印核心、H5 Web Bluetooth 测试台，以及 Cloudflare 部署配置，重点覆盖：

- 模板与机型解耦
- 按机型宽度自动缩放
- CPCL 原生指令与位图混合渲染
- BLE 连接、分包发送与错误处理

## GitHub Actions 部署

完整配置步骤与上线检查项见：[`docs/cloudflare-deployment-checklist.md`](docs/cloudflare-deployment-checklist.md)

仓库使用两个独立 workflow：

- `.github/workflows/deploy-pages.yml`
  - 仅负责 Cloudflare Pages
  - 执行 `npm ci`、`npm run web:build` 后发布 `dist-web/`
  - `main` 作为生产部署
  - `cursor/**` 分支作为 preview 部署
- `.github/workflows/deploy-workers.yml`
  - 仅负责 Cloudflare Workers
  - 执行 `npm ci`、`npm run web:build` 后运行 `wrangler deploy`
  - `main` 使用 `wrangler.toml` 中的默认 Worker 名称
  - `cursor/**` 分支自动派生隔离的 Worker 名称，避免覆盖生产 Worker

共用 GitHub Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

可选 GitHub Variables：

- `CLOUDFLARE_PAGES_PROJECT_NAME`
- `CLOUDFLARE_WORKERS_WORKING_DIRECTORY`
- `CLOUDFLARE_WORKERS_DEPLOY_COMMAND`
- `CLOUDFLARE_WORKERS_BASE_NAME`

说明：

- 当前仓库已经包含 `package.json`、`web/`、`worker/`、`wrangler.toml`，两份 workflow 可直接构建并部署
- 如果没有配置 `CLOUDFLARE_PAGES_PROJECT_NAME`，Pages 默认项目名为 `h5-pos-print`
- 如 Worker 工程未来迁移到子目录，可通过 `CLOUDFLARE_WORKERS_WORKING_DIRECTORY` 调整工作目录
- 如需修改 preview Worker 的名称前缀，可设置 `CLOUDFLARE_WORKERS_BASE_NAME`

## 文档索引

### 部署与联调

- [`docs/cloudflare-deployment-checklist.md`](docs/cloudflare-deployment-checklist.md)
  - Cloudflare / GitHub Actions 的落地配置清单
  - 适合第一次把 Pages + Workers 自动部署真正跑通
- [`docs/h5-real-device-testing.md`](docs/h5-real-device-testing.md)
  - Android 真机 Web Bluetooth 测试说明
  - 适合部署完成后做公网 HTTPS 联调

### 方案规格

- [`docs/printing-spec.md`](docs/printing-spec.md)
  - 定义产品边界、模板能力、机型配置要求与打印规则
  - 适合作为需求评审、产品对齐和实现基线

### 实现指南

- [`docs/printing-implementation-guide.md`](docs/printing-implementation-guide.md)
  - 补充运行时数据结构、编译流程、IR、BLE 分包和错误码建议
  - 适合作为前端、小程序端和驱动层的落地参考

## 当前范围

当前仓库已经包含可继续演进的实现骨架：

- `src/`：打印核心与协议映射
- `web/`：H5 Web Bluetooth 测试台
- `worker/`：Cloudflare Worker 入口
- `docs/`：方案规格、实现指南、真机测试说明

建议后续优先推进：

1. 固化 `printerProfile` 数据结构与机型清单
2. 补充核心库测试与样例输入输出
3. 完善真机兼容性验证与认证机型数据
4. 按业务需要补齐小程序端接入
