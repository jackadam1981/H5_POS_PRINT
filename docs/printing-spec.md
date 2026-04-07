# 蓝牙标签打印（CPCL）方案规格（定稿）

## 目标与范围

本规格用于实现「公众用户」场景下的标签打印能力，采用**双通道**：

- **iOS**：微信小程序直连 BLE 打印机（主通道）
- **Android**：微信内走小程序；微信外可选 H5（Web Bluetooth）作为补充入口

首批仅支持 **CPCL** 指令集，并采用**支持机型清单（认证机型）**模式逐步扩展。

## 核心设计原则

- **模板与机型解耦**：模板只描述排版，不绑定具体机型能力。
- **打印任务与机型绑定**：每次打印必须绑定 `printerProfile`（机型配置）。
- **默认按宽缩放（fitWidth）**：模板画布宽可到 110mm，但打印时按机型可打印宽度自动等比缩放。
- **混合渲染**：能用 CPCL 原生能力就用（文本/码），复杂效果走位图（图片/任意字体/任意角度旋转）。

## 术语

- **模板（Template）**：用户在编辑器内制作的标签排版（单位 mm），与机型无关，可复用。
- **机型配置（Printer Profile）**：描述某一认证机型的能力、参数与 BLE 通道信息（如 CC4）。
- **打印任务（Print Job）**：一次打印请求，必须引用一个模板与一个机型配置（或已绑定设备）。
- **IR（中间表示）**：模板编译后的中间绘制指令集合（可选实现），用于将模板统一映射到 CPCL/位图输出。

## 模板与编辑器规范（单位：mm）

### 画布（Canvas）

- **单位**：mm
- **坐标系**：左上角为 (0,0)
- **画布宽度上限**：`canvasWidthMm <= 110`
- **画布高度**：可自定义（建议产品侧额外加“性能保护上限/分页”，不在本定稿强制范围内）

### 元素（Elements）

首版必须支持：

- 文本（Text）
- 二维码（QRCode）
- 一维码（Barcode，可按业务选择 CODE128 等）
- 图片（Image：Logo/背景/照片统一为图片元素）

编辑能力：

- **拖拽**：所有元素可拖拽移动
- **对齐**：左/中/右、顶/中/底、等间距分布（编辑器能力）
- **旋转**：元素支持旋转角度（度数）。打印端实现允许混合：0/90/180/270 可走原生，其余走位图。
- **多字体**：
  - 推荐：首版提供“内置字体映射”（走 CPCL 文本命令）
  - 任意字体（TTF/花体等）必须走位图层

### 图片元素（Image）约束

图片元素用于：

- 小 Logo（一小块）
- 可拖拽背景图（可做成铺满照片/底板）

**尺寸比例限制（定稿）**：

- 图片元素最大比例为 **9:16（宽:高，竖版）**
- 对任意图片元素，按其当前宽度计算允许的最大高度：

\[
maxImageHeightMm = imageWidthMm \times \frac{16}{9}
\]

当图片元素高度超过上限时：

- 默认行为：编辑器端等比缩放到上限（或提示并提供“一键适配”）

## 机型配置（Printer Profile）规范

每个认证机型必须有一个 `printerProfile`。首批以芝柯 **CC4** 为主要目标机型（该机型公开支持 CPCL/ESC，并支持微信小程序打印）。

### 必备字段（建议）

- **识别与能力**
  - `manufacturer` / `model`（如 `ZICOX` / `CC4`）
  - `protocol = "CPCL"`
  - `printableWidthMm`（CC4 = 104）
  - `supportsNativeQRCode`（建议 true）
  - `supportsNativeBarcode`（按业务）
  - `fontMap`（模板字体/字号到 CPCL 内置字库的映射规则）

- **分辨率与标定**
  - `dpi` 或 `mmToDotScale`
  - 允许未知：通过“认证/校准流程”写入

- **BLE 通道（小程序/Android H5 共用概念，不同实现）**
  - `ble.serviceUUID`
  - `ble.writeCharacteristicUUID`
  - `ble.notifyCharacteristicUUID`（可选）
  - `ble.writeMode`（withResponse/withoutResponse）
  - `ble.packetIntervalMs`（节流）
  - `ble.maxChunkBytes`（按 MTU 计算/或固定策略）
  - `ble.retry`（重试次数、退避）

### DPI/比例校准（定稿）

由于 DPI 可能不明确，必须提供“认证/校准”机制，将 mm→dot 的比例写入机型参数。

建议做法：

- 提供一个**标尺校准页**（内部/高级入口）
- 打印 100mm 标尺或网格
- 人工测量实际长度，计算校正系数
- 将 `mmToDotScale` 或等效 `dpi` 写入 `printerProfile`

## 打印阶段规则（模板宽度与机型宽度绑定）

### 打印任务必须绑定机型配置

每次打印必须选择或已绑定：

- `templateId`
- `printerProfileId`（或已绑定设备 → profile）

### 宽度适配（定稿：默认 fitWidth）

设：

- `canvasWidthMm`：模板画布宽
- `printableWidthMm`：机型可打印宽

规则：

- 若 `canvasWidthMm <= printableWidthMm`：按 100% 输出
- 若 `canvasWidthMm > printableWidthMm`：**默认策略 `fitWidth`**
  - 等比缩放所有元素（文本/码/图）到 `printableWidthMm`
  - 预览/打印前提示缩放比例（例如“按 CC4(104mm) 自动缩放到 94.5%”）

可选策略（非默认）：

- `crop`：超出部分裁切（不推荐做默认）
- `block`：阻止打印并提示修改模板或更换机型

## 渲染与输出策略（CPCL + 位图混合）

### 原生命令优先（省流量、清晰）

- 文本：优先用 CPCL 文本输出（结合 CC4 内置 GBK/BIG5/ASCII 字库）
- 二维码/条码：优先用 CPCL 原生命令

### 位图兜底（满足编辑器效果）

以下场景必须栅格化为位图输出：

- 图片元素（Logo/背景/照片）
- 任意字体（非机型内置字体）
- 任意角度旋转（非 0/90/180/270）

位图输出要求：

- 二值化/抖动（可按图片元素模式：Logo/背景/照片调参）
- 分片（切片）发送，避免一次传输过大
- 缓存：同一模板的同一图片资源尽量复用处理结果，避免重复计算与重复传输

## 兼容性与验收建议（首批）

### 认证机型（建议首批 2–3 款）

- 首批只承诺 `printerProfile` 清单内机型可用
- 每新增机型需完成：
  - BLE 连接稳定性
  - 服务/特征值确定
  - 文本/二维码/图片样例通过
  - DPI/比例校准通过

### 失败与降级（必须有）

- 连接失败：权限/蓝牙关闭/不支持 BLE/设备不可见
- 写入失败：分包超时/断连/特征不可写
- 数据过大：提示缩小图片或改用更小背景；必要时提示拆分打印

## 数据结构（建议）与示例

本节提供“能直接开工”的建议字段与示例。首版不强制完全一致，但建议尽量贴近，便于跨端复用（小程序 + Android H5）。

### 模板（Template）字段约束（近似 Schema）

> 目的：把“编辑器能存什么/打印端需要什么”说清楚，避免前后端/多端各自扩展导致不可兼容。

- **通用**
  - `unit`：固定 `"mm"`
  - `canvas.widthMm`：\(0 < widthMm \le 110\)
  - `canvas.heightMm`：\(> 0\)（建议产品层面设置可配置上限，如 300–500mm，并支持分页）
  - `canvas.scalePolicy`：默认 `"fitWidth"`（定稿）
  - `elements[]`：按 `zIndex`（或数组顺序）由低到高叠加

- **元素通用字段**
  - `id`：全局唯一字符串
  - `type`：`"text" | "qrcode" | "barcode" | "image"`
  - `xMm`, `yMm`：可为 0 或正数；建议限制在画布范围内（允许少量溢出以便裁切）
  - `widthMm`, `heightMm`：\(> 0\)
  - `rotationDeg`：\(-180, 180]\) 或 \([0, 360)\)（二者择一即可，内部统一归一化）

- **Text**
  - `text`：支持纯文本或 `{{field}}` 变量
  - `textAlign`：`left | center | right`（对齐通过坐标计算实现，不依赖打印机命令）
  - `font.family`：
    - `"builtin"`：走机型内置字体映射（优先）
    - `"custom"`：必须提供字体资源引用（走位图兜底）
  - `font.sizeMm`：字号以 mm 表示（便于跨 DPI）
  - `font.weight`：可选；仅影响位图渲染或映射到“粗体档位”时生效

- **QRCode**
  - `data`：支持 `{{field}}`
  - `sizeMm`：正数；渲染时换算为 dot 并映射到 CPCL 的模块大小参数
  - `ecc`：`L | M | Q | H`（首版可以只支持 L/M）

- **Barcode**
  - `symbology`：建议首版支持 `CODE128`（可扩展）
  - `data`：支持 `{{field}}`
  - `heightMm`：条码高度
  - `humanReadable`：是否打印可读字符（可选）

- **Image**
  - `mode`：`logo | background | photo`（决定二值化/抖动/锐化策略）
  - `src.kind`：`url | dataUri | r2Key`（建议至少 `url`/`dataUri`）
  - **比例限制（定稿）**：`heightMm <= widthMm * 16/9`（9:16 宽高比）
  - `opacity`：首版建议不支持（热敏打印最终是 1bpp）

### 模板（Template）JSON（示例）

约定：

- 全部使用 mm（可小数），坐标系左上角 (0,0)
- `rotationDeg` 允许任意角度（渲染时按规则选择“原生/位图兜底”）
- 图片元素通过 `mode` 表示用途（logo/background/photo）以选择不同抖动/压缩策略

```json
{
  "id": "tpl_demo_001",
  "name": "CC4-示例模板",
  "unit": "mm",
  "canvas": {
    "widthMm": 110,
    "heightMm": 200,
    "scalePolicy": "fitWidth"
  },
  "elements": [
    {
      "id": "img_bg",
      "type": "image",
      "xMm": 0,
      "yMm": 0,
      "widthMm": 104,
      "heightMm": 185,
      "rotationDeg": 0,
      "mode": "background",
      "src": {
        "kind": "url",
        "value": "https://example.com/assets/bg.png"
      }
    },
    {
      "id": "txt_title",
      "type": "text",
      "xMm": 6,
      "yMm": 8,
      "widthMm": 92,
      "heightMm": 10,
      "rotationDeg": 0,
      "text": "{{name}}",
      "textAlign": "left",
      "font": {
        "family": "builtin",
        "sizeMm": 6,
        "weight": 600
      }
    },
    {
      "id": "qr_1",
      "type": "qrcode",
      "xMm": 70,
      "yMm": 120,
      "sizeMm": 28,
      "rotationDeg": 0,
      "data": "{{qrcode}}",
      "ecc": "M"
    },
    {
      "id": "img_logo",
      "type": "image",
      "xMm": 6,
      "yMm": 24,
      "widthMm": 20,
      "heightMm": 20,
      "rotationDeg": 15,
      "mode": "logo",
      "src": {
        "kind": "dataUri",
        "value": "data:image/png;base64,...."
      }
    }
  ],
  "dataSchema": {
    "name": { "type": "string", "required": true },
    "qrcode": { "type": "string", "required": true }
  }
}
```

### 机型配置（Printer Profile）JSON（示例：CC4）

说明：

- `printableWidthMm`：机型“最大有效打印宽”
- `dpi` 与 `mmToDotScale` 二选一即可（推荐最终落 `mmToDotScale`，更贴近实际标定）
- `cpclDialect` 用于收口 CPCL 方言差异（不同厂商/型号可能命令参数略有区别）

```json
{
  "id": "zicox_cc4",
  "manufacturer": "ZICOX",
  "model": "CC4",
  "protocol": "CPCL",
  "printableWidthMm": 104,
  "supportsNativeQRCode": true,
  "supportsNativeBarcode": true,
  "dpi": null,
  "mmToDotScale": null,
  "fontMap": {
    "builtin": {
      "sizesMm": [3, 4, 6, 8],
      "notes": "优先映射到 CC4 内置 ASCII/GBK 字库档位；不匹配时走位图"
    }
  },
  "imageConstraints": {
    "maxAspect": { "w": 9, "h": 16 }
  },
  "cpclDialect": {
    "textRotationNative": [0, 90, 180, 270],
    "qrNative": true
  },
  "ble": {
    "serviceUUID": null,
    "writeCharacteristicUUID": null,
    "notifyCharacteristicUUID": null,
    "writeMode": "withResponse",
    "packetIntervalMs": 20,
    "maxChunkBytes": null,
    "retry": {
      "maxAttempts": 3,
      "backoffMs": [100, 200, 400]
    }
  }
}
```

## 打印流水线（建议接口分层）

> 目的：让“小程序端”和“Android H5 端”尽量复用核心逻辑，只替换传输实现。

建议分层：

1. **TemplateEngine**
   - 输入：`template` + `data`（变量替换）
   - 输出：`resolvedTemplate`（所有 `{{}}` 已替换）

2. **LayoutScaler**
   - 输入：`resolvedTemplate` + `printerProfile.printableWidthMm`
   - 输出：`scaledTemplate`（按 `fitWidth` 缩放后的 mm 坐标）

3. **Rasterizer（位图层）**
   - 输入：`scaledTemplate`（挑选需位图的元素：图片、任意字体、任意角度旋转等）
   - 输出：`bitmapSlices[]`（按 slice 切片的 1bpp 位图块，带位置与尺寸）

4. **CPCLCompiler（指令层）**
   - 输入：`scaledTemplate`（挑选可原生的元素：文本、码类等） + `bitmapSlices[]`
   - 输出：`cpclJobBytes`（完整 CPCL 作业字节流）

5. **Transport（传输层）**
   - 输入：`cpclJobBytes` + `printerProfile.ble`
   - 输出：打印结果（成功/失败原因分类、可重试）

## CPCL 作业字节流组织（建议）

> 不同厂商 CPCL 方言会在“作业头/结束命令/位图命令”上存在差异，建议通过 `printerProfile.cpclDialect` 收口。

建议逻辑结构（概念级）：

- **Job Header**
  - 设置页面宽高（dot）
  - 设置打印份数
  - 初始化/清屏（若需要）

- **Body**
  - 先输出位图切片（背景/图片/任意旋转/任意字体）
  - 再输出原生文本/二维码/条码（保证清晰与可扫）

- **Job Footer**
  - 结束作业并触发打印

字符编码建议：
- 文本默认按机型支持：GBK/UTF-8（由 profile 选择与转换）


## `fitWidth` 缩放算法（定稿细化）

设：

- 模板画布宽：`canvasWidthMm`
- 机型可打印宽：`printableWidthMm`

缩放系数：

\[
scale = \min(1,\ \frac{printableWidthMm}{canvasWidthMm})
\]

对模板中所有元素应用：

- `xMm *= scale`
- `yMm *= scale`
- `widthMm *= scale`
- `heightMm *= scale`

对文本字号（若使用 mm 表示字号）同样按比例缩放；若最终字体映射无法满足，则降级为位图渲染。

## mm → dot 换算与校准

### 基本换算

\[
dots = mm \times \frac{dpi}{25.4}
\]

若采用标定值：

\[
dots = mm \times mmToDotScale
\]

### 标尺校准建议（落地）

- 打印一条标尺：目标长度 `targetMm = 100`
- 实测打印长度 `measuredMm`
- 校正系数：

\[
k = \frac{targetMm}{measuredMm}
\]

- 若已有临时 `mmToDotScale0`，更新为：

\[
mmToDotScale = mmToDotScale0 \times k
\]

## CPCL 子集（首版必须支持）

首版仅定义“需要的 CPCL 能力子集”，避免后续扩展时出现不可控差异。

### 页面与作业控制

- 设置页面/标签尺寸（宽高，单位为 dot）
- 设置打印份数
- 走纸/结束作业（根据机型方言做适配）

### 文本（原生优先）

- 支持 ASCII + GBK（由机型内置字库决定）
- 支持旋转：0/90/180/270（其余角度走位图）
- 对齐：编辑器对齐最终体现为坐标计算，不依赖打印机“对齐命令”

### 二维码/条码（原生优先）

- QRCode（原生命令）
- CODE128（或业务需要的一维码集合）

### 位图（图片元素必需）

- 支持将图片元素输出为单色位图并打印
- 支持切片打印（按行/按块）

## 元素到输出的映射规则（定稿细化）

### Text

- 满足以下条件时走 CPCL 原生：
  - `rotationDeg` 属于 {0,90,180,270}
  - 字体为 `builtin` 且字号可映射
- 否则：转位图（文字渲染为黑白位图）并走位图打印

### QRCode / Barcode

- 若机型 `supportsNativeQRCode/Barcode` 为 true：走原生命令
- 否则：转位图（不推荐，但作为兜底）

### Image

- 永远走位图打印
- 处理模式：
  - `logo`：优先保边缘、少抖动
  - `background`：抖动更均匀，避免大块黑糊
  - `photo`：更强抖动/灰度映射（更慢，需提示）

## 图片位图化与切片发送（建议）

### 位图基础约束

- 输出为 1bpp（黑/白）
- 图片元素必须满足最大比例 9:16（宽:高）；超限时编辑器端先等比缩放

### 切片策略（推荐按“行切片”）

将位图按固定行高切片（例如 16 或 24 dot 高一片），每片作为独立位图块打印，以降低单次写入的数据量与失败重试成本。

建议：

- `sliceHeightDots`：可在 `printerProfile` 配置（不同机型吞吐不同）
- 切片时保持 X/Y 偏移一致，按 slice 累加 Y

## BLE 传输约定（小程序 + Android H5）

本节定义“可靠发送”的共识规则。具体 MTU/写入模式由 `printerProfile.ble` 覆盖。

### 小程序（wx.* BLE）

- 使用 `wx.writeBLECharacteristicValue`
- 建议默认 `withResponse`（更稳），并通过 `packetIntervalMs` 节流
- 分包大小：
  - 若可获取 MTU：使用 `ATT_MTU - 3`
  - 否则以 profile 配置或保守值（例如 20 字节）为准

### Android H5（Web Bluetooth）

- `navigator.bluetooth.requestDevice`（必须用户手势触发）
- 连接后通过 GATT 获取可写特征，写入采用 chunk + 节流
- 仅作为补充通道，能力与表现不作为 iOS 主通道承诺

## 验收用例（建议首批必测）

### 连接与稳定性

- 首次扫描→连接成功（10 次中 ≥ 9 次）
- 断连后重连成功

### 文本

- 中英文混排（GBK/ASCII）
- 多字号（通过内置映射）
- 0/90/180/270 旋转

### 二维码

- QRCode（打印后可被主流扫码器识别）

### 图片

- 小 Logo（mode=logo）清晰可辨
- 大背景（mode=background）不出现明显断层（允许抖动纹理）
- 照片（mode=photo）可接受（允许较慢，需 UI 提示）

### 宽度适配

- 模板 110mm 宽在 CC4(104mm) 上自动缩放并提示缩放比例

## 机型认证流程（建议：生成/更新 printerProfile）

> 目标：把“支持机型清单”变成可操作流程，而不是手工猜 UUID/参数。

### 1. 发现与筛选

- 小程序端扫描 BLE 设备
- 通过设备名（如包含 `CC4`）与服务 UUID 粗筛（若已知）

### 2. 连接与枚举 GATT

- 连接成功后：
  - 枚举 services
  - 对每个 service 枚举 characteristics
  - 记录每个 characteristic 的 properties（read/write/notify/indicate）

### 3. 确认写入通道

- 选择候选 `writeCharacteristicUUID`：
  - 优先 `write` 或 `writeWithoutResponse` 的特征
- 发送一段最小“测试作业”（例如仅打印一行文本或一个小 QR）
- 若能成功出纸，则确认该 writeChar

### 4. MTU / 分包参数探测

- 若平台支持读取 MTU（或可观察吞吐/失败率）：
  - 逐步增大 chunk（从 20 开始）直到出现失败，再回退
  - 选择稳定的 `maxChunkBytes` 与 `packetIntervalMs`

### 5. DPI / 比例标定

- 打印 100mm 标尺
- 实测长度，写入 `mmToDotScale`（或等效 dpi）

### 6. 固化 profile

- 输出/保存 `printerProfile`（云端下发或内置）
- 将机型加入“已认证机型清单”

