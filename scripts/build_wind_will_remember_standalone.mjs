import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_HTML = path.join(ROOT, 'duplex-five-case-xuhongdou-preview.html');
const ANNOTATIONS = process.env.STANDALONE_ANNOTATIONS_FILE || path.join(ROOT, 'annotation-edits.json');
const DESKTOP = path.resolve(ROOT, '..');
const EXPORT_DIR = path.join(ROOT, 'exports');
const AUDIO_LIBRARY_ROOT = process.env.VOICE_EDITOR_AUDIO_ROOT
  ? path.resolve(process.env.VOICE_EDITOR_AUDIO_ROOT)
  : path.join(ROOT, 'audio-library');
const CASE_ID = process.env.STANDALONE_CASE_ID || 'wind-will-remember';
const CASE_LABELS = {
  stock:'股票查询',
  commute:'出门上班 · 打车',
  meeting:'会议纪要',
  'trip-planning':'出差规划 · 订票值机',
  'wind-will-remember':'风会替你记得'
};
const CASE_LABEL = process.env.STANDALONE_CASE_LABEL || CASE_LABELS[CASE_ID] || CASE_ID;
const FILE_LABEL = CASE_LABEL.replace(/[\\/:*?"<>|]/g, '-');
const OUTPUT = process.env.STANDALONE_OUTPUT_FILE || path.join(EXPORT_DIR, `${FILE_LABEL}｜单文件外发版.html`);
const DESKTOP_OUTPUT = process.env.STANDALONE_DESKTOP_OUTPUT_FILE || path.join(DESKTOP, `${FILE_LABEL}｜单文件外发版.html`);

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};

const USER_KEYS = ['xhd_system_memory', ...Array.from({ length: 13 }, (_, i) => `xhd_u${i + 1}`)];
const ASSISTANT_KEYS = Array.from({ length: 14 }, (_, i) => `xhd_a${i + 1}`);

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

async function base64(file) {
  return (await fs.readFile(file)).toString('base64');
}

async function dataUri(file) {
  return `data:${mimeFor(file)};base64,${await base64(file)}`;
}

async function firstExisting(paths) {
  for (const file of paths) {
    try {
      await fs.access(file);
      return file;
    } catch {}
  }
  return paths[0];
}

function resolveAudioUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /^(?:data:|https?:)/i.test(raw)) return null;
  const clean = decodeURIComponent(raw.split('?', 1)[0]).replace(/\\/g, '/');
  const libraryPrefix = clean.startsWith('/audio-library/')
    ? '/audio-library/'
    : clean.startsWith('audio-library/')
      ? 'audio-library/'
      : '';
  if (libraryPrefix) {
    const relative = clean.slice(libraryPrefix.length);
    const candidate = path.resolve(AUDIO_LIBRARY_ROOT, relative);
    if (candidate === AUDIO_LIBRARY_ROOT || candidate.startsWith(`${AUDIO_LIBRARY_ROOT}${path.sep}`)) return candidate;
    return null;
  }
  const candidate = path.resolve(ROOT, clean.replace(/^\/+/, ''));
  return candidate === ROOT || candidate.startsWith(`${ROOT}${path.sep}`) ? candidate : null;
}

function extractAudioObjects(source) {
  const result = {};
  const pattern = /const\s+(TTS_[A-Z0-9_]+)\s*=\s*(\{[\s\S]*?\});/g;
  for (const match of source.matchAll(pattern)) {
    try {
      Object.assign(result, vm.runInNewContext(`(${match[2]})`));
    } catch {}
  }
  return result;
}

function replaceRequired(source, pattern, replacement, label) {
  const next = typeof pattern === 'string' ? source.replace(pattern, replacement) : source.replace(pattern, replacement);
  if (next === source) throw new Error(`导出构建缺少目标：${label}`);
  return next;
}

async function build() {
  const [template, annotationText] = await Promise.all([
    fs.readFile(SOURCE_HTML, 'utf8'),
    fs.readFile(ANNOTATIONS, 'utf8'),
  ]);
  const annotationHash = hash(annotationText);
  const annotations = JSON.parse(annotationText);
  const selectedScene = annotations[CASE_ID];
  if (!selectedScene?.segments?.length) throw new Error(`最新标注存档中没有 ${CASE_ID} 数据`);

  const audioRoot = path.join(ROOT, 'cases', CASE_ID, 'audio');
  const libraryRoot = path.join(AUDIO_LIBRARY_ROOT, 'reference', CASE_ID);
  const audioFiles = {};
  if (CASE_ID === 'wind-will-remember') {
    Object.assign(audioFiles, {
      xhd_silence: await firstExisting([
        path.join(libraryRoot, 'ambience', 'xhd-silence-10s.wav'),
        path.join(audioRoot, 'xhd-silence-10s.wav')
      ]),
      xhd_rain: await firstExisting([
        path.join(libraryRoot, 'ambience', 'rain-bed-197s.mp3'),
        path.join(audioRoot, 'rain-bed-197s.mp3')
      ]),
    });
    for (const key of USER_KEYS) {
      audioFiles[key] = await firstExisting([
        path.join(libraryRoot, 'user', `${key}.wav`),
        path.join(audioRoot, 'user-normalized', `${key}.wav`),
        path.join(audioRoot, 'user', `${key}.m4a`)
      ]);
    }
    for (const key of ASSISTANT_KEYS) {
      const number = String(Number(key.slice(5))).padStart(2, '0');
      audioFiles[key] = await firstExisting([
        path.join(libraryRoot, 'assistant', `${number}-${key}.wav`),
        path.join(audioRoot, `${number}-${key}.wav`)
      ]);
    }
  }

  const generatedFiles = {};
  for (const segment of selectedScene.segments) {
    if (!String(segment.audioKey || '').startsWith('generated__') || !segment.audioUrl) continue;
    const file = resolveAudioUrl(segment.audioUrl);
    if (file) generatedFiles[segment.audioKey] = file;
  }
  for (const segment of selectedScene.segments) {
    const key = String(segment.audioKey || '').trim();
    const candidate = resolveAudioUrl(segment.audioUrl);
    if (!key || !candidate || audioFiles[key]) continue;
    audioFiles[key] = candidate;
  }
  for (const [key, file] of Object.entries(generatedFiles)) audioFiles[key] = file;

  const audioMap = {};
  for (const [key, file] of Object.entries(audioFiles)) {
    try {
      await fs.access(file);
    } catch {
      throw new Error(`缺少音频资源：${file}`);
    }
    audioMap[key] = await base64(file);
  }

  const iconDir = path.join(ROOT, 'assets', 'icons');
  const iconNames = (await fs.readdir(iconDir)).filter(name => name.endsWith('.png')).sort();
  const iconData = {};
  for (const name of iconNames) iconData[name] = await dataUri(path.join(iconDir, name));

  const staticAssets = {
    'assets/gradient.jpg': await dataUri(path.join(ROOT, 'assets', 'gradient.jpg')),
    'assets/fonts/SFRailTime-Black.ttf': await dataUri(path.join(ROOT, 'assets', 'fonts', 'SFRailTime-Black.ttf')),
  };
  for (const [name, uri] of Object.entries(iconData)) staticAssets[`assets/icons/${name}`] = uri;

  const [legacyClips, legacyNewAudio] = await Promise.all([
    fs.readFile(path.join(ROOT, 'assets', 'tts', 'clips.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'assets', 'tts', 'new-audio.js'), 'utf8')
  ]);
  const legacyAudio = {
    ...extractAudioObjects(legacyClips),
    ...extractAudioObjects(legacyNewAudio)
  };
  const requiredKeys = new Set();
  selectedScene.segments.forEach(segment => {
    if (segment.audioKey) requiredKeys.add(String(segment.audioKey));
    if (segment.source) requiredKeys.add(String(segment.source));
  });
  for (const key of requiredKeys) {
    if (audioMap[key] || !legacyAudio[key]) continue;
    audioMap[key] = legacyAudio[key];
  }
  const standaloneAnnotations = { [CASE_ID]: selectedScene };
  const audioScript = `<script>
const TTS_CLIPS = ${jsonForScript(audioMap)};
const STANDALONE_EXPORT = true;
const STANDALONE_EXPORT_DATA = ${jsonForScript(standaloneAnnotations)};
const STANDALONE_LOCAL_AUDIO = TTS_CLIPS;
const TTS_WIND_WILL_REMEMBER_AUDIO = TTS_CLIPS;
const TTS_WIND_WILL_REMEMBER_GAIN_COMPENSATION_DB = { xhd_system_memory: 14 };
</script>`;

  let html = template;
  html = replaceRequired(html, /<title>[^<]*<\/title>/, `<title>${CASE_LABEL} · 单文件外发版</title>`, '页面标题');
  html = replaceRequired(html, /<body(?:\s[^>]*)?>/, '<body class="standalone-export">', 'body 标记');
  html = replaceRequired(
    html,
    /<script src="assets\/tts\/clips\.js\?v=48"><\/script>\s*<script src="assets\/tts\/new-audio\.js"><\/script>\s*<script src="assets\/tts\/wind-will-remember-audio\.js"><\/script>/,
    audioScript,
    '外部音频脚本',
  );
  html = html.replace(/<script src="assets\/annotation-workbench-media\.js"><\/script>/g, '');
  html = html.replace(
    /let currentCase = '[^']+';/,
    `let currentCase = ${JSON.stringify(CASE_ID)};`
  );

  html = html.replace(
    /\/\* file:\/\/ 的浏览器存储并不稳定；本地服务可用时统一切到固定 HTTP 源。 \*\/\s*if \(location\.protocol === 'file:'\) \{[\s\S]*?\n\}/,
    '/* 单文件外发版：所有资源已内嵌，不跳转本地服务。 */',
  );

  html = replaceRequired(
    html,
    'const $ = s => document.querySelector(s);',
    `const INLINE_ICON_DATA = ${jsonForScript(iconData)};
const $ = s => document.querySelector(s);`,
    '动态图标内嵌映射',
  );
  html = replaceRequired(
    html,
    'src="assets/icons/${icon}.png"',
    'src="${INLINE_ICON_DATA[icon] || INLINE_ICON_DATA[\'alert.png\']}"',
    '动态图标路径',
  );

  html = html.replace(
    'const raw = readStorageValue(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(readStorageValue).find(Boolean);',
    'const raw = typeof STANDALONE_EXPORT_DATA !== "undefined" ? JSON.stringify(STANDALONE_EXPORT_DATA) : readStorageValue(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(readStorageValue).find(Boolean);',
  );
  html = html.replace(
    "async function restorePersistentFile() {\n    if (location.protocol === 'file:') return;",
    "async function restorePersistentFile() {\n    if (typeof STANDALONE_EXPORT !== 'undefined' && STANDALONE_EXPORT || location.protocol === 'file:') return;",
  );
  html = html.replace(
    `function persist() {
    try {
      return writeStorageValue(JSON.stringify(data));`,
    `function persist() {
    if (typeof STANDALONE_EXPORT !== 'undefined' && STANDALONE_EXPORT) return true;
    try {
      return writeStorageValue(JSON.stringify(data));`,
  );
  html = html.replace(
    `if (!item?.audioKey || !item?.audioUrl) return;
    TTS_GENERATED_SOURCES[item.audioKey] = resolveGeneratedAudioUrl(item.audioUrl);`,
    `if (!item?.audioKey) return;
    if (typeof STANDALONE_LOCAL_AUDIO !== 'undefined' && STANDALONE_LOCAL_AUDIO[item.audioKey]) {
      TTS_GENERATED_SOURCES[item.audioKey] = STANDALONE_LOCAL_AUDIO[item.audioKey];
      return;
    }
    if (!item.audioUrl) return;
    TTS_GENERATED_SOURCES[item.audioKey] = resolveGeneratedAudioUrl(item.audioUrl);`,
  );

  /* 外发版只保留当前案例，避免切换到未随本次导出固化的工作区。 */
  html = html.replace(/<button class="case-card(?: active)?" data-case="([^"]+)"/g, (match, id) => {
    if (id === CASE_ID) return `<button class="case-card active" data-case="${id}"`;
    return `<button class="case-card" data-case="${id}" style="display:none"`;
  });
  html = html.replace(
    'Amoo 与许红豆音频已载入 · 全程雨声随时间轴同步',
    'Amoo 与许红豆音频已内嵌 · 最新标注时码 · 全程雨声随时间轴同步',
  );
  html = html.replace('自动保存中', '单文件只读外发版');

  const readOnlyCss = `<style data-standalone-export>
body.standalone-export #awUndo,
body.standalone-export #awExtend,
body.standalone-export #awImportScript,
body.standalone-export .aw-case-picker,
body.standalone-export #awAddLayer,
body.standalone-export #awExport,
body.standalone-export #awSave,
body.standalone-export #awReset,
body.standalone-export .aw-help,
body.standalone-export .aw-editor { display:none !important; }
body.standalone-export #awPlay { display:inline-flex; }
</style>`;
  html = html.replace('</head>', `${readOnlyCss}\n</head>`);

  for (const [relative, uri] of Object.entries(staticAssets)) html = html.replaceAll(relative, uri);

  const externalScripts = [...html.matchAll(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/g)];
  if (externalScripts.length) {
    throw new Error(`仍有外部脚本未内嵌：${externalScripts.map(match => match[0]).join(', ')}`);
  }
  const unresolved = [...new Set([
    ...[...html.matchAll(/(?:src|href)=["'](?!data:|#|javascript:)([^"']+)["']/g)].map(match => match[1]),
    ...[...html.matchAll(/url\(\s*["']?(?!data:|#)([^)"']+)["']?\s*\)/g)].map(match => match[1]),
  ])].filter(value =>
    !value.startsWith('http://') &&
    !value.startsWith('https://') &&
    !value.startsWith('${') &&
    !value.includes('INLINE_ICON_DATA'),
  );
  if (unresolved.length) throw new Error(`仍有外部资源未内嵌：${unresolved.join(', ')}`);

  await fs.mkdir(EXPORT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT, html, 'utf8');
  if (DESKTOP_OUTPUT && path.resolve(DESKTOP_OUTPUT) !== path.resolve(OUTPUT)) {
    await fs.copyFile(OUTPUT, DESKTOP_OUTPUT);
  }

  const annotationAfter = await fs.readFile(ANNOTATIONS, 'utf8');
  if (hash(annotationAfter) !== annotationHash) {
    throw new Error('导出期间 annotation-edits.json 发生变化，已停止交付');
  }

  console.log(OUTPUT);
  console.log(DESKTOP_OUTPUT);
  console.log(`bytes=${(await fs.stat(OUTPUT)).size}`);
  console.log(`audio_keys=${Object.keys(audioMap).length}`);
  console.log(`case_id=${CASE_ID}`);
  console.log(`segments=${selectedScene.segments.length}`);
  console.log(`annotation_sha256=${annotationHash}`);
}

await build();
