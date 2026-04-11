# 蓝牙标签打印（CPCL）实现与数据结构指南

## 文档目的

本指南是 `docs/printing-spec.md` 的落地补充，面向前端、小程序端和打印链路实现者，回答以下问题：

- 运行时需要哪些核心数据结构
- 模板如何编译为打印指令
- `fitWidth` 如何计算
- 什么场景走 CPCL 原生，什么场景转位图
- BLE 分包、重试和错误码如何统一

本文不替代方案规格；若与主规格冲突，以 `docs/printing-spec.md` 为准。

## 推荐目录职责

如果后续开始编码，建议按如下职责拆分：

- `editor/`：模板编辑器，负责 mm 坐标、拖拽、对齐、旋转等交互
- `printing-core/`：模板校验、缩放、编译、IR 生成
- `printing-drivers/cpcl/`：CPCL 指令映射、位图转码、BLE 分包发送
- `device-profiles/`：认证机型配置

## 端到端链路

```text
模板 JSON
  -> 校验与规范化
  -> 按 printerProfile 做 fitWidth 缩放
  -> 编译为 IR
  -> 原生元素转 CPCL / 复杂元素转位图片段
  -> 指令序列分包
  -> BLE 写入打印机
  -> 打印结果回传
```

建议将“模板编辑态”和“打印执行态”解耦：

- 编辑态保存 mm 单位、原始字体、原始旋转角度
- 执行态生成与机型绑定的 `compiledJob`

## 核心数据结构

### 1. Template

```json
{
  "id": "tpl_shipping_label_v1",
  "name": "发货标签",
  "version": 1,
  "canvas": {
    "widthMm": 110,
    "heightMm": 70
  },
  "elements": [
    {
      "id": "txt_title",
      "type": "text",
      "xMm": 6,
      "yMm": 5,
      "widthMm": 42,
      "heightMm": 8,
      "rotateDeg": 0,
      "zIndex": 10,
      "text": "测试标签",
      "fontFamily": "system-bold",
      "fontSizePt": 14,
      "letterSpacing": 0,
      "align": "left"
    },
    {
      "id": "qr_order",
      "type": "qrcode",
      "xMm": 80,
      "yMm": 6,
      "widthMm": 22,
      "heightMm": 22,
      "rotateDeg": 0,
      "zIndex": 20,
      "value": "ORDER-20260411-0001",
      "errorCorrection": "M"
    }
  ]
}
```

建议字段：

- 顶层：
  - `id`
  - `name`
  - `version`
  - `canvas.widthMm`
  - `canvas.heightMm`
  - `elements[]`
- 元素公共字段：
  - `id`
  - `type`
  - `xMm`
  - `yMm`
  - `widthMm`
  - `heightMm`
  - `rotateDeg`
  - `zIndex`

### 2. PrinterProfile

```json
{
  "id": "zicox-cc4-cpcl-v1",
  "manufacturer": "ZICOX",
  "model": "CC4",
  "protocol": "CPCL",
  "dpi": 203,
  "mmToDotScale": 8,
  "printableWidthMm": 104,
  "supportsNativeText": true,
  "supportsNativeQRCode": true,
  "supportsNativeBarcode": true,
  "supportsNativeRotation": [0, 90, 180, 270],
  "fontMap": {
    "system-regular": {
      "12": { "font": 0, "size": 1 },
      "14": { "font": 0, "size": 2 }
    },
    "system-bold": {
      "14": { "font": 1, "size": 2 }
    }
  },
  "ble": {
    "serviceUUID": "0000FFF0-0000-1000-8000-00805F9B34FB",
    "writeCharacteristicUUID": "0000FFF2-0000-1000-8000-00805F9B34FB",
    "notifyCharacteristicUUID": "0000FFF1-0000-1000-8000-00805F9B34FB",
    "writeMode": "withoutResponse",
    "maxChunkBytes": 180,
    "packetIntervalMs": 25,
    "retry": {
      "maxAttempts": 3,
      "backoffMs": [150, 300, 600]
    }
  }
}
```

说明：

- `dpi` 与 `mmToDotScale` 最好二选一持久化，运行时统一推导成 `mmToDotScale`
- `supportsNativeRotation` 用于判断文本/条码是否允许原生旋转
- `fontMap` 不要求覆盖所有字体；缺失时可自动降级到位图

### 3. DeviceBinding

```json
{
  "deviceId": "ble-device-123",
  "deviceName": "CC4-ABCD",
  "printerProfileId": "zicox-cc4-cpcl-v1",
  "lastConnectedAt": "2026-04-11T10:30:00.000Z"
}
```

用于保存用户最近绑定的设备与机型映射，避免每次重新选择。

### 4. PrintJob

```json
{
  "jobId": "job_20260411_0001",
  "templateId": "tpl_shipping_label_v1",
  "printerProfileId": "zicox-cc4-cpcl-v1",
  "copies": 2,
  "fitStrategy": "fitWidth",
  "payload": {
    "txt_title": "测试标签",
    "qr_order": "ORDER-20260411-0001"
  }
}
```

建议将模板定义与打印数据分离：

- 模板定义版式和元素
- `payload` 仅提供动态内容
- 编译期根据元素 `id` 将数据注入

## 元素渲染规则

| 元素类型 | 推荐优先策略 | 位图兜底条件 |
| --- | --- | --- |
| Text | CPCL 原生文本 | 字体未映射、任意角度旋转、复杂描边/阴影 |
| QRCode | CPCL 原生二维码 | 机型不支持原生二维码 |
| Barcode | CPCL 原生条码 | 机型不支持目标码制或旋转角度不支持 |
| Image | 位图 | 无 |

补充规则：

- `rotateDeg` 若不在 `supportsNativeRotation` 内，直接转位图
- 多个连续位图片段应尽量合并，减少分包数量
- 大面积背景图建议切片，否则 BLE 发送时间会明显增长

## 模板编译步骤

### 1. 校验

编译前先做结构校验：

- `canvas.widthMm <= 110`
- 元素坐标和尺寸必须大于 0
- 图片元素满足 `heightMm <= widthMm * 16 / 9`
- 二维码与条码内容不能为空
- 文本元素必须有字号

### 2. 数据注入

把 `payload` 中的动态值注入模板副本，不直接修改源模板。

### 3. fitWidth 缩放

```text
if canvasWidthMm <= printableWidthMm:
  scale = 1
else:
  scale = printableWidthMm / canvasWidthMm
```

缩放范围：

- 画布宽高
- 元素坐标
- 元素尺寸
- 字号
- 码宽、行高、边距等衍生参数

建议保留两个值：

- `scale`：实际打印缩放比
- `previewScaleNotice`：给 UI 展示的提示文案

### 4. mm 转 dot

优先公式：

```text
dots = round(mm * mmToDotScale)
```

若仅有 `dpi`，则：

```text
mmToDotScale = dpi / 25.4
dots = round(mm * dpi / 25.4)
```

建议：

- 坐标统一 `round`
- 线宽/边框最小值统一 `max(1, round(...))`
- 对宽高做一次 `Math.max(1, value)` 防止缩放后变成 0

### 5. 生成 IR

推荐在 CPCL 之前引入一层通用 IR，便于后续支持更多打印协议。

IR 示例：

```json
[
  {
    "kind": "text",
    "x": 48,
    "y": 40,
    "rotate": 0,
    "native": true,
    "text": "测试标签",
    "fontRef": { "font": 1, "size": 2 }
  },
  {
    "kind": "qrcode",
    "x": 640,
    "y": 48,
    "rotate": 0,
    "native": true,
    "value": "ORDER-20260411-0001"
  },
  {
    "kind": "bitmap",
    "x": 32,
    "y": 220,
    "width": 400,
    "height": 120,
    "native": false,
    "bitmapKey": "img_logo_hash"
  }
]
```

## CPCL 指令映射建议

### 任务头

CPCL 任务建议包含：

1. `! 0 200 200 <labelHeightDots> <copies>`
2. 页面内容命令
3. `FORM`
4. `PRINT`

其中：

- `200 200` 可由具体机型能力调整
- `<labelHeightDots>` 来自缩放后的画布高度
- `<copies>` 对应打印份数

### 文本

文本元素优先走原生命令，典型流程：

1. 用 `fontMap` 选中机型字体与字号
2. 将 mm 坐标转 dot
3. 根据旋转角度选择原生命令或转位图

若出现以下任一条件，则切换为位图：

- 找不到字体映射
- 需要任意字体
- 需要任意角度
- 需要复杂文本特效

### 二维码 / 条码

建议保留“逻辑尺寸”与“原生命令尺寸”分离：

- 逻辑尺寸用于编辑器展示
- 原生命令尺寸使用机型支持的离散档位逼近

如果逼近后误差超过可接受阈值，可回退位图。

### 位图

位图通道建议执行：

1. 原图缩放
2. 灰度化
3. 二值化或抖动
4. 生成打印机要求的位图字节流
5. 生成位图指令

建议为图片资源计算哈希，作为缓存键。

## BLE 发送策略

### 连接步骤

推荐统一为以下步骤：

1. 扫描并选择设备
2. 连接 GATT
3. 获取主服务
4. 获取写特征与通知特征
5. 订阅通知（如果机型需要）
6. 开始分包发送

### 分包规则

使用 `profile.ble.maxChunkBytes` 作为最大分包尺寸：

```text
chunks = split(commandBytes, maxChunkBytes)
for chunk in chunks:
  write(chunk)
  wait(packetIntervalMs)
```

建议：

- 文本指令与位图数据统一转为字节数组后再切包
- 不要按“行”切包，应按字节切包
- 对大位图片段保留进度回调，便于 UI 展示“发送中”

### 重试策略

推荐分两层：

- 连接层重试：连接失败后重新发起连接
- 写入层重试：某次写入失败后重试当前包

建议上限：

- 单包重试不超过 3 次
- 整个任务失败后，提示用户重新打印，不自动无限重发

## 错误码建议

| 错误码 | 含义 | 用户提示 |
| --- | --- | --- |
| `BLE_NOT_SUPPORTED` | 当前环境不支持蓝牙能力 | 请在支持蓝牙的环境中打开 |
| `BLE_PERMISSION_DENIED` | 蓝牙权限被拒绝 | 请开启蓝牙权限后重试 |
| `BLE_DEVICE_NOT_FOUND` | 未发现目标设备 | 请确认打印机已开机并可被发现 |
| `BLE_CONNECT_FAILED` | 设备连接失败 | 请靠近打印机后重试 |
| `BLE_WRITE_FAILED` | 分包写入失败 | 请重试打印，或重连设备 |
| `PROFILE_NOT_FOUND` | 未匹配到机型配置 | 当前设备暂不在认证清单中 |
| `TEMPLATE_INVALID` | 模板结构非法 | 请返回编辑器修正模板 |
| `RASTER_TOO_LARGE` | 位图数据过大 | 请缩小图片或减少背景图面积 |
| `PRINT_TIMEOUT` | 打印长时间未完成 | 请检查打印机状态后重试 |

## 最小验收清单

每新增一个 `printerProfile`，至少验证以下样例：

1. 纯文本标签
2. 文本 + 二维码
3. 文本 + 条码
4. 小 Logo 标签
5. 带背景图标签
6. 缩放场景：110mm 模板打印到 104mm 机型
7. 旋转场景：90 度原生、45 度位图
8. 弱网或蓝牙干扰下的重试行为

验收记录建议保留：

- 机型名
- 固件版本
- `printerProfile` 版本
- 校准参数
- 测试样例结果
- 失败现象与复现步骤

## 实现建议

为降低后续扩展成本，建议优先保证以下边界：

- 所有渲染逻辑都基于 IR，而不是直接从模板拼 CPCL
- 所有机型差异都收敛到 `printerProfile`
- 所有错误都映射成稳定错误码，不直接向 UI 暴露底层异常文本
- 所有位图转换都做缓存，避免重复计算和重复发送

若后续要扩展 ESC/POS 或其他协议，可以复用：

- 模板结构
- `fitWidth` 逻辑
- IR 生成逻辑
- BLE 发送基础设施

差异主要落在协议驱动层。
