# KeFeng Toolkits

基于 Tauri 2 + Vite + 原生 TypeScript 的桌面工具箱，旨在替代原先的内部月报工具与报销申报工具，围绕可扩展性设计。

## 目录结构

```
index.html                    # 应用外壳：自定义标题栏 + 左侧侧边栏 + 右侧内容区
src/
├─ main.ts                    # 工具切换、挂载/销毁、占位页
├─ tools.ts                   # 工具注册表
├─ tools/monthly-report/
│  ├─ index.ts                # 工具定义（id/名称/图标/挂载函数）
│  ├─ controller.ts           # 生命周期、自动保存、导出流程
│  ├─ store.ts                # 状态机：切月、草稿、节假日、导出校验
│  ├─ view.ts                 # 表格/汇总/状态区渲染
│  ├─ styles.css              # 工具页样式（亮/暗色）
│  ├─ calculations/           # 工时、加班、出勤、汇总、报表布局（纯函数）
│  └─ services/               # 存储、节假日、ExcelJS 导出、文件保存
└─ tools/reimbursement/
   ├─ index.ts                # 工具定义
   ├─ controller.ts           # 实例管理、草稿保存、导入/导出流程
   ├─ view.ts                 # 四种表单编辑器、发票列表、状态区
   ├─ styles.css              # rb-* 样式
   ├─ forms/                  # 表单类型、金额/大写/合计/校验、PDF 值映射
   ├─ services/               # 草稿存储、模板加载、字体、PDF 合成、发票
   └─ assets/templates/       # 由样例 xlsx 生成的空白 PDF 与字段几何
scripts/                      # 开发期模板生成/校准脚本（运行时不使用）
src-tauri/                    # Rust 后端与 Tauri 配置
```

## 侧边栏状态

- 顶部显示 K Logo/公司名，或工程师姓名首字符与“姓名•工程师等级”。
- 显示当前北京时间、本月已工作小时数、本月已休息小时数。
- “已休息”按公司内部调休/休息折算：纯调休/休息 8h/天，混合调休 4h/天（即已调休天数 × 8），只统计工作日。

## 月报统计功能与老版本一致

### 计算规则

- 工作时长：下班 − 上班；下班早于上班按跨午夜 +24h；保留 2 位小数。
- 加班：普通周末/法定节假日全部计加班；**国家调班日按正常工作日计算**（混合调休超过 4h、其余超过 8h 的部分）；其他工作日混合调休超过 4h、其余超过 8h。
  - 调班日（如国庆后的周六）不按“休息日上班”全天计加班；公司内部“调休”仍按请假逻辑处理。
- 项目出勤：无项目 token → 0；地点含“公司” → 0.5；否则 <4h→0、4~8h→0.5、≥8h→1。
- 可调休天数 = 总加班 ÷ 8，保留 2 位，银行家舍入。
- 年份下拉为当前年份前 1 年至后 10 年，并合并内置的 2025/2026。

## 报销单与发票导出

支持四种公司内部报销单，每种均可添加任意多份实例，按实例列表顺序导出：

- 差旅报销单：27 行明细（第 6–32 行）、四类费用小计、八项其他费用、预支金额、应付金额。
- 报销单：19 行明细、合计、附件张数。
- 报销汇总单：19 行明细、合计。
- 私车公用报销单：10 段行程、总里程、可编辑单价（默认 1.00 元/公里）。

### 业务口径

- 行金额、费用小计、总计、里程与费用自动计算；合计生成人民币中文大写。
- 差旅单的小计汇总全部 27 行（不沿用样例只汇总前 14 行的旧公式）。
- 模板中的“应退/付金额”按**应付金额**处理，等于合计报销总金额；预支金额仅作填写项，不参与差值。
- 金额输入上限为 9 位金额格可表示的范围（999,999,999 分）；超过时校验会阻止导出。
- 签名区留空，供手写。

### 发票与导出

- 「导入发票」支持一次选择多个 PDF；列表显示文件名、页数和大小，可调整顺序或移除。
- 每张 A4 发票页可放 1 / 2 / 4 张发票，默认 2 张（上下排列）；4 张为 2×2，按导入顺序多页排版。
- 导出顺序：所有报销单实例在前，随后是发票排版页；每张报销单一页 A4。
- 默认文件名：`报销单与发票_YYYYMMDD_HHmm.pdf`。导出完成后可在文件夹中定位。
- PDF 中文字体在运行时从系统读取宋体/微软雅黑，并按实际字符做子集嵌入；不随应用分发字体文件。仅支持 Windows 自带的这两种字体。
- 报销单草稿保存在 `localStorage` 的 `kefeng-toolkits:reimbursement:v1`；**导入的发票只保留在当前会话**，重启后需重新导入。

### PDF 实现

- 四种空白 PDF 模板由样例 xlsx 通过 Excel COM 一次性导出，动态字段的坐标/字体/对齐记录在 `assets/templates/fields.json`；应用运行时不需要 Excel。
- 导出时用 pdf-lib 在模板上叠加用户输入，保留原表格标签、边框与合并单元格。
- 发票页通过 `embedPage` 按 CropBox 与 `/Rotate` 归一化后缩放居中到槽位。

## 开发

```bash
npm install
npm run tauri dev      # 启动桌面应用（Vite 端口 1420）
npm run tauri build    # 生产打包
npm run build          # 类型检查 + 前端构建
npm test               # Vitest 单元测试
cargo check            # 在 src-tauri 下检查 Rust 后端
```

## 报销单模板维护

模板与 `fields.json` 已随仓库提供，正常开发无需重新生成。样例 xlsx 更新后，在 Windows + Excel 环境执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-reimbursement-templates.ps1 `
  -TravelXlsx "ExampleReimbursementSheet/差旅报销单.xlsx" `
  -GeneralXlsx "ExampleReimbursementSheet/报销单.xlsx" `
  -SummaryXlsx "ExampleReimbursementSheet/报销汇总单.xlsx" `
  -PrivateCarXlsx "ExampleReimbursementSheet/私车公用报销单.xlsx"
```

- 脚本会清除动态单元格、设置打印区域与缩放、导出空白 PDF，并重新生成 `fields.json`。
- Excel 读取的单元格坐标与最终打印/导出的位置存在少量累计缩放偏差，需要再运行校准脚本（依赖 Python 的 `pypdfium2` 与 `Pillow`）。脚本会检测每份模板实际打印的表格横/竖线，重新计算字段矩形与页面尺寸：

```bash
python scripts/calibrate-reimbursement-fields.py
```

- 重新生成后请用导出的样张核对字段位置，尤其是右侧金额列、汇总行与私车表格底部。

## 未来移植与开发计划

- 1.完成设置项的开发
- 2.开发服务端，升级为C/S架构，另增加月报上传/下载/审批，报销单上传/下载功能模块
- 注：原 WPF 项目的日报、周报不在本项目移植范围内。原有本地缓存仍兼容，但不会显示日报与周报功能。
