/* 语音标注工作台的本地媒体能力：上传、电脑录音与成品 HTML 导出。 */
(function () {
  'use strict';

  const root = document.getElementById('annotationWorkbench');
  const api = () => window.annotationWorkbenchApi;
  if (!root || !api()) return;

  const AUDIO_TRACKS = new Set(['user', 'assistant', 'third_party', 'other', 'background', 'taskAudio']);
  const $ = selector => root.querySelector(selector);
  const apiBase = () => location.protocol === 'file:' ? 'http://127.0.0.1:4179' : location.origin;
  let recorder = null;
  let recorderStream = null;
  let recorderChunks = [];
  let recorderTimer = null;
  let recorderStartedAt = 0;
  let recorderTarget = null;

  const style = document.createElement('style');
  style.textContent = `
    .aw-media-panel {
      grid-column: 1 / -1;
      display: grid;
      gap: 8px;
      padding: 10px 0 2px;
      border-top: 1px solid var(--line);
    }
    .aw-media-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      color: var(--ink-dim);
      font-size: 10.5px;
    }
    .aw-media-head small { color: var(--ink-mute); font-size: 9.5px; }
    .aw-media-actions { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
    .aw-media-actions .aw-btn { white-space: nowrap; }
    .aw-media-status {
      min-width: 0;
      color: var(--ink-soft);
      font-size: 10.5px;
      line-height: 1.4;
    }
    .aw-media-status.ready { color: #9ce0c2; }
    .aw-media-status.recording { color: #ffb39d; }
    .aw-media-status.error { color: var(--rose); }
    .aw-media-root {
      color: var(--ink-mute);
      font-size: 10px;
      white-space: nowrap;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 5px 8px;
    }
    @media (max-width: 760px) {
      .aw-media-actions { align-items: stretch; }
      .aw-media-actions .aw-btn { flex: 1; }
      .aw-media-status { width: 100%; }
    }
  `;
  document.head.appendChild(style);

  function selected() {
    return typeof api().getSelected === 'function'
      ? api().getSelected()
      : null;
  }

  function caseId() {
    return typeof api().getCaseId === 'function'
      ? api().getCaseId()
      : 'wind-will-remember';
  }

  function setStatus(text, state = '') {
    const status = $('#awMediaStatus');
    if (!status) return;
    status.textContent = text;
    status.className = `aw-media-status${state ? ` ${state}` : ''}`;
  }

  function updateRecordButtons() {
    const start = $('#awRecordAudio');
    const stop = $('#awStopRecord');
    if (!start || !stop) return;
    const recording = !!recorder;
    start.disabled = recording;
    stop.disabled = !recording;
    start.textContent = recording ? '录音中…' : '开始录音';
  }

  function stopRecorderTimer() {
    if (recorderTimer) clearInterval(recorderTimer);
    recorderTimer = null;
  }

  function recordingLabel() {
    const elapsed = Math.max(0, Math.floor((Date.now() - recorderStartedAt) / 1000));
    return `录音中 · ${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('无法读取音频'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  function blobDuration(blob) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const audio = document.createElement('audio');
      const done = value => {
        URL.revokeObjectURL(url);
        audio.removeAttribute('src');
        resolve(Number.isFinite(value) && value > 0 ? value : null);
      };
      const timer = setTimeout(() => done(null), 4000);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        done(Number(audio.duration));
      };
      audio.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      audio.src = url;
    });
  }

  async function uploadBlob(blob, name, kind, target = null) {
    const item = selected();
    const targetCaseId = target?.caseId || caseId();
    const targetSegmentId = target?.segmentId || item?.id;
    if (!targetSegmentId) throw new Error('请先选择一段音轨');
    if (!blob || blob.size < 1) throw new Error('音频内容为空');
    setStatus('正在写入本地音频库…');
    const measuredDuration = Number(target?.duration) || await blobDuration(blob);
    const response = await fetch(`${apiBase()}/api/audio/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId: targetCaseId,
        segmentId: targetSegmentId,
        name: name || 'recording.webm',
        mime: blob.type || 'application/octet-stream',
        data: await blobToDataUrl(blob),
        kind,
        duration: Number.isFinite(measuredDuration) ? measuredDuration : null
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || `上传失败 (${response.status})`);
    if (typeof api().attachAudio !== 'function') {
      throw new Error('当前页面未启用音频片段绑定能力');
    }
    api().attachAudio(targetSegmentId, payload, targetCaseId);
    setStatus(`已写入 audio-library · ${Number(payload.duration || 0).toFixed(2)}s；点击“保存编辑”写入标注`, 'ready');
    return payload;
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      await uploadBlob(file, file.name, 'upload');
    } catch (error) {
      setStatus(error?.message || '上传失败', 'error');
    }
  }

  function chooseRecorderMime() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return [
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/webm'
    ].find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function startRecording() {
    if (recorder) return;
    const item = selected();
    if (!item) {
      setStatus('请先选择一段音轨', 'error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus('当前浏览器不支持电脑录音', 'error');
      return;
    }
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      setStatus('录音需要通过本地 Workbench 服务打开，不能直接双击外发 HTML', 'error');
      return;
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      setStatus('录音需要安全来源，请从 localhost 或 HTTPS 地址打开', 'error');
      return;
    }
    try {
      recorderTarget = { caseId: caseId(), segmentId: item.id };
      try {
        recorderStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      } catch (firstError) {
        /* 部分浏览器不接受高级约束，回退到普通麦克风权限请求。 */
        recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const mimeType = chooseRecorderMime();
      recorder = mimeType ? new MediaRecorder(recorderStream, { mimeType }) : new MediaRecorder(recorderStream);
      const activeRecorder = recorder;
      recorderChunks = [];
      recorderStartedAt = Date.now();
      recorder.ondataavailable = event => {
        if (event.data?.size) recorderChunks.push(event.data);
      };
      recorder.onerror = event => {
        setStatus(event.error?.message || '录音失败', 'error');
        stopRecording();
      };
      recorder.onstop = async () => {
        const type = activeRecorder.mimeType || mimeType || 'audio/webm';
        const chunks = recorderChunks.slice();
        const target = recorderTarget;
        const blob = new Blob(chunks, { type });
        const duration = Math.max(.05, (Date.now() - recorderStartedAt) / 1000);
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        recorder = null;
        recorderTarget = null;
        recorderChunks = [];
        updateRecordButtons();
        stopRecorderTimer();
        try {
          await uploadBlob(blob, `recording.${extension}`, 'recording', { ...target, duration });
        } catch (error) {
          setStatus(error?.message || '录音上传失败', 'error');
        }
      };
      recorder.start(120);
      updateRecordButtons();
      setStatus(recordingLabel(), 'recording');
      recorderTimer = setInterval(() => setStatus(recordingLabel(), 'recording'), 500);
    } catch (error) {
      if (recorderStream) recorderStream.getTracks().forEach(track => track.stop());
      recorderStream = null;
      recorder = null;
      recorderTarget = null;
      updateRecordButtons();
      const name = String(error?.name || '');
      const message = name === 'NotAllowedError' || name === 'SecurityError'
        ? '麦克风权限被拒绝，请在浏览器地址栏或网站设置中允许麦克风后重试'
        : name === 'NotFoundError'
          ? '没有检测到可用麦克风，请检查系统输入设备'
          : error?.message || '未获得麦克风权限';
      setStatus(message, 'error');
    }
  }

  function stopRecording() {
    stopRecorderTimer();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (recorderStream) recorderStream.getTracks().forEach(track => track.stop());
    recorderStream = null;
    updateRecordButtons();
  }

  async function exportHtml() {
    const button = document.getElementById('awExportHtml');
    if (!button) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = '导出中…';
    try {
      if (typeof api().save === 'function') {
        const saved = await api().save();
        if (!saved) throw new Error('请先通过本地服务保存当前标注');
      }
      const data = typeof api().exportData === 'function'
        ? api().exportData()
        : null;
      const response = await fetch(`${apiBase()}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseId(), data })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || `导出失败 (${response.status})`);
      const fileResponse = await fetch(`${apiBase()}${payload.downloadUrl}?v=${Date.now()}`);
      if (!fileResponse.ok) throw new Error(`成品下载失败 (${fileResponse.status})`);
      const fileBlob = await fileResponse.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(fileBlob);
      link.download = payload.filename || 'duplex-showcase.html';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setStatus(`已导出单文件 HTML · ${(Number(payload.bytes || 0) / 1024 / 1024).toFixed(1)}MB`, 'ready');
    } catch (error) {
      setStatus(error?.message || '成品导出失败', 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function ensureFileInput() {
    let input = document.getElementById('awMediaFile');
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'awMediaFile';
    input.accept = 'audio/*';
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      handleFile(file);
    });
    root.appendChild(input);
    return input;
  }

  function ensureExportButton() {
    const actions = root.querySelector('.aw-actions');
    if (!actions || document.getElementById('awExportHtml')) return;
    const button = document.createElement('button');
    button.className = 'aw-btn primary';
    button.id = 'awExportHtml';
    button.type = 'button';
    button.title = '导出音频内嵌的单文件 HTML';
    button.textContent = '导出成品 HTML';
    button.addEventListener('click', exportHtml);
    const save = actions.querySelector('#awSave');
    actions.insertBefore(button, save || null);
    const rootBadge = document.createElement('span');
    rootBadge.className = 'aw-media-root';
    rootBadge.textContent = 'audio-library';
    actions.insertBefore(rootBadge, button);
  }

  function renderMediaPanel() {
    const editor = root.querySelector('#awEditor');
    if (!editor) return;
    const item = selected();
    const old = editor.querySelector('.aw-media-panel');
    if (!item || !AUDIO_TRACKS.has(item.track)) {
      if (old) old.remove();
      return;
    }
    if (old && old.dataset.segmentId === item.id && old.dataset.caseId === caseId()) return;
    if (old) old.remove();
    const panel = document.createElement('div');
    panel.className = 'aw-media-panel';
    panel.dataset.segmentId = item.id;
    panel.dataset.caseId = caseId();
    const sourceLabel = item.audioUrl || item.audioKey || item.source || '未绑定';
    panel.innerHTML = `
      <div class="aw-media-head"><span>本地音频</span><small>audio-library · ${String(item.track)}</small></div>
      <div class="aw-media-actions">
        <button class="aw-btn" id="awUploadAudio" type="button">上传音频</button>
        <button class="aw-btn" id="awRecordAudio" type="button">开始录音</button>
        <button class="aw-btn" id="awStopRecord" type="button" disabled>停止录音</button>
        <button class="aw-btn" id="awPreviewLocal" type="button"${item.audioKey || item.source ? '' : ' disabled'}>试听片段</button>
        <span class="aw-media-status" id="awMediaStatus">当前：${String(sourceLabel).slice(0, 90)}</span>
      </div>`;
    editor.appendChild(panel);
    const fileInput = ensureFileInput();
    panel.querySelector('#awUploadAudio').addEventListener('click', () => fileInput.click());
    panel.querySelector('#awRecordAudio').addEventListener('click', startRecording);
    panel.querySelector('#awStopRecord').addEventListener('click', stopRecording);
    panel.querySelector('#awPreviewLocal').addEventListener('click', () => {
      if (typeof api().previewAudio === 'function') {
        api().previewAudio().catch(error => setStatus(error?.message || '试听失败', 'error'));
      }
    });
    updateRecordButtons();
  }

  const editorObserver = new MutationObserver(() => {
    ensureExportButton();
    renderMediaPanel();
  });
  editorObserver.observe(root, { childList: true, subtree: true });
  ensureExportButton();
  renderMediaPanel();
  window.annotationWorkbenchMedia = {
    uploadBlob,
    startRecording,
    stopRecording,
    exportHtml
  };
})();
