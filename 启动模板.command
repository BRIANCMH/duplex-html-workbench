#!/bin/zsh

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

export VOICE_EDITOR_PORT=4179
node voice_editor_server.mjs &
SERVER_PID=$!

sleep 1
open "http://127.0.0.1:4179/duplex-four-case-template.html"
wait "$SERVER_PID"
