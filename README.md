# 书页 · 双页扫描与批注

手机手动拍摄展开的书本，服务端自动识别书脊、拆分左右页，电脑端同步预览并生成与原文对应的 AI 批注。

## 使用

1. 在电脑端打开首页，点击“手机拍摄”显示二维码。
2. 手机扫码打开拍摄页。私有 Sites 链接需要手机和电脑登录同一账号。
3. 手动拍照或选择照片，必要时旋转，然后点击“上传并自动分割”。
4. 在“原图与分割”核对书脊；自动识别不准时可拖动端点或调整滑块。
5. 在电脑端点击“识别文字并生成批注”。先处理左页，再处理右页。点击批注即可高亮原文。

摄像头预览需要 HTTPS（本机 localhost 除外）。手机访问普通 HTTP 局域网地址时，应使用照片选择器或部署后的 HTTPS 地址。程序仅在点击拍摄后上传照片，不上传视频。

## 本地开发

推荐在本机磁盘上开发。当前 NAS 映射盘在 Node 初始化与 Git 锁文件写入时出现 ENOENT；实际开发副本位于 `C:/Users/kicof/Projects/book-spread-scanner-20260907`，源码及 Git 历史同步到原项目目录。

需要 Node.js 22.13+。

```powershell
npm ci
Copy-Item .env.example .dev.vars
# 在 .dev.vars 中填入 OPENAI_API_KEY；OPENAI_MODEL=gpt-5.6-sol
npm run db:migrate
npm run dev
```

本地预览默认 `http://localhost:3000`。`.dev.vars`、`.env*`、本地数据库、测试照片和构建产物不进入 Git。生产环境密钥通过 Sites Secret 配置。修改密钥或模型后重启开发服务。

首次创建数据库使用 `npm run db:migrate`。该脚本用 Wrangler 官方迁移记录，重复执行不会重建已存在的数据表。修改 `db/schema.ts` 后运行 `npm run db:generate`，再迁移。已发布迁移不修改，新增迁移追加。

## 架构

- React + TypeScript + Vinext；手机 `/scan/:session`，电脑 `/review/:session`。
- Cloudflare Worker 路由负责会话、上传、JPEG 解码、书脊检测、裁分和 OpenAI 请求。
- D1 保存会话、拍摄顺序、分割版本、OCR 和批注；R2 保存定向后的原始上传图及每版左右页 JPEG。
- 浏览器 Canvas 统一 EXIF 方向并限制上传长边 2400 像素、总像素 380 万。保留的“原图”是上传用图，不是相机未经压缩的原文件。
- 第一版使用 Tesseract.js 在电脑浏览器中依次识别中文、英文和字符坐标，不需要额外 OCR 付费账号。Worker/WASM 随站点部署，语言模型首次从 Project Naptha 下载并由 OCR 引擎缓存。
- 服务端以 `gpt-5.6-sol` 调用 Responses API，使用结构化输出和 `store:false`。模型只返回原文引用和批注；坐标来自 OCR。前端、日志与 Git 不包含 API Key。
- 手机与电脑通过同一随机会话链接配对，每 3 秒轮询持久化结果。会话链接作为访问能力，应只发送给自己的设备；站点默认仅所有者可访问。

## 定位与顺序

每次拍摄一条 spread，分配递增 sequence。每条记录固定包含 left 和 right，阅读序号为 `2*sequence-1` 和 `2*sequence`，与书上印刷页码无关。两侧 OCR 独立，合并 AI 输入时固定先左后右。

OCR 文本行拥有独立 ID、页面归属和字符范围。范围使用 JavaScript UTF-16 索引，与 substring 规则一致。AI 批注可以有多个 anchors，因此同一句话跨行、跨左右页时仍可高亮多个位置。每个引用必须在指定文本行唯一匹配；服务端拒绝不存在、歧义或没有坐标的引用。

重新分割产生新 revision，清除旧 OCR/批注。旧版本写入返回 409，避免坐标错配。上传支持请求 ID 幂等重试；任务有超时锁，避免重复同时生成批注。

## 书脊检测边界

当前算法基于中央区域连续的亮暗对比，估计接近竖直的书脊上下端点。它不是训练好的书本检测模型，也不保证所有背景下均能检测。书脊不明显时明确返回低置信度中线，要求人工核对。

左右分割保留各侧完整边缘，按行重采样拉直斜分割线。暂不实现自动外边缘裁切、完整透视矫正、弯曲书页展平、自动翻页拍摄或竖排古籍识别。严重倾斜、遮挡、反光和复杂双栏会降低分割/OCR质量。OCR 首次加载和推理可能花费几十秒，AI 请求超时为 115 秒。

## 验证

```powershell
npm run typecheck
npm test
npm run build
# 在 npm run dev 运行时执行端到端接口测试
./scripts/generate-fixture.ps1
npx tsx scripts/integration.ts --ocr
# 下面一项会真实调用配置的 OpenAI 模型并产生费用
npx tsx scripts/integration.ts --ocr --ai
```

测试包含偏心/倾斜书脊、无书脊回退、左右顺序、跨页引用、错误坐标拒绝、上传重试、会话隔离、手动重分割和旧版本冲突。真实 OCR 与 AI 测试使用本地生成的中文印刷测试图；还需要用实际手机书本照片评估效果。未代替真实 iOS/Android 摄像头权限及手持拍摄验收。

站点提供可选 WebMCP 选中已扫描书页工具。无支持的浏览器上下文时自动忽略；当前未执行浏览器 WebMCP 合约验证。

## 发布与版本控制

`npm run build` 输出 Cloudflare Worker 与静态资源，Sites 按 `.openai/hosting.json` 绑定数据库和对象存储。Git 的 `main` 保存开发里程碑，Sites 远端保存对应源码。禁止将 `.dev.vars` 加入 Git。
