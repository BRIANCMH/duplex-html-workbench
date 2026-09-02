# 风会替你记得 · 音频制作说明

- Amoo：`lengyanyujie`（冷艳御姐），`stepaudio-2.5-tts`
- Global Context 与每句 Inline Context 按 `Step_Audio_TTS2.5_提示词撰写助手_系统指令.md` 编写。
- 14 段 Amoo 台词逐句独立生成，24 kHz 单声道，统一到约 -18 LUFS。
- 许红豆与历史语音使用 `audio-library/reference/wind-will-remember/user/` 下的本地音频；替换真人音频时只需更新对应 segment 的 `audioKey` / `audioUrl`。
- 雨声从 0:00 持续到 3:17.123；01:37.623 开始 1.5 秒渐强，之后保持较明显但低于人声的背景电平。
