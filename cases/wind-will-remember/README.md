# 风会替你记得

Case ID：`GC-EMO-003`

## 当前版本

- 14 段 Amoo 台词已逐句生成。
- 音色：`lengyanyujie`，成熟清冷女性。
- 模型：`stepaudio-2.5-tts`。
- 人声：24 kHz、单声道，约 -18 LUFS。
- 许红豆 13 段台词和开场历史语音已归一化并放入固定本地音频库。
- 雨声覆盖完整 197.123 秒时间轴，`01:37.623` 起渐强。

## 主要文件

- `audio/01-xhd_a1.wav` 至 `audio/14-xhd_a14.wav`：Amoo 独立音频源。
- `audio-library/reference/wind-will-remember/`：本地播放用的参考音频（服务启动时自动补齐）。
- `audio/rain-bed-197s.mp3`：处理后的完整雨声源。
- `audio/wind-will-remember-amoo-preview.mp3`：Amoo + 雨声的整轨试听。
- `source/scene-data.json`：台词、时间轴、Inline 提示词。
- `source/tts-manifest.json`：生成参数、时长和字幕信息。
- `source/rain-attribution.txt`：雨声来源和公共领域声明。
- 助手音轨可在标注编辑器中绑定某句用户语音，并用 `responseGapMs` 设置响应间隔（默认建议 `400ms`）。

## 重新生成

仓库根目录配置好 `.env` 后执行：

```bash
node scripts/generate_wind_will_remember_tts.mjs
node scripts/build_wind_will_remember_preview.mjs
```

## 后续替换许红豆音频

在音轨面板选择对应片段后，使用“上传音频”或“开始录音”。文件会落到项目根目录的 `audio-library/uploads/<case>/<segment>/`，保存标注后即可按同一时间轴播放和导出。
