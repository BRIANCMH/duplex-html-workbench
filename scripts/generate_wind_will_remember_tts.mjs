import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const CASE_DIR = path.join(ROOT, 'cases', 'wind-will-remember');
const SOURCE_FILE = path.join(CASE_DIR, 'source', 'scene-data.json');
const OUTPUT_DIR = path.join(CASE_DIR, 'audio');
const MANIFEST_FILE = path.join(CASE_DIR, 'source', 'tts-manifest.json');
const MODEL = 'stepaudio-2.5-tts';
const API_URL = 'https://api.stepfun.com/v1/audio/speech';
const MIN_REQUEST_GAP_MS = 6600;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function probeDuration(file) {
  return Number(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file
  ], { encoding: 'utf8' }).trim());
}

async function synthesize(apiKey, payload) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data?.url) {
        throw new Error(data.error?.message || data.message || `TTS HTTP ${response.status}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await wait(String(error).includes('429') ? 65000 : attempt * 2500);
      }
    }
  }
  throw lastError;
}

async function downloadToFile(url, file) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio download HTTP ${response.status}`);
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await wait(attempt * 1800);
    }
  }
  throw lastError;
}

loadEnvFile(path.join(ROOT, '.env'));
const apiKey = String(process.env.STEP_API_KEY || '').trim();
if (!apiKey) throw new Error('Missing STEP_API_KEY in .env');

const scene = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
const assistantLines = scene.lines.filter(line => line.role === 'assistant');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const manifest = {
  caseId: scene.caseId,
  model: MODEL,
  voice: scene.voice,
  voiceLabel: scene.voiceLabel,
  sampleRate: 24000,
  loudnessTarget: '-18 LUFS',
  globalInstruction: scene.globalInstruction,
  generatedAt: new Date().toISOString(),
  lines: []
};

let lastRequestAt = 0;
for (const [index, line] of assistantLines.entries()) {
  const outputName = `${String(index + 1).padStart(2, '0')}-${line.key}.wav`;
  const output = path.join(OUTPUT_DIR, outputName);
  const temporary = path.join(OUTPUT_DIR, `.${line.key}.raw.wav`);
  const input = `${line.inline}${line.text}`;
  if (fs.existsSync(output) && fs.statSync(output).size > 44) {
    const duration = Number(probeDuration(output).toFixed(3));
    manifest.lines.push({
      key: line.key,
      text: line.text,
      inline: line.inline,
      inputChars: [...input].length,
      start: line.start,
      scriptedEnd: line.end,
      scriptedDuration: Number((line.end - line.start).toFixed(3)),
      generatedDuration: duration,
      speed: Number(line.speed || 1),
      audio: `audio/${outputName}`,
      subtitles: []
    });
    process.stdout.write(`[${index + 1}/${assistantLines.length}] ${line.key} existing ${duration.toFixed(3)}s\n`);
    continue;
  }
  const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
  if (waitMs) await wait(waitMs);

  process.stdout.write(`[${index + 1}/${assistantLines.length}] ${line.key} generating... `);
  lastRequestAt = Date.now();
  const response = await synthesize(apiKey, {
    model: MODEL,
    voice: scene.voice,
    input,
    instruction: scene.globalInstruction,
    response_format: 'wav',
    sample_rate: 24000,
    speed: Number(line.speed || 1),
    volume: 1,
    text_normalization: 'standard',
    pronunciation_map: { tone: ['Mia/米娅'] },
    return_url: true,
    timestamp: true
  });

  await downloadToFile(response.data.url, temporary);
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', temporary,
    '-af', 'loudnorm=I=-18:LRA=7:TP=-1.5',
    '-ar', '24000',
    '-ac', '1',
    '-c:a', 'pcm_s16le',
    output
  ]);
  fs.unlinkSync(temporary);

  const duration = Number(probeDuration(output).toFixed(3));
  manifest.lines.push({
    key: line.key,
    text: line.text,
    inline: line.inline,
    inputChars: [...input].length,
    start: line.start,
    scriptedEnd: line.end,
    scriptedDuration: Number((line.end - line.start).toFixed(3)),
    generatedDuration: duration,
    speed: Number(line.speed || 1),
    audio: `audio/${outputName}`,
    subtitles: response.data.subtitles || []
  });
  process.stdout.write(`${duration.toFixed(3)}s\n`);
}

fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`Manifest: ${MANIFEST_FILE}\n`);
