# Local Audio Library

This directory is the fixed local root for audio created by the annotation
project.

- `uploads/<case>/<segment>/` stores uploaded files and browser recordings.
- `generated/<case>/` stores newly generated TTS files.
- Browser recordings are normalized to 24 kHz mono WAV before binding when the
  source format can be decoded; the original MIME and stored MIME are kept in
  the adjacent metadata JSON.
- The editor stores only an `audioKey` and `audioUrl` in the annotation data.
- The share export resolves those local files and embeds them into one HTML file.

The server creates the subdirectories automatically on first launch. Keep this
directory local when publishing the source project; a standalone export embeds
the required audio and can be shared independently.

Set `VOICE_EDITOR_AUDIO_ROOT` before starting the server only when the local
deployment needs to place this fixed root elsewhere.
