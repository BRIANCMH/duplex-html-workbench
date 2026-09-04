#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" && -f "$SCRIPT_DIR/../双工html雕花/.env" ]]; then
  ENV_FILE="$SCRIPT_DIR/../双工html雕花/.env"
fi
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${STEP_API_KEY:-}" ]]; then
  print "提示：未找到 STEP_API_KEY，播放、录音和标注可用，但 TTS 生成不可用"
else
  print "已加载 Step TTS API Key（来源：${ENV_FILE})"
fi

export VOICE_EDITOR_PORT="${VOICE_EDITOR_PORT:-4179}"
ENTRY_PAGE="duplex-five-case-xuhongdou-preview.html"

if ! command -v node >/dev/null 2>&1; then
  print "错误：未找到 Node.js，无法启动可编辑工作台"
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  print "提示：未找到 ffmpeg/ffprobe，录音会保留浏览器原始格式；安装后可获得更稳定的 WAV 转换"
fi

# 4179 is the documented default. If another local service occupies it,
# choose the first free port so the editor remains reachable. This uses Node
# rather than nc because a minimal macOS installation may not expose nc.
port_in_use() {
  node -e '
    const net = require("node:net");
    const port = Number(process.argv[1]);
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); process.exit(0); });
    socket.once("error", () => process.exit(1));
    setTimeout(() => process.exit(1), 350);
  ' "$1" >/dev/null 2>&1
}
if port_in_use "$VOICE_EDITOR_PORT"; then
  for candidate in 4180 4377 4390 4400 4401 4402 4403 4404 4405; do
    if ! port_in_use "$candidate"; then
      export VOICE_EDITOR_PORT="$candidate"
      break
    fi
  done
fi

LOG_FILE="$SCRIPT_DIR/voice-editor.log"
node voice_editor_server.mjs >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for attempt in {1..30}; do
  if curl -fsS "http://127.0.0.1:${VOICE_EDITOR_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep .25
done
if ! curl -fsS "http://127.0.0.1:${VOICE_EDITOR_PORT}/api/health" >/dev/null 2>&1; then
  print "错误：本地工作台服务启动失败，请查看：${LOG_FILE}"
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

print "已启动可编辑工作台：${ENTRY_PAGE}"
print "录音、新建 Case、导入 Markdown、逐条 TTS 和保存编辑均在此页面使用"
print "当前地址：http://127.0.0.1:${VOICE_EDITOR_PORT}/${ENTRY_PAGE}"
open "http://127.0.0.1:${VOICE_EDITOR_PORT}/${ENTRY_PAGE}"
wait "$SERVER_PID"
