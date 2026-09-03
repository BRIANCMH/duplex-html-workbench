# 双工 HTML 雕花工程

这是一个可复用的双工 HTML 工程。当前包含股票查询、出门上班·打车、会议纪要、出差规划·订票值机和《风会替你记得》五个案例，同时保留手机端演示、任务组件、上下双轨播放、事件日志和完整九轨音轨标注编辑器。

仓库对应 GitLab 项目“`双工html雕花`”，用于继续制作、标注和发布双工 Golden Case。

当前仓库提交五案例运行所需资源。历史原始音轨和临时生成缓存不进入 Git；《风会替你记得》的独立音频位于 `cases/wind-will-remember/`。

## 后续复用方式

后续把新的文档脚本直接发给我即可。我会按现有数据结构把脚本映射到 HTML 中的场景配置和 `assets/tts/clips.js` 音频索引，继续使用同一套手机交互与编辑器能力。

## 已保留的编辑能力

- 上下声道同时播放与可视化播放头
- 音频片段拖动、裁剪、淡入、渐弱、增益调整
- 选中片段后试听、重新生成并替换音频
- 选中语音片段后编辑 Global Context、Inline Context、音色 ID、语速、音量倍率和文本归一化
- 每段人声支持独立 Prompt TTS、音色、语速、音量倍率和文本归一化；其他人声轨也可生成 TTS
- 助手音轨可绑定到任意用户语音，并按毫秒设置响应间隔；默认建议值为 `400ms`，移动用户片段时已绑定的助手片段会同步跟随
- 选中任意音频轨后上传单段音频，或请求浏览器麦克风权限进行真人录音；文件写入固定 `audio-library/`
- 上传/录音后会先写入本地音频库，并统一转成 24 kHz 单声道 WAV（浏览器 WebM 没有容器时长时也可正常处理）；随后可试听并绑定到当前片段，片段时长、开始/结束时码和 `mediaIn` 继续可编辑
- 一键导出音频内嵌的单文件 HTML，适合脱离工程目录外发分享
- 时间轴延长 30 秒、撤销、重置、缩放、新增自定义层
- 标注导出 JSON，删除只修改标注，不删除源音频

TTS 配置会随片段标注自动保存。修改提示词或参数后，点击“生成并替换”才会调用 StepAudio 并更新该片段音频。

当前股票场景已预置 14 个可编辑语音片段（用户 5 段、助手 9 段）和 `scene_stock` 环境音；修改片段时间、增益、淡入淡出或删除后，编辑器播放会直接使用编辑后的双轨结果，手机演示仍保留原始抢话和行情卡流程。

新增预览：

- `duplex-five-case-xuhongdou-preview.html`
- Case 03《风会替你记得》
- Amoo 使用 `stepaudio-2.5-tts` + `lengyanyujie`
- 许红豆与历史语音可从固定本地音频库载入，并按同一时间轴替换
- 全程使用公共领域雨声，`01:34.500` 起渐强，但保持低于人声

## 本地配置

服务可以在未配置 TTS 的情况下启动和编辑。需要重新生成语音时，在仓库根目录创建 `.env`：

```bash
cp .env.example .env
```

然后在 `.env` 中填写 `STEP_API_KEY`。启动脚本会优先读取本目录 `.env`；若不存在，会自动回退读取同级 `双工html雕花/.env`。真实密钥不得提交到 Git。

## 运行

### 从飞书下载后的 macOS 首次运行

飞书下载的 `.command` 文件会被 macOS 自动标记为“来自互联网”。这会触发系统的隔离保护，双击时可能显示“文件已损坏”。这是系统拦截，不是模板损坏。

解压文件夹后，在“终端”中执行下面三行（把路径替换成模板文件夹的实际路径）：

```bash
cd "/你的路径/duplex-four-case-template"
xattr -dr com.apple.quarantine .
chmod +x 启动模板.command && ./启动模板.command
```

也可以先右键点击 `启动模板.command`，选择“打开”；如果系统仍拦截，到“系统设置 → 隐私与安全性”中允许本次打开。

在本目录启动统一服务：

```bash
VOICE_EDITOR_PORT=4179 node voice_editor_server.mjs
```

然后打开：

```text
http://127.0.0.1:4179/duplex-four-case-template.html
http://127.0.0.1:4179/duplex-five-case-xuhongdou-preview.html
```

直接双击 HTML 时，页面也会自动跳转到对应地址。服务同时提供 `/api/tts`、`/api/audio/upload`、`/api/audio/library`、`/api/export` 和编辑存档接口；点击“保存编辑”后，场景会写入同目录的 `annotation-edits.json`，刷新页面会自动恢复。

### 固定本地音频根目录

服务首次启动会自动创建：

```text
audio-library/
├── uploads/<case>/<segment>/   # 上传文件和浏览器真人录音
├── generated/<case>/           # 新生成的 TTS
└── reference/                  # 本机已有的参考音频
```

标注文件只保存 `audioKey`、`audioUrl`、片段参数和可选的响应关系（`responseAnchorId` / `responseGapMs`），不把大音频写进 JSON。使用音轨面板中的“导出成品 HTML”会读取这些本地文件并把所需音频嵌入单文件。

## 发布说明

当前页面属于编辑工程，依赖本地服务。`导出 JSON` 会生成 `dataset_v2` 标注数据；点击“导出成品 HTML”会保存当前标注，并把当前案例所需音频和界面资源固化为只读单文件，可直接外发。

## GitHub 分享

- `demo.html` 是音频已内嵌的单文件 Showcase，可直接分享或通过 GitHub Pages 打开。
- 为保护个人音频，公开 Demo 的用户声道使用结构占位；本地编辑器可接入自己的音频库。
- 编辑器需要在本地运行 `node voice_editor_server.mjs`；上传/录音写入本机 `audio-library/`。
- 个人 `annotation-edits.json`、浏览器录音和本地生成缓存不进入公开仓库；`annotation-edits.example.json` 仅作为数据结构示例。
