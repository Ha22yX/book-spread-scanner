<h1 align="center">Book Spread Scanner · 书页</h1>

<p align="center">拍下展开的书本，让原文与批注留在同一页。<br/>手机拍摄，电脑识别，在原图旁阅读简短的英文笔记。</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong> ·
  <a href="#为什么做这个项目">为什么做这个项目</a> ·
  <a href="#功能">功能</a> · <a href="#快速开始">快速开始</a>
</p>

<p align="center">
  <img alt="TypeScript 与 React" src="https://img.shields.io/badge/TypeScript-React-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" />
  <img alt="OCR：PaddleOCR 与 ONNX" src="https://img.shields.io/badge/OCR-PaddleOCR%20%2B%20ONNX-287866?style=for-the-badge" />
  <img alt="存储：Cloudflare D1 与 R2" src="https://img.shields.io/badge/Cloudflare-D1%20%2B%20R2-EA7B24?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=white" />
</p>

<p align="center">
  <img src=".github/assets/readme-hero.svg" alt="技术流程：手机拍摄、云端排队、双页分割、电脑 PaddleOCR、OpenAI 批注和网页阅读" width="100%" />
</p>

网页负责保存照片和任务队列，**独立的电脑后台处理器**负责 OCR 并请求 AI 批注。处理器所在电脑需要保持开机、联网且不休眠。界面以简体中文为主，生成的阅读批注为英文。

## 为什么做这个项目

照片可以保存一页书，但翻看一堆照片并不方便：一段话可能跨过书脊，下一句可能接在后一张照片里，而脱离原文的笔记又很难核对。

Book Spread Scanner 把这些环节连起来。一次拍下左右两页，按阅读顺序保留照片，再把简短批注放回原图旁。OCR 提供文字与位置，模型给出对应原文短语的简明观察。同一会话前两张照片的原文补充上下文，无需每次发送整本书。

拍摄和处理也不必互相等待。照片上传后，可以继续拍下一张或关闭手机页面；持久化队列与电脑后台继续处理，结果完成后自动出现在阅读页。

## 功能

| 功能 | 当前实现 |
| --- | --- |
| 手机与电脑配对 | 通过会话二维码打开手机页面，使用系统相机或照片选择器，确认后上传 |
| 双页分割 | 检测书脊并拆分左右页，分割错误时可手动调整 |
| 电脑后台 OCR | Guten OCR / PaddleOCR PP-OCRv4 通过原生 ONNX Runtime 运行，先左页、后右页 |
| 连续阅读上下文 | 使用当前原图和文字，加上同一会话前两张照片的原文 |
| 简短英文批注 | 每张双页照片目标为 2–4 处不同批注，每条最多 10 个英文词，关联原文短语 |
| 原文证据定位 | 彩色短语高亮与页边笔记、引导线对应，保留上传原图 |
| 印刷页码 | 从图中识别可见页码，看不清时显示未知，不按拍摄顺序猜测 |
| 持久化处理 | 保存队列与进度，恢复过期任务租约，显示后台离线状态 |
| 局部修正 | 重新分割并处理、重试失败任务，或保留 OCR 只重新生成批注 |
| 长会话导航 | 底部缩略图条、键盘导航、轻量进度轮询与缩略图懒加载 |

### 技术流程

1. **拍摄：** 浏览器统一图片方向，将上传图限制为长边不超过 2,400 像素、总像素不超过 380 万。保存的“原图”是这份上传图，不是未经压缩的相机文件。
2. **保存与分割：** Cloudflare D1 保存会话顺序、版本、文字和任务状态，R2 保存图片。Worker 检测书脊；本地算法置信度低时可请求 OpenAI 视觉辅助。
3. **识别：** 电脑后台领取任务并执行 OCR，检测到的文字行四边形是定位坐标的来源。
4. **批注：** OpenAI 接收当前原图、当前文字和前两张照片的原文。返回的引用必须通过当前页面文字校验，高亮坐标来自 OCR。
5. **阅读：** 浏览器显示批注原图、印刷页码和处理状态。版本检查避免旧结果覆盖重新分割后的页面。

短语边界在 OCR 行级几何范围内估算，不是逐字像素级检测。反光、模糊、严重倾斜和复杂双栏会影响结果。目前不支持完整透视矫正、弯曲书页展平或自动翻页拍摄。不可读页面可能没有批注；无效结果会明确报错并允许重试。

## 快速开始

### 1. 安装与配置

需要 **Node.js 22.13 或更高版本**、npm 和 Git。以下命令使用 PowerShell。

```powershell
git clone https://github.com/Ha22yX/book-spread-scanner.git
cd book-spread-scanner
npm ci
Copy-Item .env.example .dev.vars
```

继续前，在本地编辑 `.dev.vars`：

| 变量 | 配置内容 |
| --- | --- |
| `OPENAI_API_KEY` | 你自己的 OpenAI API 密钥；AI 批注与可选视觉请求会产生 API 用量费用 |
| `OPENAI_MODEL` | 示例与代码默认值为 `gpt-5.6-sol`；所用模型需对你的账号可用，并支持本项目的图片和结构化输出请求 |
| `PROCESSOR_TOKEN` | 网页服务与电脑后台共同使用的一段足够长的随机密钥 |
| `PROCESSOR_BASE_URL` | 本地使用 `http://127.0.0.1:3000`，远程部署使用站点 HTTPS 地址 |
| `SITE_ACCESS_TOKEN` | 处理器连接受访问限制的 `*.chatgpt.site` 部署时需要；本机 localhost 留空 |

可在本地执行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成处理器密钥，再填入 `.dev.vars`。真实凭据只应放在 Git 忽略的本地文件或托管平台的秘密配置中。`.env.example` 的凭据字段均为空。

### 2. 启动网页与后台

第一个终端运行：

```powershell
npm run db:migrate
npm run dev
```

第二个终端在同一项目目录运行：

```powershell
npm run processor
```

打开 **[localhost:3000](http://localhost:3000/)**。本地自动处理需要这两个进程同时运行。守护程序会重启异常退出的 OCR 子进程，但不能在电脑关机或休眠时继续处理。

### 3. 拍摄与阅读

1. 在电脑打开会话，点击 **「手机拍摄」** 显示二维码。
2. 手机打开拍摄页，拍照并在系统相机确认；也可以选择已有照片。
3. 电脑显示实际阶段：排队 → 分割 → 左页 OCR → 右页 OCR → 前文 → 批注。
4. 查看高亮和页边笔记，仅在需要时调整分割或重试。

手机无法通过 `localhost` 地址访问电脑。局域网使用时，将 `PROCESSOR_BASE_URL` 设为 `http://127.0.0.1:3000`，停止前述两个开发进程，再运行：

```powershell
npm run build
npm run lan
```

这会同时启动网页服务和 OCR 处理器。在电脑上通过 `http://电脑局域网IP:3000/` 打开页面，以生成手机能访问的二维码；手机连接同一网络。除 localhost 外，实时摄像头预览需要 HTTPS；普通局域网 HTTP 可使用照片选择器。远程拍摄应使用带身份验证的 HTTPS 部署。

### 托管、隐私与开发

- **托管：** 当前架构使用 Cloudflare Worker、D1 和 R2，并集成 Sites。`.openai/hosting.json` 标识现有部署；另行部署时应配置自己的项目及绑定。源码公开不等于运行中的站点公开。
- **数据：** 远程部署会把上传照片、OCR 和批注保存在所配置的云端存储中；OpenAI 接收上文说明的图片和文字。OCR 在处理器电脑执行，整体流程不是完全离线的。
- **访问：** 会话链接本身具有访问能力，请妥善保管，并为远程站点配置身份验证。`PROCESSOR_TOKEN` 保护处理器接口，不覆盖所有阅读与上传接口。
- **检查：** 运行 `npm run typecheck`、`npm test` 和 `npm run build`。含 AI 的集成脚本会真实调用 API，详见 [开发与运维说明](docs/operations.zh-CN.md)。
- **Windows 后台：** 可选的登录自启、异常恢复、仅重新生成批注等操作也记录在上述文档中。
- **凭据检查：** 扫描范围与密钥保存规则见 [公开前安全检查](docs/security.md)。
- **第三方素材：** OCR 模型与运行时保留了 [public/ocr/NOTICE.txt](public/ocr/NOTICE.txt) 中的说明；项目尚未添加仓库级许可证文件。
