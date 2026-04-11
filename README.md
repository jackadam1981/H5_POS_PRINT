# H5_POS_PRINT

一个面向蓝牙标签打印的仓库，当前包含：

- `src/`：TypeScript 打印核心与协议映射
- `web/`：H5 Web Bluetooth 测试台
- `worker/`：Cloudflare Worker 入口
- `docs/`：方案、实现、部署与联调文档

## 快速开始

### 1. 安装依赖

```bash
npm ci
```

### 2. 本地启动 H5 测试台

```bash
npm run web:dev
```

默认启动后可在浏览器打开本地开发地址，用于调试 Web Bluetooth 页面。

### 3. 类型检查

```bash
npm run typecheck
```

### 4. 构建产物

```bash
npm run web:build
```

构建结果输出到 `dist-web/`，会被 Pages 和 Worker 部署流程复用。

## 常用命令

```bash
npm ci
npm run web:dev
npm run typecheck
npm run web:build
```

## Cloudflare 最小部署

仓库已经内置两个 GitHub Actions workflow：

- `.github/workflows/deploy-pages.yml`
- `.github/workflows/deploy-workers.yml`

最少只需要配置这两个 GitHub Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

建议再配置这个 GitHub Variable：

- `CLOUDFLARE_PAGES_PROJECT_NAME=h5-pos-print`

当前默认部署行为：

- `main`：生产部署
- `cursor/**`：预览部署
- 预览环境会把 Git 分支名归一化为 Cloudflare 可接受的 branch / Worker 名称
- 如果缺少 `CLOUDFLARE_API_TOKEN` 或 `CLOUDFLARE_ACCOUNT_ID`，workflow 会跳过 deploy 并在日志中提示缺失项

完整配置步骤见：[`docs/cloudflare-deployment-checklist.md`](docs/cloudflare-deployment-checklist.md)
可直接复制填写的配置模板见：[`docs/cloudflare-config-template.md`](docs/cloudflare-config-template.md)

## 文档导航

### 部署与联调

- [`docs/cloudflare-deployment-checklist.md`](docs/cloudflare-deployment-checklist.md)
  - Cloudflare / GitHub Actions 落地清单
- [`docs/cloudflare-config-template.md`](docs/cloudflare-config-template.md)
  - Cloudflare / GitHub Secrets / Variables 可直接填写的模板
- [`docs/h5-real-device-testing.md`](docs/h5-real-device-testing.md)
  - Android 真机 Web Bluetooth 联调说明

### 方案与实现

- [`docs/printing-spec.md`](docs/printing-spec.md)
  - 打印方案规格
- [`docs/printing-implementation-guide.md`](docs/printing-implementation-guide.md)
  - 运行时数据结构、编译流程与驱动落地说明
