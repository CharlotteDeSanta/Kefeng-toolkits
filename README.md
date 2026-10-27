# KeFeng Toolkits

基于 Tauri 2 + Vite + 原生 TypeScript 的 Windows 桌面工具箱，用于替代公司内部的 AGV 月报工具与报销申报工具，围绕可扩展性设计。当前版本 **1.1.0**。

原 WPF 项目的日报、周报不在移植范围内；旧版本地缓存不会自动导入，本项目的数据统一保存在 `localStorage`。

## 功能概览

- **月报统计**：按天填写上班地点、工作内容与上下班时间，自动计算工时、加班、项目出勤、六项月度汇总与项目地点汇总，并导出 XLSX。
- **报销单与发票导出**：支持四类内部报销单，任意多份实例；自动计算金额/里程/大写；可导入 PDF 发票并按 1/2/4-up 排版合并导出。
- **电子签名**：四类报销单的报销人栏均支持 JPG/PNG 个人签名；复核、财务、出纳、主管姓名可填写或留空，报销单同时保留报销人姓名。
- **侧边栏状态**：显示北京时间、本月已工作/已休息小时数，并根据姓名显示工程师品牌行。
- **设置页**：目前为占位页，后续开发。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2 + Rust 2024 |
| 前端 | Vite 8 + TypeScript 6（strict）+ 原生 DOM |
| 月报导出 | ExcelJS |
| 报销 PDF | pdf-lib、fontkit、hb-subset-wasm |
| 测试 | Vitest |

## 目录结构

```
index.html                    # 应用外壳：自定义标题栏 + 左侧侧边栏 + 右侧内容区
src/
├─ main.ts                    # 工具切换、挂载/销毁、占位页
├─ sidebar-status.ts          # 侧边栏时间、工时/休息小时、姓名品牌行
├─ tools.ts                   # 工具注册表
├─ tools/monthly-report/
│  ├─ index.ts                # 工具定义
│  ├─ controller.ts           # 生命周期、自动保存、导出流程
│  ├─ store.ts                # 状态机：切月、草稿、节假日、导出校验
│  ├─ view.ts                 # 表格/汇总/状态区渲染
│  ├─ styles.css              # 工具页样式（亮/暗色）
│  ├─ calculations/           # 工时、加班、出勤、汇总、报表布局（纯函数）
│  └─ services/               # 存储、节假日、ExcelJS 导出、文件保存
└─ tools/reimbursement/
   ├─ index.ts                # 工具定义
   ├─ controller.ts           # 实例管理、草稿/签名保存、导入/导出流程
   ├─ view.ts                 # 四种表单编辑器、签批区、发票列表、状态区
   ├─ styles.css              # rb-* 样式
   ├─ forms/                  # 表单类型、签批字段、金额/大写/合计/校验、PDF 值映射
   ├─ services/               # 草稿/签名存储、模板、字体、PDF 合成、发票、文件
   └─ assets/templates/       # 由样例 xlsx 生成的空白 PDF 与字段几何
scripts/                      # 模板生成/校准脚本、版本更新脚本（运行时不使用）
src-tauri/                    # Rust 后端与 Tauri 配置
```

## 侧边栏状态

- 顶部显示 K Logo/公司名，或工程师姓名首字符与“姓名•工程师等级”。
- 显示当前北京时间、本月已工作小时数、本月已休息小时数。
- “已休息”按公司内部调休/休息折算：纯调休/休息 8h/天，混合调休 4h/天（即已调休天数 × 8），只统计工作日。

## 月报统计

### 计算规则

- 工作时长：下班 − 上班；下班早于上班按跨午夜 +24h；保留 2 位小数。
- 加班：普通周末/法定节假日全部计加班；**国家调班日按正常工作日计算**（混合调休超过 4h、其余超过 8h 的部分）；其他工作日混合调休超过 4h、其余超过 8h。
  - 调班日（如国庆后的周六）不按“休息日上班”全天计加班；公司内部“调休”仍按请假逻辑处理。
- 项目出勤：无项目 token（空、`公司`、`调休`/`休息`）→ 0；存在项目 token 且地点含“公司” → 0.5；否则 <4h→0、4~8h→0.5、≥8h→1。
- 实际上班天数：排除纯调休/休息后，≥8h 记 1 天、4~8h 记 0.5 天、<4h 记 0 天。
- 已调休天数：只统计工作日，纯调休/休息 +1 天、混合调休 +0.5 天。
- 可调休天数 = 总加班 ÷ 8，保留 2 位，银行家舍入。
- 年份下拉为当前年份前 1 年至后 10 年，并合并内置的 2025/2026。


### 节假日与导出

- 节假日来源优先级：内置 2025/2026 → 内存 → `timor.tech` 网络（8s 超时）→ 本地缓存 → 不可用。
- 若某年既非内置、又无缓存、且联网失败，界面会红字告警并**禁止导出**，避免按“仅周末”错算加班。
- 导出前校验：姓名必填、时间格式必须为 `HH:mm`、节假日数据必须可靠。

### XLSX 导出

- 8 列布局：日期、上班地点、工作内容、上班时间、下班时间、工作时长、加班时长、项目出勤。
- 使用 ExcelJS 生成，保留标题/表头样式、合并单元格、边框、休息日红底，并冻结前 3 行。
- 默认文件名：`AGV月报_姓名_年_月.xlsx`。
- 开发环境（浏览器）走下载，Tauri 环境走原生保存对话框 + Rust 写文件。

### 本地数据

月报草稿、个人配置与节假日缓存保存在 `localStorage`：

- `kefeng-toolkits:monthly-report:v1:profile`
- `kefeng-toolkits:monthly-report:v1:draft:YYYY-MM`
- `kefeng-toolkits:monthly-report:v1:holiday:YYYY`

月报每 10 秒自动保存，切换月份、导出、关闭窗口或页面隐藏时也会落盘。

## 报销单与发票导出

支持四种公司内部报销单，每种均可添加任意多份实例，按实例列表顺序导出：

| 表单 | 内容 |
|---|---|
| 差旅报销单 | 27 行明细（第 6–32 行）、四类费用小计、八项其他费用、预支金额、应付金额 |
| 报销单 | 19 行明细、合计、附件张数 |
| 报销汇总单 | 19 行明细、合计 |
| 私车公用报销单 | 10 段行程、总里程、可编辑单价（默认 1.00 元/公里） |

### 业务口径

- 行金额、费用小计、总计、里程与费用自动计算；合计生成人民币中文大写。
- 差旅单的小计汇总全部 27 行（不沿用样例只汇总前 14 行的旧公式）。
- 模板中的“应退/付金额”按**应付金额**处理，等于合计报销总金额；预支金额仅作填写项，不参与差值。
- 金额以“分”为单位计算，输入上限为 9 位金额格可表示的范围（`999,999,999` 分）；超限或非法值会阻止导出。
- 报销单、汇总单的表头日期数字按 **12.5pt** 垂直居中、不换行，与“年/月/日”汉字的视觉大小协调。

### 签批与电子签名

所有签批字段均可填写、也可留空；导出处按模板单元格绘制：

| 表单 | 文字签批字段 | 报销人处理 |
|---|---|---|
| 差旅报销单 | 复核、出纳、主管 | 电子签名，位于“报销人”右侧 `P39:R39` |
| 报销单 | 主管、复核、出纳、报销人 | 姓名仍打印；签名位于“报销人签章”右侧 `S26`，不覆盖标签 |
| 报销汇总单 | 复核、财务、出纳、主管 | 电子签名，位于“报销人”右侧 `S26` |
| 私车公用报销单 | 复核、出纳 | 电子签名，位于“报销人”右侧 `I47` |

- 电子签名支持 JPG/PNG，作为全局个人签名保存在 `localStorage` 的 `kefeng-toolkits:reimbursement:v1:signature`，不随草稿或导出文件上传。
- 选择图片时按文件头校验 PNG/JPEG，最长边缩放到 1200px；data URL 超限时继续压缩，仍超限则拒绝。
- 导出时用 pdf-lib 将签名等比居中放入对应签名格；未设置签名时保持模板原样。
- 差旅、私车公用的签名格在原单元格基础上向下扩展，以保证签名可读；报销单签名格位于 `J26:R26` 标签右侧。

### 发票与导出

- 「导入发票」支持一次选择多个 PDF；列表显示文件名、页数和大小，可调整顺序或移除。
- 每张 A4 发票页可放 1 / 2 / 4 张发票，默认 2 张（上下排列）；4 张为 2×2，按导入顺序多页排版。
- 导出顺序：所有报销单实例在前，随后是发票排版页；每张报销单一页 A4。
- 默认文件名：`报销单与发票_YYYYMMDD_HHmm.pdf`。导出完成后可在文件夹中定位。
- PDF 中文字体在运行时从系统读取宋体/微软雅黑，并按实际字符做子集嵌入；不随应用分发字体文件。仅支持 Windows 自带的这两种字体。

### 本地数据

- 报销单草稿保存在 `localStorage` 的 `kefeng-toolkits:reimbursement:v1`。
- **导入的发票只保留在当前会话**，重启后需重新导入。
- 电子签名单独保存在 `kefeng-toolkits:reimbursement:v1:signature`，重启后仍保留。

### PDF 实现

- 四种空白 PDF 模板由样例 xlsx 通过 Excel COM 一次性导出；动态字段、签批字段与签章图片的坐标/字体/对齐记录在 `assets/templates/fields.json`，应用运行时不需要 Excel。
- 导出时用 pdf-lib 在模板上叠加用户输入，保留原表格标签、边框与合并单元格。
- 发票页通过 `embedPage` 按 CropBox 与 `/Rotate` 归一化后缩放居中到槽位。

## 文件与系统集成

Tauri 后端在 `src-tauri/src/lib.rs` 提供：

- `save_workbook`：保存前端生成的 XLSX。
- `read_binary_file`：读取用户选择的 PDF 发票（≤200 MB）。
- `read_image_file`：读取 JPG/PNG 电子签名（≤10 MB）。
- `write_binary_file`：以临时文件 + 重命名方式写入 PDF。
- `read_system_font`：按白名单读取系统宋体/微软雅黑。

`src-tauri/capabilities/default.json` 只开放窗口控制、dialog、opener 以及 `timor.tech` 节假日接口的 HTTP 权限。

## 开发

```bash
npm install
npm run tauri dev      # 启动桌面应用（Vite 端口 1420）
npm run tauri build    # 生产打包
npm run build          # 类型检查 + 前端构建
npm test               # Vitest 单元测试
cargo check            # 在 src-tauri 下检查 Rust 后端
```

## 版本管理

当前版本为 `1.1.0`。版本号同时存在于：

- `package.json` / `package-lock.json`
- `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `index.html` 侧边栏页脚

使用脚本统一更新：

```bash
python scripts/update-version.py 1.1.0
python scripts/update-version.py 1.1.0 --dry-run
```

脚本只修改本应用版本，不会改动依赖版本；支持 `v1.1.0` 输入，重复执行幂等。

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
- 生成脚本同时写入签批字段、电子签名图片字段和日期数字的 12.5pt/垂直居中样式。
- Excel 读取的单元格坐标与最终打印/导出的位置存在少量累计缩放偏差，需要再运行校准脚本（依赖 Python 的 `pypdfium2` 与 `Pillow`）。脚本会检测每份模板实际打印的表格横/竖线，重新计算字段矩形、签名字段与页面尺寸：

```bash
python scripts/calibrate-reimbursement-fields.py
```

- 重新生成后请用导出的样张核对字段位置，尤其是右侧金额列、汇总行、签批栏与私车表格底部。

## 已知限制与后续计划

- 设置页尚未实现。
- 计划开发服务端，升级为 C/S 架构，增加月报上传/下载/审批、报销单上传/下载等模块。
- PDF 中文字体与文件对话框依赖 Windows；非 Windows 环境无法完整使用报销导出。
- 发票不持久化、电子签名仅保存在本机 `localStorage`。
- 原 WPF 项目的日报/周报不移植，旧版本地缓存不会自动导入。
- 模板字段几何与样例 xlsx 强相关，样例更新后需按上面的生成 + 校准流程重新生成 `fields.json`。
