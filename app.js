/* PDFMint MVP — merge & split, fully client-side */
const { PDFDocument } = PDFLib;
let mode = 'merge';
let files = []; // {name, bytes}

const $ = id => document.getElementById(id);
const drop = $('drop'), fileInput = $('file'), list = $('filelist'), go = $('go'), msg = $('msg');

const TITLES = {
  merge: ['Merge PDF files', 'Combine multiple PDFs into one — free, no sign-up, no watermark. Your files never leave this browser tab.'],
  split: ['Split a PDF', 'Extract page ranges or burst every page into its own file — free, private, on-device.']
};

document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  mode = t.dataset.mode;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  $('title').textContent = TITLES[mode][0];
  $('subtitle').textContent = TITLES[mode][1];
  $('range-wrap').style.display = mode === 'split' ? 'block' : 'none';
  fileInput.multiple = mode === 'merge';
  refresh();
});

drop.onclick = () => fileInput.click();
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); };
fileInput.onchange = () => { addFiles(fileInput.files); fileInput.value = ''; };

async function addFiles(fl) {
  for (const f of fl) {
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) continue;
    files.push({ name: f.name, bytes: await f.arrayBuffer() });
  }
  refresh();
}

function refresh() {
  list.innerHTML = '';
  files.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'fileitem';
    div.innerHTML = `<span>📄</span><span class="name">${f.name}</span>
      ${mode === 'merge' ? `<span class="up" data-i="${i}">↑</span><span class="dn" data-i="${i}">↓</span>` : ''}
      <span class="rm" data-i="${i}">✕</span>`;
    list.appendChild(div);
  });
  list.querySelectorAll('.rm').forEach(el => el.onclick = () => { files.splice(+el.dataset.i, 1); refresh(); });
  list.querySelectorAll('.up').forEach(el => el.onclick = () => { const i = +el.dataset.i; if (i > 0) { [files[i-1], files[i]] = [files[i], files[i-1]]; refresh(); } });
  list.querySelectorAll('.dn').forEach(el => el.onclick = () => { const i = +el.dataset.i; if (i < files.length - 1) { [files[i+1], files[i]] = [files[i], files[i+1]]; refresh(); } });
  go.disabled = files.length === 0;
}

function say(text, cls) { msg.textContent = text; msg.className = cls || ''; }

function parseRange(str, max) {
  const pages = new Set();
  for (const part of str.split(',')) {
    const m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) { for (let p = +m[1]; p <= +m[2]; p++) if (p >= 1 && p <= max) pages.add(p); }
    else if (/^\d+$/.test(part.trim())) { const p = +part.trim(); if (p >= 1 && p <= max) pages.add(p); }
    else return null;
  }
  return [...pages].sort((a, b) => a - b);
}

async function merge() {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return { name: 'merged.pdf', bytes: await out.save() };
}

async function split() {
  const src = await PDFDocument.load(files[0].bytes, { ignoreEncryption: true });
  const max = src.getPageCount();
  const range = $('range').value.trim();
  if (!range) { // burst: one file per page
    const zip = [];
    for (let i = 0; i < max; i++) {
      const out = await PDFDocument.create();
      const [p] = await out.copyPages(src, [i]);
      out.addPage(p);
      zip.push({ name: `${files[0].name.replace(/\.pdf$/i, '')}-page-${i + 1}.pdf`, bytes: await out.save() });
    }
    return zip;
  }
  const pages = parseRange(range, max);
  if (!pages || !pages.length) throw new Error('Invalid page range');
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pages.map(p => p - 1));
  copied.forEach(p => out.addPage(p));
  return { name: `pages-${range.replace(/\s/g, '')}.pdf`, bytes: await out.save() };
}

go.onclick = async () => {
  go.disabled = true;
  say('Processing…', '');
  try {
    const result = mode === 'merge' ? await merge() : await split();
    const items = Array.isArray(result) ? result : [result];
    for (const item of items) {
      const url = URL.createObjectURL(new Blob([item.bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = item.name; a.click();
      URL.revokeObjectURL(url);
    }
    say(`✅ Done — ${items.length} file(s) downloaded`, 'ok');
  } catch (e) {
    say('❌ ' + (e.message || 'Failed to process PDF'), 'err');
  }
  go.disabled = false;
};
