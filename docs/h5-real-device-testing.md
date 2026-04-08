# H5 真机网络测试说明（Web Bluetooth）

本说明用于让你把仓库里的 H5 测试台（`web/`）部署到公网（HTTPS），并在 **Android 真机** 上通过浏览器进行 Web Bluetooth 打印测试。

> 结论：**Android Chrome + HTTPS** 可测；**iPhone Safari 不支持 Web Bluetooth**，iOS 端请走小程序/APP。

## 1. 你将测试什么

仓库内的 H5 测试台位于 `web/`，提供：

- 扫描/连接 BLE 设备（Web Bluetooth）
- 枚举 services / characteristics
- 选择可写 characteristic
- 选择协议（CPCL / ESC-POS）
- 分包发送（chunkBytes + intervalMs）

本地启动：

```bash
npm install
npm run web:dev
```

但 **Web Bluetooth 需要安全上下文**，因此真机测试建议走公网 HTTPS 部署。

## 2. 公网部署（推荐路径）

你已经决定使用 Cloudflare（Workers & Pages 入口）并用 GitHub Actions 自动部署。

### 2.1 需要准备的 Cloudflare 配置

- **Cloudflare 账号**
- **Account ID**
- **API Token**（最小权限建议：允许部署 Worker/Pages 项目）

> 说明：具体权限名称会随 Cloudflare 控制台变化。原则是“只给部署所需的最小权限”。

### 2.2 需要在 GitHub Actions / Secrets 配置的变量

在仓库的 GitHub Secrets 中添加：

- **`CLOUDFLARE_ACCOUNT_ID`**
- **`CLOUDFLARE_API_TOKEN`**

并在工作流中使用 worker 名称：

- `main` 分支固定部署为：**`h5-pos-print`**
- 其他分支部署为：`h5-pos-print-<branch>`（避免互相覆盖）

> 如果你使用自定义域名，还需要在 Cloudflare DNS/域名里完成解析与 HTTPS 证书验证（Cloudflare 会自动处理大多数情况）。

### 2.3 仓库内已落盘的部署文件

- `wrangler.toml`：Workers 项目配置（静态资源目录 `dist-web`）
- `worker/worker.ts`：最小 Worker，转发静态资源（并为 Web Bluetooth 测试页添加必要的安全响应头）
- `.github/workflows/deploy-cloudflare.yml`：GitHub Actions 自动部署

部署触发：

- **所有分支 push 都会部署**
- worker 名称策略：
  - `main` → `h5-pos-print`
  - 其他分支 → `h5-pos-print-<sanitized-branch>`

### 2.4 Actions 工作流需要的环境变量/密钥

在 GitHub 仓库的 Secrets 配置：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

可选（如果你希望手动覆盖 worker 名称，而不是按分支规则）：

- `CLOUDFLARE_WORKER_NAME`

## 3. 访问地址与 HTTPS 要求

### 3.1 HTTPS 是必须的

Web Bluetooth 仅在 **HTTPS（安全上下文）** 下可用。

- 本地开发可用 `http://localhost`（浏览器通常视为安全上下文）
- 真机从公网访问必须是 `https://...`

### 3.2 真机访问建议

- 直接访问 Cloudflare 部署后的 URL（Workers/Pages 提供的默认域名或自定义域名）
- 确保手机能正常打开页面并加载 JS（没有被企业网络/代理拦截）

Worker 默认域名形态通常类似：

- `https://h5-pos-print.<your-subdomain>.workers.dev`
- 分支环境类似：`https://h5-pos-print-<branch>.<your-subdomain>.workers.dev`

> 具体域名以 Cloudflare 控制台显示为准。

## 4. Android 真机测试前置条件

### 4.1 浏览器要求

- 推荐：**Chrome（Android）** 或其他 Chromium 内核浏览器（Edge / Samsung Internet）
- 不推荐：Firefox（通常不支持 Web Bluetooth）

### 4.2 系统与权限

- 打开手机系统蓝牙
- 允许浏览器获取蓝牙相关权限
- Android 上“扫描蓝牙设备”常常还需要**定位权限**（不同 ROM 表现不一）

### 4.3 操作约束（Web Bluetooth 规则）

- `requestDevice()` 必须由用户手势触发（点按钮）
- 首次连接建议先只发“短作业”（文本/二维码），确认可写特征值正确后再发大数据

## 5. 打印机侧准备（以 CC4 为例）

你需要确认：

- 打印机开启 BLE 并处于可连接状态
- 电量足够、装纸正确
-（如有）黑标/间隙模式与纸张匹配

并在 H5 测试台里：

1. 点击连接设备
2. 选择正确的 Service
3. 选择可写 Characteristic（write / writeWithoutResponse）
4. 先用 CPCL/ESC-POS 发送小作业验证（文本/二维码）

> 一旦验证通过，就把该机型的 serviceUUID / writeCharUUID 固化到 `printerProfile`（走“认证机型”流程）。

## 6. 常见问题排查

### 6.1 看不到设备

- 确保蓝牙已打开
- 确保打印机在广播/可配对状态
- 给浏览器定位权限（Android 常见）
- 换 Chrome / 关闭省电模式

### 6.2 能连接但写入无反应

- 选错 characteristic（有些是 notify/read 不是 write）
- chunk 太大或 interval 太小导致丢包：先用 `20 bytes + 20ms` 起步
- 改用 `writeValueWithResponse`（更稳但更慢）

### 6.3 打印乱码

- 属于编码/字库问题（GBK/UTF-8）或协议方言差异
- 首次建议只测试英文数字，逐步引入中文

## 7. iOS 说明（重要）

- **iPhone Safari 不支持 Web Bluetooth**，因此 iOS 端的“真机网络测试”请使用：
  - 微信小程序 BLE
  - 或 App 容器

