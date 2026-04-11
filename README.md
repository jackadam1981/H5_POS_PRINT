# H5_POS_PRINT

蓝牙标签打印仓库，当前同时包含文档、TypeScript 打印核心、H5 Web Bluetooth 测试台，以及 Cloudflare 部署配置，重点覆盖：

- 模板与机型解耦
- 按机型宽度自动缩放
- CPCL 原生指令与位图混合渲染
- BLE 连接、分包发送与错误处理

## GitHub Actions 部署

仓库已拆分为两个独立 workflow：

- `.github/workflows/deploy-pages.yml`
  - 仅负责 Cloudflare Pages 发布
  - 负责 `npm ci` + `npm run web:build`，再部署 `dist-web/`
  - 可配置仓库变量：`CLOUDFLARE_PAGES_PROJECT_NAME`
- `.github/workflows/deploy-workers.yml`
  - 仅负责 Cloudflare Workers 发布
  - 负责 `npm ci` + `npm run web:build`，再执行 `wrangler deploy`
  - 默认读取仓库根目录 `wrangler.toml`
  - 可配置仓库变量：`CLOUDFLARE_WORKERS_WORKING_DIRECTORY`

两个 workflow 共用以下 GitHub Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

说明：

- 当前仓库已经包含 `package.json`、`web/`、`worker/`、`wrangler.toml`，两份 workflow 会直接构建并部署
- 若需要修改 Pages 项目名，设置 `CLOUDFLARE_PAGES_PROJECT_NAME`
- 若 Worker 工程未来迁移到子目录，可设置 `CLOUDFLARE_WORKERS_WORKING_DIRECTORY`

## 文档索引

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
