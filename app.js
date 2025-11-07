// ---- 常量与工具 ----
const STORAGE_KEY = 'timesheet_entries_v1';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveEntries(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function formatDate(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const day = String(dt.getDate()).padStart(2,'0');
  return `${dt.getFullYear()}-${m}-${day}`;
}
function toCSV(rows) {
  const headers = ['date','project','hours','note'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const esc = (s='') => '"' + String(s).replaceAll('"','""') + '"';
    lines.push([esc(r.date), esc(r.project), r.hours, esc(r.note)].join(','));
  }
  return lines.join('\\n');
}
function fromCSV(text) {
  // 简易解析：按行拆分，再按逗号（考虑引号）
  const lines = text.split(/\\r?\\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines.shift().toLowerCase();
  const cols = header.split(',').map(s=>s.trim());
  const idx = {
    date: cols.indexOf('date'),
    project: cols.indexOf('project'),
    hours: cols.indexOf('hours'),
    note: cols.indexOf('note')
  };
  const out = [];
  for (const line of lines) {
    const cells = parseCSVLine(line);
    const item = {
      date: cells[idx.date] || '',
      project: cells[idx.project] || '',
      hours: parseFloat(cells[idx.hours] || '0') || 0,
      note: cells[idx.note] || ''
    };
    if (item.date && item.project && item.hours>0) out.push(item);
  }
  return out;
}
function parseCSVLine(line) {
  const res = []; let cur = ''; let quoted = false;
  for (let i=0;i<line.length;i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i+1] === '"') { cur += '"'; i++; }
      else { quoted = !quoted; }
    } else if (ch === ',' && !quoted) {
      res.push(cur); cur='';
    } else { cur += ch; }
  }
  res.push(cur);
  return res.map(s=>s.trim());
}

// ---- 状态 ----
let entries = loadEntries();
let editingIndex = null; // 编辑中的行索引

// ---- 初始化 ----
window.addEventListener('DOMContentLoaded', () => {
  // 默认把日期设为今天
  $('#date').value = formatDate(new Date());
  render();

  $('#entry-form').addEventListener('submit', onSubmit);
  $('#reset-form').addEventListener('click', onResetForm);

  $('#btn-export').addEventListener('click', onExport);
  $('#btn-import').addEventListener('click', onImport);
  $('#btn-clear-all').addEventListener('click', onClearAll);

  $('#filter-start').addEventListener('change', render);
  $('#filter-end').addEventListener('change', render);
  $('#filter-project').addEventListener('input', render);
  $('#btn-clear-filters').addEventListener('click', () => {
    $('#filter-start').value = '';
    $('#filter-end').value = '';
    $('#filter-project').value = '';
    render();
  });
});

function onSubmit(e) {
  e.preventDefault();
  const item = {
    date: $('#date').value,
    project: $('#project').value.trim(),
    hours: parseFloat($('#hours').value),
    note: $('#note').value.trim()
  };
  if (!item.date || !item.project || !item.hours || item.hours<=0) return alert('请完整填写正确数据');

  if (editingIndex!==null) {
    entries[editingIndex] = item;
    editingIndex = null;
  } else {
    entries.push(item);
  }
  saveEntries(entries);
  onResetForm();
  render();
}

function onResetForm() {
  $('#entry-form').reset();
  $('#date').value = formatDate(new Date());
  editingIndex = null;
}

function onExport() {
  const csv = toCSV(entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `timesheet_export_${Date.now()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function onImport() {
  const input = $('#import-file');
  if (!input.files.length) return alert('请先选择一个 CSV 文件');
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const newItems = fromCSV(String(reader.result));
      if (!newItems.length) return alert('文件中没有可用数据');
      entries = entries.concat(newItems);
      saveEntries(entries);
      render();
      alert(`已导入 ${newItems.length} 条记录`);
    } catch (err) {
      console.error(err);
      alert('导入失败，请检查 CSV 格式');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function onClearAll() {
  if (!confirm('确定清空所有数据？此操作不可恢复。')) return;
  entries = [];
  saveEntries(entries);
  render();
}

function getFilteredEntries() {
  const start = $('#filter-start').value ? new Date($('#filter-start').value) : null;
  const end = $('#filter-end').value ? new Date($('#filter-end').value) : null;
  const kw = $('#filter-project').value.trim().toLowerCase();
  return entries.filter(e => {
    const d = new Date(e.date);
    if (start && d < start) return false;
    if (end && d > end) return false;
    if (kw && !e.project.toLowerCase().includes(kw)) return false;
    return true;
  });
}

function render() {
  const list = getFilteredEntries().sort((a,b) => new Date(b.date) - new Date(a.date));
  const tbody = $('#table-body');
  tbody.innerHTML = '';

  let total = 0;
  list.forEach((item, idx) => {
    total += Number(item.hours) || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(item.date)}</td>
      <td><span class="badge">${escapeHtml(item.project)}</span></td>
      <td>${item.hours}</td>
      <td>${escapeHtml(item.note||'')}</td>
      <td>
        <button data-act="edit" data-i="${idx}">编辑</button>
        <button data-act="del" data-i="${idx}" class="danger">删除</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // 绑定行内按钮
  tbody.querySelectorAll('button').forEach(btn => btn.addEventListener('click', (e) => {
    const i = Number(btn.dataset.i);
    const current = list[i];
    const realIndex = entries.findIndex(en => en===current);
    if (btn.dataset.act==='edit') {
      editingIndex = realIndex;
      $('#date').value = formatDate(current.date);
      $('#project').value = current.project;
      $('#hours').value = current.hours;
      $('#note').value = current.note || '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (btn.dataset.act==='del') {
      if (confirm('删除这条记录？')) {
        entries.splice(realIndex,1);
        saveEntries(entries);
        render();
      }
    }
  }));

  $('#summary').textContent = `共 ${list.length} 条，合计 ${Number(total.toFixed(2))} 小时`;

  drawCharts(list);
}

function escapeHtml(s='') { return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

// ---- 图表 ----
let chartByProject, chartByMonth;
function drawCharts(list) {
  // 汇总：按项目
  const byProject = {};
  for (const e of list) { byProject[e.project] = (byProject[e.project]||0) + Number(e.hours||0); }
  const projLabels = Object.keys(byProject);
  const projData = projLabels.map(k => Number(byProject[k].toFixed(2)));

  // 汇总：按月份（YYYY-MM）
  const byMonth = {};
  for (const e of list) {
    const d = new Date(e.date);
    if (isNaN(d)) continue;
    const label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    byMonth[label] = (byMonth[label]||0) + Number(e.hours||0);
  }
  const monthLabels = Object.keys(byMonth).sort();
  const monthData = monthLabels.map(k => Number(byMonth[k].toFixed(2)));

  // 销毁旧图
  if (chartByProject) chartByProject.destroy();
  if (chartByMonth) chartByMonth.destroy();

  // 创建新图
  const ctx1 = document.getElementById('chartByProject');
  chartByProject = new Chart(ctx1, {
    type: 'bar',
    data: { labels: projLabels, datasets: [{ label: '小时', data: projData }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  const ctx2 = document.getElementById('chartByMonth');
  chartByMonth = new Chart(ctx2, {
    type: 'line',
    data: { labels: monthLabels, datasets: [{ label: '小时', data: monthData, tension: 0.3, fill: false }] },
    options: { responsive: true }
  });
}
