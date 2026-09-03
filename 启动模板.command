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
  print "提示：未找到 STEP_API_KEY，播放和标注可用，但 TTS 生成不可用"
else
  print "已加载 Step TTS API Key（来源：${ENV_FILE})"
fi

export VOICE_EDITOR_PORT=4179
node voice_editor_server.mjs &
SERVER_PID=$!

sleep 1
open "http://127.0.0.1:4179/duplex-four-case-template.html"
wait "$SERVER_PID"
