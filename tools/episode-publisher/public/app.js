const form = document.getElementById('episodeForm');
const previewBtn = document.getElementById('previewBtn');
const publishBtn = document.getElementById('publishBtn');
const formStatus = document.getElementById('formStatus');
const previewPanel = document.getElementById('previewPanel');
const previewArticle = document.getElementById('previewArticle');
const dryRunBadge = document.getElementById('dryRunBadge');
const audioInput = document.getElementById('audio');
const coverInput = document.getElementById('cover');
const bodyImagesInput = document.getElementById('bodyImages');
const bodyInput = document.getElementById('body');
const durationInput = document.getElementById('duration');

/** @type {string|null} */
let previewToken = null;
/** @type {Array<{ filename: string, path: string, src: string }>} */
let stagedImages = [];
/** @type {string|null} */
let coverObjectUrl = null;
/** @type {string|null} */
let audioObjectUrl = null;

function setStatus(message, kind = '') {
  formStatus.textContent = message;
  formStatus.className = `status ${kind}`.trim();
}

function fieldValues() {
  const fd = new FormData(form);
  return {
    number: String(fd.get('number') || ''),
    year: String(fd.get('year') || ''),
    month: String(fd.get('month') || '').padStart(2, '0'),
    date: String(fd.get('date') || ''),
    title: String(fd.get('title') || ''),
    imageCaption: String(fd.get('imageCaption') || ''),
    period: String(fd.get('period') || ''),
    periodName: String(fd.get('periodName') || ''),
    tags: String(fd.get('tags') || ''),
    duration: String(fd.get('duration') || ''),
    body: String(fd.get('body') || '').replace(/\r\n/g, '\n'),
  };
}

function invalidatePreview() {
  previewToken = null;
  publishBtn.disabled = true;
}

for (const el of form.querySelectorAll('input, textarea')) {
  el.addEventListener('input', invalidatePreview);
  el.addEventListener('change', invalidatePreview);
}

async function loadDefaults() {
  const res = await fetch('/api/defaults');
  const data = await res.json();
  document.getElementById('number').value = data.number;
  document.getElementById('year').value = data.year;
  document.getElementById('month').value = data.month;
  document.getElementById('date').value = data.date;
  if (data.dryRun) dryRunBadge.classList.remove('hidden');
}

audioInput.addEventListener('change', async () => {
  invalidatePreview();
  const file = audioInput.files?.[0];
  if (!file) return;
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
  audioObjectUrl = URL.createObjectURL(file);
  setStatus('קורא משך מהקובץ...');
  const fd = new FormData();
  fd.append('audio', file);
  try {
    const res = await fetch('/api/duration', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'duration failed');
    durationInput.value = data.duration;
    durationInput.readOnly = true;
    setStatus(`משך: ${data.duration}`);
  } catch (err) {
    durationInput.readOnly = false;
    setStatus(`לא הצלחתי לקרוא משך — הזן ידנית. (${err.message})`, 'error');
  }
});

coverInput.addEventListener('change', () => {
  invalidatePreview();
  const file = coverInput.files?.[0];
  if (!file) return;
  if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  coverObjectUrl = URL.createObjectURL(file);
});

bodyImagesInput.addEventListener('change', async () => {
  invalidatePreview();
  const files = [...(bodyImagesInput.files || [])];
  if (!files.length) return;
  const values = fieldValues();
  for (const file of files) {
    const fd = new FormData();
    fd.append('year', values.year);
    fd.append('month', values.month);
    fd.append('number', values.number);
    fd.append('image', file);
    const res = await fetch('/api/image', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || 'image upload failed', 'error');
      continue;
    }
    stagedImages.push({ filename: data.filename, path: data.stagingPath, src: data.src });
    insertAtCursor(bodyInput, `${data.markdown}\n`);
  }
  bodyImagesInput.value = '';
  invalidatePreview();
  setStatus(`נוספו ${files.length} תמונות ל-Markdown — לחץ שוב על תצוגה מקדימה לפני פרסום`);
});

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = `${before}${text}${after}`;
  const pos = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);
}

previewBtn.addEventListener('click', async () => {
  const values = fieldValues();
  if (!values.title || !values.body) {
    setStatus('כותרת ותוכן נדרשים לתצוגה מקדימה', 'error');
    return;
  }
  if (!values.duration) {
    setStatus('העלה אודיו כדי לקבל משך, או הזן משך ידנית', 'error');
    return;
  }
  setStatus('יוצר תצוגה מקדימה...');
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || 'preview failed', 'error');
    return;
  }
  previewToken = data.previewToken;
  publishBtn.disabled = false;
  previewPanel.hidden = false;

  const tags = values.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const chips = [
    values.periodName ? `<span class="chip">${escapeHtml(values.periodName)}</span>` : '',
    ...tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`),
  ].join('');

  previewArticle.innerHTML = `
    <p class="meta">${escapeHtml(values.date)} · ${escapeHtml(values.duration)}</p>
    <h1>${escapeHtml(values.title)}</h1>
    <div class="badges">${chips}</div>
    ${
      coverObjectUrl
        ? `<figure><img src="${coverObjectUrl}" alt="" />${
            values.imageCaption
              ? `<figcaption>${escapeHtml(values.imageCaption)}</figcaption>`
              : ''
          }</figure>`
        : ''
    }
    ${audioObjectUrl ? `<audio controls src="${audioObjectUrl}"></audio>` : ''}
    <div class="body">${data.bodyHtml}</div>
  `;
  setStatus('תצוגה מקדימה מוכנה — אפשר לפרסם');
});

publishBtn.addEventListener('click', async () => {
  if (!previewToken) {
    setStatus('יש לבצע תצוגה מקדימה לפני פרסום', 'error');
    return;
  }
  const values = fieldValues();
  const ok = window.confirm(
    `לפרסם פרק ${values.number}?\nיועלה אודיו ל-R2, ייכתבו קבצים לריפו, ויבוצע push ל-main.`,
  );
  if (!ok) return;

  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    fd.append(key, value);
  }
  fd.append('previewToken', previewToken);
  fd.append('stagedImages', JSON.stringify(stagedImages));
  if (coverInput.files?.[0]) fd.append('cover', coverInput.files[0]);
  if (audioInput.files?.[0]) fd.append('audio', audioInput.files[0]);

  publishBtn.disabled = true;
  setStatus('מפרסם...');
  try {
    const res = await fetch('/api/publish', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      setStatus(
        `כשל בפרסום: ${data.error}${data.hint ? `\n(${data.hint})` : ''}\nצעדים שהושלמו: ${(data.completedSteps || []).join(', ') || 'none'}`,
        'error',
      );
      publishBtn.disabled = false;
      return;
    }
    setStatus(
      `הצלחה${data.dryRun ? ' (dry-run)' : ''}!\n` +
        `עמוד: ${data.sitePath}\n` +
        `אודיו: ${data.audioUrl}\n` +
        `צעדים: ${data.completedSteps.join(', ')}`,
      'ok',
    );
  } catch (err) {
    setStatus(err.message, 'error');
    publishBtn.disabled = false;
  }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

loadDefaults().catch((err) => setStatus(err.message, 'error'));
