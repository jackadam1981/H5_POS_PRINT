# H5_POS_PRINT

蓝牙标签打印文档仓库，当前以 CPCL 标签打印方案为主，重点覆盖：

- 模板与机型解耦
- 按机型宽度自动缩放
- CPCL 原生指令与位图混合渲染
- BLE 连接、分包发送与错误处理

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

当前仓库主要沉淀文档，不包含正式的打印 SDK 或示例工程。若开始实现，建议优先按以下顺序推进：

1. 固化 `printerProfile` 数据结构
2. 实现模板校验与 `fitWidth` 缩放
3. 建立 IR 与 CPCL 驱动层
4. 接入 BLE 分包发送与错误码映射
5. 用认证机型清单逐台验收
