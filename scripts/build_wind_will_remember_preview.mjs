import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const CASE_DIR = path.join(ROOT, 'cases', 'wind-will-remember');
const scene = JSON.parse(fs.readFileSync(path.join(CASE_DIR, 'source', 'scene-data.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(CASE_DIR, 'source', 'tts-manifest.json'), 'utf8'));
const assistantLines = scene.lines.filter(line => line.role === 'assistant');
const manifestByKey = Object.fromEntries(manifest.lines.map(line => [line.key, line]));
const output = path.join(CASE_DIR, 'audio', 'wind-will-remember-amoo-preview.mp3');
const rainDuration = Number(scene.duration);
const rainSwellAt = Number(scene.lines.find(line => line.key === 'xhd_a7')?.start || 0);
const rainSwellEnd = Number((rainSwellAt + 1.5).toFixed(3));

const args = [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', path.join(CASE_DIR, 'audio', `rain-bed-${Math.round(rainDuration)}s.mp3`)
];
for (const line of assistantLines) {
  args.push('-i', path.join(CASE_DIR, manifestByKey[line.key].audio));
}

const filters = [`[0:a]aresample=24000,atrim=0:${rainDuration.toFixed(3)}[rain]`];
const mixInputs = ['[rain]'];
assistantLines.forEach((line, index) => {
  const source = index + 1;
  const generatedDuration = Number(manifestByKey[line.key].generatedDuration);
  const slotDuration = Number((line.end - line.start).toFixed(3));
  const playDuration = line.key === 'xhd_a4'
    ? 8.1
    : Math.min(generatedDuration, slotDuration);
  const fade = line.key === 'xhd_a4'
    ? `,afade=t=out:st=${(playDuration - 1).toFixed(3)}:d=1`
    : '';
  const label = `voice${index}`;
  const delay = Math.round(line.start * 1000);
  filters.push(
    `[${source}:a]aresample=24000,atrim=0:${playDuration.toFixed(3)}${fade},adelay=${delay}:all=1[${label}]`
  );
  mixInputs.push(`[${label}]`);
});
filters.push(
  `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0,alimiter=limit=0.95:level=false[mix]`
);

args.push(
  '-filter_complex', filters.join(';'),
  '-map', '[mix]',
  '-t', String(scene.duration),
  '-ar', '24000',
  '-ac', '1',
  '-c:a', 'libmp3lame',
  '-b:a', '192k',
  output
);

execFileSync('ffmpeg', args, { stdio: 'inherit' });
process.stdout.write(`${output}\n`);
