import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname);
const PUBLIC_ROOT = ROOT;
/* 本地部署统一使用这个固定音频根目录；上传、录音和新生成 TTS 都写入这里。 */
const AUDIO_LIBRARY_ROOT = process.env.VOICE_EDITOR_AUDIO_ROOT
  ? path.resolve(process.env.VOICE_EDITOR_AUDIO_ROOT)
  : path.join(PUBLIC_ROOT, 'audio-library');
const GENERATED_ROOT = path.join(AUDIO_LIBRARY_ROOT, 'generated');
const UPLOAD_ROOT = path.join(AUDIO_LIBRARY_ROOT, 'uploads');
const SCENES_FILE = path.join(ROOT, 'scenes.json');
const EDITS_FILE = process.env.VOICE_EDITOR_EDITS_FILE
  ? path.resolve(process.env.VOICE_EDITOR_EDITS_FILE)
  : path.join(ROOT, 'annotation-edits.json');
/* 分享模板使用独立端口，避免误连到原 Golden Case 服务。 */
const PORT = Number(process.env.VOICE_EDITOR_PORT || 4179);
const HOST = '127.0.0.1';
const VOICES = {
  assistant: 'elegantgentle-female',
  user: 'voice-tone-TfP7m5TSzY',
  windAssistant: 'lengyanyujie'
};
const SCENE_VOICE_CONFIG = {
  'wind-will-remember': {
    assistant: 'lengyanyujie',
    instruction: '现代都市夜雨中的情绪陪伴对话。成熟清冷的女性 Amoo，音色低亮度、干净，有可靠感，不甜不媚、不高傲、不带播音腔。情绪从低声关心和尊重边界，逐步转为稳妥接管事务；关键一句坚定但不高，结尾放轻。意图是承接情绪、清楚交付任务并保留决定权。'
  }
};
const sourceScenes = fs.existsSync(SCENES_FILE) ? JSON.parse(fs.readFileSync(SCENES_FILE, 'utf8')) : {
  stock: { roles: {
    assistant: { lines: Object.fromEntries(['sa0','sa1a','sa1','sa2a','sa2','sa3a','sa3','sa4a','sa4'].map(key => [key, {}])) },
    user: { lines: Object.fromEntries(['sq1','sq2','sq3','sq4','sq5'].map(key => [key, {}])) }
  } }
};
const apiKey = String(process.env.STEP_API_KEY || '').trim();
let lastRequestAt = 0;

fs.mkdirSync(GENERATED_ROOT, { recursive:true });
fs.mkdirSync(UPLOAD_ROOT, { recursive:true });

function ensureReferenceAudio() {
  const sourceRoot = path.join(PUBLIC_ROOT, 'cases', 'wind-will-remember', 'audio');
  const targetRoot = path.join(AUDIO_LIBRARY_ROOT, 'reference', 'wind-will-remember');
  const mappings = [
    ['xhd-silence-10s.wav', path.join('ambience', 'xhd-silence-10s.wav')],
    ['rain-bed-197s.mp3', path.join('ambience', 'rain-bed-197s.mp3')],
    ...Array.from({ length: 14 }, (_, index) => [
      `${String(index + 1).padStart(2, '0')}-xhd_a${index + 1}.wav`,
      path.join('assistant', `${String(index + 1).padStart(2, '0')}-xhd_a${index + 1}.wav`)
    ])
  ];
  for (const [sourceName, targetRelative] of mappings) {
    const source = path.join(sourceRoot, sourceName);
    const target = path.join(targetRoot, targetRelative);
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive:true });
    fs.copyFileSync(source, target);
  }
  const userRoot = path.join(sourceRoot, 'user-normalized');
  const targetUserRoot = path.join(targetRoot, 'user');
  if (fs.existsSync(userRoot)) {
    fs.mkdirSync(targetUserRoot, { recursive:true });
    for (const entry of fs.readdirSync(userRoot)) {
      const source = path.join(userRoot, entry);
      const target = path.join(targetUserRoot, entry);
      if (entry.endsWith('.wav') && fs.statSync(source).isFile() && !fs.existsSync(target)) fs.copyFileSync(source, target);
    }
  }
}
ensureReferenceAudio();

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.wav':'audio/wav',
  '.m4a':'audio/mp4',
  '.mp3':'audio/mpeg', '.webm':'audio/webm', '.ogg':'audio/ogg', '.aac':'audio/aac', '.flac':'audio/flac',
  '.ttf':'font/ttf', '.svg':'image/svg+xml'
};
const PRIVATE_FILES = new Set(['.env', 'goal-objective.md']);
const AUDIO_BODY_LIMIT = 96 * 1024 * 1024;
const AUDIO_REQUEST_LIMIT = Math.ceil(AUDIO_BODY_LIMIT * 4 / 3) + 2 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.webm', '.ogg', '.aac', '.flac']);
const AUDIO_MIME_EXTENSIONS = {
  'audio/wav':'.wav',
  'audio/x-wav':'.wav',
  'audio/wave':'.wav',
  'audio/mpeg':'.mp3',
  'audio/mp3':'.mp3',
  'audio/mp4':'.m4a',
  'audio/x-m4a':'.m4a',
  'audio/webm':'.webm',
  'audio/ogg':'.ogg',
  'audio/aac':'.aac',
  'audio/flac':'.flac'
};

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,HEAD,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function safePart(value) {
  return String(value || '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 100) || 'clip';
}

function safeAudioName(value) {
  const raw = path.basename(String(value || 'recording')).replace(/[^\w.-]+/g, '_').slice(0, 96);
  return raw || 'recording';
}

function audioExtension(name, mime) {
  const fromName = path.extname(String(name || '')).toLowerCase();
  if (AUDIO_EXTENSIONS.has(fromName)) return fromName;
  const baseMime = String(mime || '').toLowerCase().split(';', 1)[0].trim();
  return AUDIO_MIME_EXTENSIONS[baseMime] || '.webm';
}

function parseAudioPayload(body) {
  const raw = String(body?.data || body?.base64 || '').trim();
  if (!raw) throw new Error('音频内容为空');
  /* MediaRecorder 常带有 codecs 参数，例如 data:audio/webm;codecs=opus;base64,... */
  const match = raw.match(/^data:([^,]*);base64,(.*)$/is);
  const mime = String(body?.mime || (match && match[1]) || 'application/octet-stream').toLowerCase();
  const encoded = (match ? match[2] : raw).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('音频 Base64 格式无效');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length) throw new Error('音频内容为空');
  if (bytes.length > AUDIO_BODY_LIMIT) throw new Error('音频文件不能超过 96MB');
  const name = safeAudioName(body?.name || 'recording');
  const ext = audioExtension(name, mime);
  if (!AUDIO_EXTENSIONS.has(ext)) throw new Error('不支持的音频格式');
  return { bytes, mime, name, ext };
}

function audioLibraryUrl(file) {
  const relative = path.relative(AUDIO_LIBRARY_ROOT, file);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error('音频文件不在本地音频根目录内');
  }
  return `audio-library/${relative.split(path.sep).join('/')}`;
}

function probe(file) {
  try {
    return Number(execFileSync('ffprobe', [
      '-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file
    ], { encoding:'utf8' }).trim());
  } catch {
    return NaN;
  }
}

function normalizeAudio(source, output) {
  /* 保留 TTS 的自然语速和完整句尾；前端会用真实时长更新音轨区间。 */
  execFileSync('ffmpeg', [
    '-y','-hide_banner','-loglevel','error','-i',source,
    '-ar','24000','-ac','1','-c:a','pcm_s16le',output
  ], { stdio:'inherit' });
}

function roleFor(caseId, sourceKey, track) {
  const line = sourceScenes[caseId]?.roles
    ? Object.entries(sourceScenes[caseId].roles).flatMap(([role, spec]) =>
        Object.entries(spec.lines || {}).map(([key]) => ({ role, key })))
      .find(item => item.key === sourceKey)
    : null;
  return line?.role || track;
}

function voiceFor(caseId, role, requestedVoice = '') {
  if (requestedVoice && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(requestedVoice)) return requestedVoice;
  if (role === 'assistant' || role === 'assistant_backchannel') {
    return SCENE_VOICE_CONFIG[caseId]?.assistant || VOICES.assistant;
  }
  if (role === 'user') return VOICES.user;
  if (role === 'third_party' || role === 'other') {
    return sourceScenes[caseId]?.roles?.third_party?.voice
      || sourceScenes[caseId]?.roles?.other?.voice
      || VOICES.user;
  }
  return null;
}

function instructionFor(role, caseId, requestedInstruction = '') {
  if (requestedInstruction) return requestedInstruction;
  if (SCENE_VOICE_CONFIG[caseId]?.instruction && (role === 'assistant' || role === 'assistant_backchannel')) {
    return SCENE_VOICE_CONFIG[caseId].instruction;
  }
  if (role === 'assistant_backchannel') return '优雅温柔女声，极轻气声式附和，自然克制，不抢占对方话轮。';
  if (role === 'assistant') return '优雅温柔女声，普通话标准，自然口语，语速自然，保持同一人物。';
  if (role === 'user') return '自然真实的普通话口语，语速自然，保持同一人物。';
  if (role === 'third_party' || role === 'other') return '自然真实的第三方说话人，普通话标准，按场景自然表演。';
  return '自然真实的说话人，普通话标准，按场景自然表演。';
}

async function waitForSlot() {
  const waitMs = Math.max(0, 6500 - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

async function synthesize(text, voice, instruction, speed = 1, volume = 1, textNormalization = 'enhanced') {
  if (!apiKey) throw new Error('未配置 STEP_API_KEY，无法生成语音');
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await waitForSlot();
      const response = await fetch('https://api.stepfun.com/v1/audio/speech', {
        method:'POST',
        headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({
          model:'stepaudio-2.5-tts', voice, input:text, instruction,
          response_format:'wav', sample_rate:24000, speed, volume,
          text_normalization:textNormalization, return_url:true
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.data?.url) throw new Error(`生成请求失败 (${response.status})`);
      const audio = await fetch(payload.data.url);
      if (!audio.ok) throw new Error(`音频下载失败 (${audio.status})`);
      return Buffer.from(await audio.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, String(error).includes('429') ? 65000 : attempt * 2000));
    }
  }
  throw lastError;
}

async function readBody(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('请求内容过大');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleAudioUpload(req, res) {
  let rawOutput = '';
  let normalizedOutput = '';
  try {
    const body = await readBody(req, AUDIO_REQUEST_LIMIT);
    const payload = parseAudioPayload(body);
    const caseId = safePart(body.caseId || 'unassigned');
    const segmentId = safePart(body.segmentId || 'clip');
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(UPLOAD_ROOT, caseId, segmentId);
    fs.mkdirSync(dir, { recursive:true });
    const stem = safeAudioName(payload.name).replace(/\.[^.]+$/, '') || 'recording';
    rawOutput = path.join(dir, `${stamp}-source-${stem}${payload.ext}`);
    normalizedOutput = path.join(dir, `${stamp}-${stem}.wav`);
    fs.writeFileSync(rawOutput, payload.bytes);

    /* Chrome 的 WebM 录音常没有容器总时长；统一转 WAV 可稳定探测时长和播放。 */
    let output = normalizedOutput;
    let normalized = true;
    try {
      normalizeAudio(rawOutput, normalizedOutput);
    } catch {
      output = rawOutput;
      normalized = false;
    }
    let duration = probe(output);
    if (!Number.isFinite(duration) || duration < .01) {
      if (output !== rawOutput) {
        try { fs.unlinkSync(output); } catch {}
        output = rawOutput;
        normalized = false;
        duration = probe(output);
      }
    }
    if (!Number.isFinite(duration) || duration < .01) {
      for (const file of [rawOutput, normalizedOutput]) {
        if (file && fs.existsSync(file)) {
          try { fs.unlinkSync(file); } catch {}
        }
      }
      return json(res, 400, { ok:false, error:'无法解析该音频文件' });
    }
    if (normalized && rawOutput !== output && fs.existsSync(rawOutput)) {
      try { fs.unlinkSync(rawOutput); } catch {}
    }
    const audioKey = `local__${caseId}__${segmentId}__${stamp}`;
    const relative = audioLibraryUrl(output);
    const metadata = {
      audioKey,
      audioUrl:relative,
      name:payload.name,
      mime:payload.mime,
      bytes:payload.bytes.length,
      storedMime:MIME[path.extname(output).toLowerCase()] || payload.mime,
      normalized,
      duration:Number(duration.toFixed(3)),
      kind:String(body.kind || 'upload'),
      createdAt:new Date().toISOString()
    };
    fs.writeFileSync(`${output}.json`, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    return json(res, 200, { ok:true, ...metadata });
  } catch (error) {
    return json(res, 400, { ok:false, error:error?.message || '音频上传失败' });
  }
}

function listAudioLibrary(dir = AUDIO_LIBRARY_ROOT, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(dir, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...listAudioLibrary(absolute, relative));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;
    const metadataFile = `${absolute}.json`;
    let metadata = {};
    try { metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8')); } catch {}
    result.push({
      ...metadata,
      path:relative,
      url:`/audio-library/${relative.split(path.sep).join('/')}`,
      bytes:metadata.bytes || fs.statSync(absolute).size,
      modifiedAt:fs.statSync(absolute).mtime.toISOString()
    });
  }
  return result.sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

async function handleAudioLibrary(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const caseId = String(url.searchParams.get('caseId') || '').trim();
  const items = listAudioLibrary().filter(item => !caseId || item.path.split('/')[1] === caseId);
  return json(res, 200, { ok:true, root:'audio-library', items });
}

async function handleExport(req, res) {
  let temporaryAnnotations = '';
  try {
    const body = await readBody(req, 8 * 1024 * 1024);
    const caseId = safePart(body.caseId || 'wind-will-remember');
    const script = path.join(ROOT, 'scripts', 'build_wind_will_remember_standalone.mjs');
    if (!fs.existsSync(script)) return json(res, 500, { ok:false, error:'成品导出器不存在' });
    const annotations = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? body.data
      : null;
    const env = { ...process.env };
    if (annotations) {
      temporaryAnnotations = path.join(AUDIO_LIBRARY_ROOT, `.export-annotations-${process.pid}-${Date.now()}.json`);
      fs.writeFileSync(temporaryAnnotations, `${JSON.stringify(annotations, null, 2)}\n`, 'utf8');
      env.STANDALONE_ANNOTATIONS_FILE = temporaryAnnotations;
    }
    env.STANDALONE_CASE_ID = caseId;
    const labels = {
      stock:'股票查询',
      commute:'出门上班 · 打车',
      meeting:'会议纪要',
      'trip-planning':'出差规划 · 订票值机',
      'wind-will-remember':'风会替你记得'
    };
    const caseLabel = String(annotations?.[caseId]?.caseMeta?.label || labels[caseId] || caseId);
    env.STANDALONE_CASE_LABEL = caseLabel;
    execFileSync(process.execPath, [script], {
      cwd:ROOT,
      env,
      stdio:['ignore','pipe','pipe'],
      encoding:'utf8'
    });
    const safeLabel = caseLabel.replace(/[\\/:*?"<>|]/g, '-');
    const filename = `${safeLabel}｜单文件外发版.html`;
    const relative = `exports/${filename}`;
    if (!fs.existsSync(path.join(ROOT, relative))) {
      return json(res, 500, { ok:false, error:'成品导出失败，未生成 HTML' });
    }
    return json(res, 200, {
      ok:true,
      root:'audio-library',
      filename,
      downloadUrl:`/${relative}`,
      bytes:fs.statSync(path.join(ROOT, relative)).size
    });
  } catch (error) {
    return json(res, 500, { ok:false, error:error?.stderr || error?.message || '成品导出失败' });
  } finally {
    if (temporaryAnnotations && fs.existsSync(temporaryAnnotations)) {
      try { fs.unlinkSync(temporaryAnnotations); } catch {}
    }
  }
}

function readSavedAnnotations() {
  if (!fs.existsSync(EDITS_FILE)) return { data:null, updatedAt:null };
  const data = JSON.parse(fs.readFileSync(EDITS_FILE, 'utf8'));
  return { data, updatedAt:fs.statSync(EDITS_FILE).mtime.toISOString() };
}

async function handleAnnotations(req, res) {
  try {
    if (req.method === 'GET') return json(res, 200, { ok:true, ...readSavedAnnotations() });
    const body = await readBody(req, 8 * 1024 * 1024);
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return json(res, 400, { ok:false, error:'编辑数据格式无效' });
    }
    const temporary = `${EDITS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(body.data, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, EDITS_FILE);
    json(res, 200, { ok:true, updatedAt:fs.statSync(EDITS_FILE).mtime.toISOString() });
  } catch (error) {
    json(res, 500, { ok:false, error:error?.message || '保存编辑失败' });
  }
}

async function handleGenerate(req, res) {
  try {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    const caseId = safePart(body.caseId);
    const segmentId = safePart(body.segmentId);
    const sourceKey = safePart(body.sourceKey);
    const track = String(body.track || '');
    const requestedVoice = String(body.voice || '').trim();
    const requestedInstruction = String(body.instruction || '').trim();
    const requestedSpeed = Number(body.speed || 1);
    const requestedVolume = Number(body.volume || 1);
    const requestedNormalization = ['standard', 'enhanced'].includes(String(body.textNormalization || '').toLowerCase())
      ? String(body.textNormalization).toLowerCase()
      : 'enhanced';
    const targetDuration = Number(body.targetDuration);
    if (!text || text.length > 1000) return json(res, 400, { ok:false, error:'台词需为 1-1000 个字符' });
    if (!['user','assistant','third_party','other'].includes(track)) return json(res, 400, { ok:false, error:'仅语音片段支持生成' });
    if (!Number.isFinite(targetDuration) || targetDuration < .15 || targetDuration > 90) {
      return json(res, 400, { ok:false, error:'片段时长需在 0.15-90 秒之间' });
    }
    if (requestedInstruction.length > 200) {
      return json(res, 400, { ok:false, error:'instruction 需为 200 个字符以内' });
    }
    if (requestedVoice && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(requestedVoice)) {
      return json(res, 400, { ok:false, error:'voice 仅支持字母、数字、点、下划线和短横线' });
    }
    if (!Number.isFinite(requestedSpeed) || requestedSpeed < .5 || requestedSpeed > 2) {
      return json(res, 400, { ok:false, error:'speed 需在 0.5-2.0 之间' });
    }
    if (!Number.isFinite(requestedVolume) || requestedVolume < .1 || requestedVolume > 2) {
      return json(res, 400, { ok:false, error:'volume 需在 0.1-2.0 之间' });
    }
    const role = roleFor(caseId, sourceKey, track);
    const voice = voiceFor(caseId, role, requestedVoice);
    if (!voice) return json(res, 400, { ok:false, error:'未找到该角色的音色配置' });

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dir = path.join(GENERATED_ROOT, caseId);
    fs.mkdirSync(dir, { recursive:true });
    const raw = path.join(dir, `${segmentId}-${stamp}.raw.wav`);
    const output = path.join(dir, `${segmentId}-${stamp}.wav`);
    fs.writeFileSync(raw, await synthesize(
      text,
      voice,
      instructionFor(role, caseId, requestedInstruction),
      requestedSpeed,
      requestedVolume,
      requestedNormalization
    ));
    try {
      try { normalizeAudio(raw, output); }
      catch (error) { throw new Error('音频格式转换失败'); }
    } finally {
      if (fs.existsSync(raw)) fs.unlinkSync(raw);
    }
    const relative = audioLibraryUrl(output);
    const audioKey = `generated__${caseId}__${segmentId}__${stamp}`;
    json(res, 200, {
      ok:true, audioKey, audioUrl:`${relative}?v=${stamp}`, duration:Number(probe(output).toFixed(3)),
      voice, role, speed:requestedSpeed, volume:requestedVolume,
      textNormalization:requestedNormalization, generatedAt:new Date().toISOString()
    });
  } catch (error) {
    json(res, 500, { ok:false, error:error?.message || '生成失败' });
  }
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const requested = decodeURIComponent(url.pathname === '/' ? '/duplex-four-case-template.html' : url.pathname);
  const usesAudioLibrary = requested === '/audio-library' || requested.startsWith('/audio-library/');
  const root = usesAudioLibrary ? AUDIO_LIBRARY_ROOT : PUBLIC_ROOT;
  const rootedRequest = usesAudioLibrary ? requested.slice('/audio-library'.length) || '/' : requested;
  const file = path.resolve(root, `.${rootedRequest}`);
  if (file !== root && !file.startsWith(root + path.sep)) return json(res, 403, { ok:false, error:'禁止访问' });
  const relative = path.relative(root, file);
  if (relative.split(path.sep).some(part => part.startsWith('.') && part !== '..') || PRIVATE_FILES.has(path.basename(file))) {
    return json(res, 404, { ok:false, error:'文件不存在' });
  }
  if (usesAudioLibrary && !AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase())) {
    return json(res, 404, { ok:false, error:'文件不存在' });
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { ok:false, error:'文件不存在' });
  res.writeHead(200, {
    'Content-Type':MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length':fs.statSync(file).size,
    'Cache-Control':'no-cache',
    'Access-Control-Allow-Origin':'*'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET' && req.url?.startsWith('/api/health')) {
    return json(res, 200, { ok:true, voices:VOICES });
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/audio/library')) return handleAudioLibrary(req, res);
  if (req.method === 'POST' && req.url?.startsWith('/api/audio/upload')) return handleAudioUpload(req, res);
  if ((req.method === 'GET' || req.method === 'POST') && req.url?.startsWith('/api/annotations')) {
    return handleAnnotations(req, res);
  }
  if (req.method === 'POST' && req.url?.startsWith('/api/export')) return handleExport(req, res);
  if (req.method === 'POST' && req.url?.startsWith('/api/tts')) return handleGenerate(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveFile(req, res);
  json(res, 405, { ok:false, error:'不支持的请求方法' });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Voice editor ready: http://${HOST}:${PORT}/duplex-four-case-template.html\n`);
});
