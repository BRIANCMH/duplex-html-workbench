/* 风会替你记得 · Amoo、许红豆逐句音频与环境音索引。 */
const TTS_WIND_WILL_REMEMBER_AUDIO = {
  xhd_system_memory: './audio-library/reference/wind-will-remember/user/xhd_system_memory.wav',
  xhd_silence: './audio-library/reference/wind-will-remember/ambience/xhd-silence-10s.wav',
  xhd_u1: './audio-library/reference/wind-will-remember/user/xhd_u1.wav',
  xhd_u2: './audio-library/reference/wind-will-remember/user/xhd_u2.wav',
  xhd_u3: './audio-library/reference/wind-will-remember/user/xhd_u3.wav',
  xhd_u4: './audio-library/reference/wind-will-remember/user/xhd_u4.wav',
  xhd_u5: './audio-library/reference/wind-will-remember/user/xhd_u5.wav',
  xhd_u6: './audio-library/reference/wind-will-remember/user/xhd_u6.wav',
  xhd_u7: './audio-library/reference/wind-will-remember/user/xhd_u7.wav',
  xhd_u8: './audio-library/reference/wind-will-remember/user/xhd_u8.wav',
  xhd_u9: './audio-library/reference/wind-will-remember/user/xhd_u9.wav',
  xhd_u10: './audio-library/reference/wind-will-remember/user/xhd_u10.wav',
  xhd_u11: './audio-library/reference/wind-will-remember/user/xhd_u11.wav',
  xhd_u12: './audio-library/reference/wind-will-remember/user/xhd_u12.wav',
  xhd_u13: './audio-library/reference/wind-will-remember/user/xhd_u13.wav',
  xhd_rain: './audio-library/reference/wind-will-remember/ambience/rain-bed-197s.mp3',
  xhd_a1: './audio-library/reference/wind-will-remember/assistant/01-xhd_a1.wav',
  xhd_a2: './audio-library/reference/wind-will-remember/assistant/02-xhd_a2.wav',
  xhd_a3: './audio-library/reference/wind-will-remember/assistant/03-xhd_a3.wav',
  xhd_a4: './audio-library/reference/wind-will-remember/assistant/04-xhd_a4.wav',
  xhd_a5: './audio-library/reference/wind-will-remember/assistant/05-xhd_a5.wav',
  xhd_a6: './audio-library/reference/wind-will-remember/assistant/06-xhd_a6.wav',
  xhd_a7: './audio-library/reference/wind-will-remember/assistant/07-xhd_a7.wav',
  xhd_a8: './audio-library/reference/wind-will-remember/assistant/08-xhd_a8.wav',
  xhd_a9: './audio-library/reference/wind-will-remember/assistant/09-xhd_a9.wav',
  xhd_a10: './audio-library/reference/wind-will-remember/assistant/10-xhd_a10.wav',
  xhd_a11: './audio-library/reference/wind-will-remember/assistant/11-xhd_a11.wav',
  xhd_a12: './audio-library/reference/wind-will-remember/assistant/12-xhd_a12.wav',
  xhd_a13: './audio-library/reference/wind-will-remember/assistant/13-xhd_a13.wav',
  xhd_a14: './audio-library/reference/wind-will-remember/assistant/14-xhd_a14.wav'
};
/* 保留标注存档中的历史 -14dB 设置；播放时只抵消这段旧占位衰减。 */
const TTS_WIND_WILL_REMEMBER_GAIN_COMPENSATION_DB = {
  xhd_system_memory: 14
};
if (typeof TTS_CLIPS !== 'undefined') Object.assign(TTS_CLIPS, TTS_WIND_WILL_REMEMBER_AUDIO);
