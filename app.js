const STORAGE_KEY = 'expense_tracker_data_v1';
let selectedMonth = new Date().toISOString().slice(0, 7); // YYYY-MM, mutable — controlled by the month picker
let dayFilter = '';      // 'DD' or '' for the whole month
let editing = null;      // { source: 'transport' | 'other', id: number } while editing

// ---------- Storage helpers ----------
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to default */ }
  return { transport: [], other: [], budgets: {} };
}
function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    alert('Could not save — browser storage is full or blocked.');
  }
}
let db = loadData();
let nextId = (function () {
  let max = 0;
  db.transport.forEach(r => { if (r.id > max) max = r.id; });
  db.other.forEach(r => { if (r.id > max) max = r.id; });
  return max + 1;
})();

// ---------- Tab switching ----------
function goToTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === name));
  if (name === 'dashboard') renderSummary();
  if (name === 'history') renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => goToTab(btn.dataset.tab));
});

// default dates to today
document.querySelectorAll('input[type="date"]').forEach(el => {
  el.value = new Date().toISOString().slice(0, 10);
});

// ---------- Global month selector (drives Dashboard, History, and the PDF report) ----------
const globalMonthSelect = document.getElementById('global-month-select');
// If the browser has no month picker (shows a plain text box), swap in Month + Year dropdowns
if (globalMonthSelect.type !== 'month') {
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const nativeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const wrap = document.createElement('span');
  wrap.className = 'month-fallback';
  const mSel = document.createElement('select');
  MONTH_NAMES.forEach((n, i) => mSel.add(new Option(n, String(i + 1).padStart(2, '0'))));
  const ySel = document.createElement('select');
  const thisYear = new Date().getFullYear();
  for (let yr = thisYear - 5; yr <= thisYear + 2; yr++) ySel.add(new Option(yr, yr));
  wrap.append(mSel, ySel);
  globalMonthSelect.style.display = 'none';
  globalMonthSelect.after(wrap);
  const syncFromValue = (v) => {
    if (/^\d{4}-\d{2}$/.test(v)) {
      if (![...ySel.options].some(o => o.value === v.slice(0, 4))) ySel.add(new Option(v.slice(0, 4), v.slice(0, 4)));
      ySel.value = v.slice(0, 4); mSel.value = v.slice(5, 7);
    }
  };
  Object.defineProperty(globalMonthSelect, 'value', {
    get() { return nativeDesc.get.call(this); },
    set(v) { nativeDesc.set.call(this, v); syncFromValue(v); }
  });
  const push = () => {
    nativeDesc.set.call(globalMonthSelect, ySel.value + '-' + mSel.value);
    globalMonthSelect.dispatchEvent(new Event('change'));
  };
  mSel.addEventListener('change', push);
  ySel.addEventListener('change', push);
}
globalMonthSelect.value = selectedMonth;
globalMonthSelect.addEventListener('change', () => {
  if (!globalMonthSelect.value) { globalMonthSelect.value = selectedMonth; return; }
  selectedMonth = globalMonthSelect.value;
  dayFilter = '';
  renderDayFilterOptions();
  renderSummary();
  renderHistory();
});

// ---------- Transport form dynamic fields ----------
const transportType = document.getElementById('transport_type');
const busFields = document.getElementById('bus-fields');
const metroFields = document.getElementById('metro-fields');
const routeBlock = document.getElementById('route-block');
function updateTransportFields() {
  const t = transportType.value;
  busFields.classList.toggle('hidden', t !== 'mofussil_bus');
  metroFields.classList.toggle('hidden', t !== 'metro');
  routeBlock.classList.toggle('hidden', t === 'metro');   // Metro uses stations instead of a route
}
transportType.addEventListener('change', updateTransportFields);

// ---------- Route select (preset routes or manual entry) ----------
const routeSelect = document.getElementById('route_select');
const customRouteFields = document.getElementById('custom-route-fields');
routeSelect.addEventListener('change', () => {
  const isOther = routeSelect.value === 'other';
  customRouteFields.classList.toggle('hidden', !isOther);
});

// ---------- Other expense custom category ----------
const categorySelect = document.getElementById('category');
const customCategoryField = document.getElementById('custom-category-field');
categorySelect.addEventListener('change', () => {
  const isOther = categorySelect.value === 'other';
  customCategoryField.classList.toggle('hidden', !isOther);
});

// ---------- Helpers ----------
function showMsg(el, text, ok) {
  el.textContent = text;
  el.className = 'form-msg ' + (ok ? 'success' : 'error');
}
function money(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function plain(n) {
  return Number(n).toFixed(2);
}
function monthOf(dateStr) { return dateStr.slice(0, 7); }
function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
const PAYMENT_LABELS = {
  cash: 'Cash', gpay: 'G-Pay', whatsapp_pay: 'WhatsApp Pay',
  card: 'Credit/Debit Card', netbanking: 'Net Banking', other: 'Other',
  chennai_one_gpay: 'CHENNAI ONE - GPAY', chennai_one_whatsapp: 'CHENNAI ONE - WHATSAPP',
  'chennai one': 'CHENNAI ONE',
  student_bus_pass: 'STUDENT BUS PASS', pass_1k: 'Rs. 1k PASS', bike_muthu: 'BIKE MUTHU'
};
// Payment methods where a ₹0 fare is allowed (passes / own bike)
const ZERO_OK = ['student_bus_pass', 'pass_1k', 'bike_muthu'];
const MON_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEPT','OCT','NOV','DEC'];
function monthTag(month) {
  const [y, m] = month.split('-').map(Number);
  return MON_ABBR[m - 1] + '-' + String(y).slice(2);
}
function esc(t) {
  return String(t == null ? '' : t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// One row of data in the order: DATE | TYPE | MoT/MoD | DETAILS | PAID VIA | REMARKS | AMOUNT
function entryParts(r) {
  const isT = r.source === 'transport';
  let mo;
  if (isT) {
    mo = TRANSPORT_LABELS[r.detail_type] || String(r.detail_type).replace('_', ' ');
    if (r.detail_type === 'metro' && r.metro_line) {
      mo += ' (' + (METRO_LINES[r.metro_line] || r.metro_line) + ')';
    }
    if (r.detail_type === 'mofussil_bus') {
      const extra = [r.bus_category ? String(r.bus_category).toUpperCase() : '', r.bus_number || ''].filter(Boolean).join(', ');
      if (extra) mo += ' (' + extra + ')';
    }
  } else {
    mo = String(r.detail_type).replace('_', ' ');
  }
  return {
    date: r.expense_date,
    type: isT ? 'Transport' : 'Other',
    mo: mo,
    details: isT ? (r.route || '—') : '—',
    paid: r.payment_source ? (PAYMENT_LABELS[r.payment_source] || r.payment_source) : '—',
    remarks: (isT ? r.remarks : r.description) || '—',
    amount: r.amount
  };
}
const TRANSPORT_LABELS = { auto: 'Auto', bike: 'Bike', mofussil_bus: 'Mofussil Bus', metro: 'Metro', others: 'Others' };
const METRO_LINES = { green: 'Green Line', yellow: 'Yellow Line', blue: 'Blue Line' };

// ---------- Transport form submit (add or update) ----------
document.getElementById('transport-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('transport-msg');
  const type = form.transport_type.value;
  const amount = parseFloat(form.amount.value);

  if (!form.expense_date.value || !type || isNaN(amount)) {
    showMsg(msg, 'Please fill in date, type, and amount.', false);
    return;
  }
  if (type === 'mofussil_bus' && !form.bus_category.value) {
    showMsg(msg, 'Please select a bus category.', false);
    return;
  }

  // ---- Route (Metro: line + start/end station; others: preset or manually typed From/To) ----
  const routeValue = routeSelect.value;
  let route;
  if (type === 'metro') {
    const start = document.getElementById('metro_start').value.trim();
    const end = document.getElementById('metro_end').value.trim();
    if (!form.metro_line.value) {
      showMsg(msg, 'Please select the metro line.', false);
      return;
    }
    if (!start || !end) {
      showMsg(msg, 'Please fill in both start and end stations.', false);
      return;
    }
    route = `${start} - ${end}`;
  } else if (!routeValue) {
    showMsg(msg, 'Please select a route.', false);
    return;
  } else if (routeValue === 'other') {
    const from = document.getElementById('from_place').value.trim();
    const to = document.getElementById('to_place').value.trim();
    if (!from || !to) {
      showMsg(msg, 'Please fill in both From and To places.', false);
      return;
    }
    route = `${from} - ${to}`;
  } else {
    route = routeValue;
  }

  // ---- Payment method (mandatory) ----
  const paymentValue = form.payment_source.value;
  if (!paymentValue) {
    showMsg(msg, 'Please select a payment method.', false);
    return;
  }
  if (amount < 0 || (amount === 0 && !ZERO_OK.includes(paymentValue))) {
    showMsg(msg, 'Amount must be above 0. (₹0 is allowed only for STUDENT BUS PASS, Rs. 1k PASS or BIKE MUTHU.)', false);
    return;
  }

  const record = {
    id: (editing && editing.source === 'transport') ? editing.id : nextId++,
    expense_date: form.expense_date.value,
    transport_type: type,
    bus_category: type === 'mofussil_bus' ? form.bus_category.value : null,
    bus_number: type === 'mofussil_bus' ? (form.bus_number.value.trim() || null) : null,
    metro_line: type === 'metro' ? form.metro_line.value : null,
    amount: amount,
    route: route,
    payment_source: paymentValue,
    remarks: form.remarks.value.trim() || null
  };

  const wasEdit = editing && editing.source === 'transport';
  if (wasEdit) {
    const i = db.transport.findIndex(r => r.id === editing.id);
    if (i > -1) db.transport[i] = record; else db.transport.push(record);
  } else {
    db.transport.push(record);
  }
  saveData(db);

  clearEditState();
  showMsg(msg, wasEdit ? 'Transport expense updated!' : 'Transport expense added!', true);
  form.reset();
  form.expense_date.value = new Date().toISOString().slice(0, 10);
  updateTransportFields();
  customRouteFields.classList.add('hidden');

  if (monthOf(record.expense_date) !== selectedMonth) {
    selectedMonth = monthOf(record.expense_date);
    globalMonthSelect.value = selectedMonth;
    dayFilter = '';
    renderDayFilterOptions();
  }
  renderSummary();
  renderHistory();
  if (wasEdit) goToTab('history');
});

// ---------- Other expense form submit (add or update) ----------
document.getElementById('other-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('other-msg');
  let category = form.category.value;
  const amount = parseFloat(form.amount.value);

  if (!form.expense_date.value || !category || !(amount > 0)) {
    showMsg(msg, 'Please fill in date, category, and a valid amount.', false);
    return;
  }
  if (category === 'other') {
    category = document.getElementById('custom_category').value.trim().toLowerCase() || 'other';
  }

  const paymentValue = form.payment_source.value;
  if (!paymentValue) {
    showMsg(msg, 'Please select a payment method.', false);
    return;
  }

  const record = {
    id: (editing && editing.source === 'other') ? editing.id : nextId++,
    expense_date: form.expense_date.value,
    category: category,
    description: form.description.value.trim() || null,
    amount: amount,
    payment_source: paymentValue
  };

  const wasEdit = editing && editing.source === 'other';
  if (wasEdit) {
    const i = db.other.findIndex(r => r.id === editing.id);
    if (i > -1) db.other[i] = record; else db.other.push(record);
  } else {
    db.other.push(record);
  }
  saveData(db);

  clearEditState();
  showMsg(msg, wasEdit ? 'Expense updated!' : 'Expense added!', true);
  form.reset();
  form.expense_date.value = new Date().toISOString().slice(0, 10);
  customCategoryField.classList.add('hidden');

  if (monthOf(record.expense_date) !== selectedMonth) {
    selectedMonth = monthOf(record.expense_date);
    globalMonthSelect.value = selectedMonth;
    dayFilter = '';
    renderDayFilterOptions();
  }
  renderSummary();
  renderHistory();
  if (wasEdit) goToTab('history');
});

// ---------- Edit state ----------
function clearEditState() {
  editing = null;
  document.getElementById('transport-edit-banner').classList.add('hidden');
  document.getElementById('other-edit-banner').classList.add('hidden');
  document.getElementById('transport-cancel').classList.add('hidden');
  document.getElementById('other-cancel').classList.add('hidden');
  document.getElementById('transport-submit').textContent = 'Add Transport Expense';
  document.getElementById('other-submit').textContent = 'Add Expense';
  document.getElementById('transport-form-title').textContent = 'Add Transport Expense';
  document.getElementById('other-form-title').textContent = 'Add Other Expense';
}

function startEdit(source, id) {
  clearEditState();
  if (source === 'transport') {
    const r = db.transport.find(x => x.id === id);
    if (!r) return;
    editing = { source: 'transport', id: id };
    const form = document.getElementById('transport-form');
    form.expense_date.value = r.expense_date;
    form.transport_type.value = r.transport_type;
    updateTransportFields();
    form.bus_category.value = r.bus_category || '';
    form.metro_line.value = r.metro_line || '';
    form.bus_number.value = r.bus_number || '';
    form.amount.value = r.amount;

    const preset = Array.from(routeSelect.options).some(o => o.value === r.route || o.text === r.route);
    if (r.transport_type === 'metro') {
      const mp = (r.route || '').split(/\s+-\s+/);
      document.getElementById('metro_start').value = mp[0] || '';
      document.getElementById('metro_end').value = mp[1] || '';
      routeSelect.value = '';
      customRouteFields.classList.add('hidden');
    } else if (preset && r.route) {
      document.getElementById('metro_start').value = '';
      document.getElementById('metro_end').value = '';
      routeSelect.value = Array.from(routeSelect.options).find(o => o.value === r.route || o.text === r.route).value;
      customRouteFields.classList.add('hidden');
    } else {
      routeSelect.value = 'other';
      customRouteFields.classList.remove('hidden');
      const parts = (r.route || '').split(/\s+(?:to|TO|-)\s+/);
      document.getElementById('from_place').value = parts[0] || '';
      document.getElementById('to_place').value = parts[1] || '';
    }

    form.payment_source.value = r.payment_source || '';
    form.remarks.value = r.remarks || '';

    document.getElementById('transport-form-title').textContent = 'Edit Transport Expense';
    document.getElementById('transport-submit').textContent = 'Update Transport Expense';
    document.getElementById('transport-cancel').classList.remove('hidden');
    document.getElementById('transport-edit-banner').classList.remove('hidden');
    document.getElementById('transport-msg').textContent = '';
    goToTab('transport');
  } else {
    const r = db.other.find(x => x.id === id);
    if (!r) return;
    editing = { source: 'other', id: id };
    const form = document.getElementById('other-form');
    form.expense_date.value = r.expense_date;

    const known = ['food', 'clothes', 'stationary'];
    if (known.indexOf(r.category) > -1) {
      form.category.value = r.category;
      customCategoryField.classList.add('hidden');
    } else {
      form.category.value = 'other';
      customCategoryField.classList.remove('hidden');
      document.getElementById('custom_category').value = r.category || '';
    }

    form.description.value = r.description || '';
    form.amount.value = r.amount;
    form.payment_source.value = r.payment_source || '';

    document.getElementById('other-form-title').textContent = 'Edit Other Expense';
    document.getElementById('other-submit').textContent = 'Update Expense';
    document.getElementById('other-cancel').classList.remove('hidden');
    document.getElementById('other-edit-banner').classList.remove('hidden');
    document.getElementById('other-msg').textContent = '';
    goToTab('other');
  }
  renderHistory();
}

document.getElementById('transport-cancel').addEventListener('click', () => {
  clearEditState();
  const form = document.getElementById('transport-form');
  form.reset();
  form.expense_date.value = new Date().toISOString().slice(0, 10);
  updateTransportFields();
  customRouteFields.classList.add('hidden');
  renderHistory();
  goToTab('history');
});
document.getElementById('other-cancel').addEventListener('click', () => {
  clearEditState();
  const form = document.getElementById('other-form');
  form.reset();
  form.expense_date.value = new Date().toISOString().slice(0, 10);
  customCategoryField.classList.add('hidden');
  renderHistory();
  goToTab('history');
});

// ---------- Compute all stats for a given month (used by dashboard + PDF report) ----------
function computeMonthStats(month) {
  const monthTransport = db.transport.filter(r => monthOf(r.expense_date) === month);
  const monthOther = db.other.filter(r => monthOf(r.expense_date) === month);

  const transportByType = { auto: 0, bike: 0, mofussil_bus: 0, metro: 0, others: 0 };
  monthTransport.forEach(r => {
    const k = r.transport_type || 'others';
    if (transportByType[k] === undefined) transportByType[k] = 0;
    transportByType[k] += r.amount;
  });
  const totalTransport = Object.values(transportByType).reduce((a, b) => a + b, 0);

  const otherByCategory = {};
  monthOther.forEach(r => { otherByCategory[r.category] = (otherByCategory[r.category] || 0) + r.amount; });
  const totalOther = Object.values(otherByCategory).reduce((a, b) => a + b, 0);

  const totalSpent = totalTransport + totalOther;

  const today = new Date();
  const isCurrentMonth = today.toISOString().slice(0, 7) === month;
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysElapsed = Math.max(isCurrentMonth ? today.getDate() : daysInMonth, 1);

  const dailyAverage = totalSpent / daysElapsed;
  const projectedTotal = dailyAverage * daysInMonth;

  const categoryBreakdown = { transport: totalTransport, ...otherByCategory };
  const categoryPercentages = {};
  Object.keys(categoryBreakdown).forEach(k => {
    categoryPercentages[k] = totalSpent > 0 ? Math.round((categoryBreakdown[k] / totalSpent) * 1000) / 10 : 0;
  });

  const transportPercentages = {};
  Object.keys(transportByType).forEach(k => {
    transportPercentages[k] = totalTransport > 0 ? Math.round((transportByType[k] / totalTransport) * 1000) / 10 : 0;
  });

  // ---- Day-wise totals for the month ----
  const dayWise = {};
  monthTransport.forEach(r => {
    const d = dayWise[r.expense_date] || (dayWise[r.expense_date] = { transport: 0, other: 0, count: 0 });
    d.transport += r.amount; d.count++;
  });
  monthOther.forEach(r => {
    const d = dayWise[r.expense_date] || (dayWise[r.expense_date] = { transport: 0, other: 0, count: 0 });
    d.other += r.amount; d.count++;
  });

  return {
    month, totalTransport, totalOther, totalSpent,
    dailyAverage, projectedTotal, daysElapsed, daysInMonth,
    categoryBreakdown, categoryPercentages, transportByType, transportPercentages,
    monthTransport, monthOther, dayWise
  };
}

// ---------- Dashboard summary ----------
function renderSummary() {
  const s = computeMonthStats(selectedMonth);

  document.getElementById('stat-spent').textContent = money(s.totalSpent);
  document.getElementById('stat-transport').textContent = money(s.totalTransport);
  document.getElementById('stat-other').textContent = money(s.totalOther);
  document.getElementById('stat-average').textContent = money(s.dailyAverage);

  renderBars('category-bars', s.categoryBreakdown, s.categoryPercentages);
  renderBars('transport-bars', s.transportByType, s.transportPercentages);
  renderDayWise(s);

  document.getElementById('pdf-msg').textContent = '';
}

function renderBars(containerId, amounts, percentages) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const keys = Object.keys(amounts);
  if (keys.length === 0 || keys.every(k => amounts[k] === 0)) {
    container.innerHTML = '<p class="empty-note">No data yet.</p>';
    return;
  }
  keys.forEach(key => {
    const pct = percentages[key] || 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label"><span>${key.replace('_', ' ')}</span><span>${money(amounts[key])} (${pct}%)</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    `;
    container.appendChild(row);
  });
}

// ---------- Day-wise breakdown ----------
function renderDayWise(s) {
  const grid = document.getElementById('daywise-grid');
  const emptyNote = document.getElementById('daywise-empty');
  grid.innerHTML = '';

  const dates = Object.keys(s.dayWise).sort();
  if (dates.length === 0) {
    grid.style.display = 'none';
    emptyNote.style.display = 'block';
    return;
  }
  grid.style.display = '';
  emptyNote.style.display = 'none';

  dates.forEach(date => {
    const d = s.dayWise[date];
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `
      <div class="day-card-head"><span class="dnum">${date.slice(8, 10)}</span><span class="dname">${prettyDate(date)}</span></div>
      <div class="day-total">${money(d.transport + d.other)}</div>
      <div class="day-line"><span>Transport</span><span>${money(d.transport)}</span></div>
      <div class="day-line"><span>Other</span><span>${money(d.other)}</span></div>
      <div class="day-count">${d.count} entr${d.count > 1 ? 'ies' : 'y'}</div>
    `;
    card.addEventListener('click', () => {
      dayFilter = date.slice(8, 10);
      document.getElementById('history-day-filter').value = dayFilter;
      renderHistory();
      goToTab('history');
    });
    grid.appendChild(card);
  });
}

// ---------- History day filter ----------
function renderDayFilterOptions() {
  const sel = document.getElementById('history-day-filter');
  const [y, m] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let html = '<option value="">Whole month</option>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    html += `<option value="${dd}">${prettyDate(selectedMonth + '-' + dd)}</option>`;
  }
  sel.innerHTML = html;
  sel.value = (dayFilter && Number(dayFilter) <= daysInMonth) ? dayFilter : '';
  dayFilter = sel.value;
}
document.getElementById('history-day-filter').addEventListener('change', (e) => {
  dayFilter = e.target.value;
  renderHistory();
});
document.getElementById('history-day-reset').addEventListener('click', () => {
  dayFilter = '';
  document.getElementById('history-day-filter').value = '';
  renderHistory();
});

// ---------- History (grid, grouped day-wise) ----------
function renderHistory() {
  let rows = [
    ...db.transport.filter(r => monthOf(r.expense_date) === selectedMonth).map(r => ({ ...r, source: 'transport', detail_type: r.transport_type })),
    ...db.other.filter(r => monthOf(r.expense_date) === selectedMonth).map(r => ({ ...r, source: 'other', detail_type: r.category }))
  ];
  if (dayFilter) rows = rows.filter(r => r.expense_date.slice(8, 10) === dayFilter);
  rows.sort((a, b) => (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : b.id - a.id));

  const container = document.getElementById('history-grid');
  const emptyNote = document.getElementById('history-empty');
  container.innerHTML = '';

  if (rows.length === 0) {
    emptyNote.style.display = 'block';
    return;
  }
  emptyNote.style.display = 'none';

  const byDay = {};
  rows.forEach(r => { (byDay[r.expense_date] = byDay[r.expense_date] || []).push(r); });
  const days = Object.keys(byDay).sort().reverse();

  days.forEach(day => {
    const list = byDay[day];
    const dayTotal = list.reduce((a, b) => a + b.amount, 0);

    const sec = document.createElement('div');
    sec.className = 'hist-day';
    let html = `<div class="hist-day-head"><div>${prettyDate(day)} — ${list.length} entr${list.length > 1 ? 'ies' : 'y'}</div><span>${money(dayTotal)}</span></div><div class="entry-grid">`;
    list.forEach(r => {
      const e = entryParts(r);
      const isEditing = editing && editing.source === r.source && editing.id === r.id;
      html += `
        <div class="entry-card${isEditing ? ' row-editing' : ''}">
          <div class="entry-top"><span class="badge ${r.source}">${e.type}</span><span class="entry-amt">${money(e.amount)}</span></div>
          <div class="entry-mo">${esc(e.mo)}</div>
          <div class="entry-row"><span class="k">Date</span><span class="v">${e.date}</span></div>
          <div class="entry-row"><span class="k">Details</span><span class="v">${esc(e.details)}</span></div>
          <div class="entry-row"><span class="k">Paid via</span><span class="v">${esc(e.paid)}</span></div>
          <div class="entry-row"><span class="k">Remarks</span><span class="v">${esc(e.remarks)}</span></div>
          <div class="entry-actions">
            <button class="edit-btn" data-edit="${r.id}" data-source="${r.source}">Edit</button>
            <button class="delete-btn" data-id="${r.id}" data-source="${r.source}">Delete</button>
          </div>
        </div>`;
    });
    html += '</div>';
    sec.innerHTML = html;
    container.appendChild(sec);
  });

  container.querySelectorAll('.edit-btn[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => startEdit(btn.dataset.source, parseInt(btn.dataset.edit, 10)));
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id, 10);
      const source = btn.dataset.source;
      if (!confirm('Delete this expense entry?')) return;
      if (source === 'transport') {
        db.transport = db.transport.filter(r => r.id !== id);
      } else {
        db.other = db.other.filter(r => r.id !== id);
      }
      if (editing && editing.source === source && editing.id === id) clearEditState();
      saveData(db);
      renderHistory();
      renderSummary();
    });
  });
}

// ---------- Monthly Report (PDF via browser print) ----------
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function buildReportRows(monthTransport, monthOther) {
  const rows = [
    ...monthTransport.map(r => ({ ...r, source: 'transport', detail_type: r.transport_type, description: r.route })),
    ...monthOther.map(r => ({ ...r, source: 'other', detail_type: r.category }))
  ].sort((a, b) => (a.expense_date < b.expense_date ? -1 : a.expense_date > b.expense_date ? 1 : a.id - b.id));
  return rows;
}

function generateMonthlyReport() {
  const s = computeMonthStats(selectedMonth);
  const rows = buildReportRows(s.monthTransport, s.monthOther);
  const container = document.getElementById('print-report');

  if (rows.length === 0) {
    container.innerHTML = `
      <h1 class="report-title">Monthly Expense Report — ${monthLabel(selectedMonth)}</h1>
      <p class="report-subtitle">Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <p>No expenses were recorded for this month.</p>
    `;
    window.print();
    return;
  }

  const categoryRowsHtml = Object.keys(s.categoryBreakdown).map(cat => `
    <tr><td>${cat.replace('_', ' ')}</td><td>${money(s.categoryBreakdown[cat])}</td><td>${s.categoryPercentages[cat]}%</td></tr>
  `).join('');

  const transportRowsHtml = Object.keys(s.transportByType)
    .filter(t => s.transportByType[t] > 0)
    .map(t => `
      <tr><td>${t.replace('_', ' ')}</td><td>${money(s.transportByType[t])}</td><td>${s.transportPercentages[t]}%</td></tr>
    `).join('');

  const dayRowsHtml = Object.keys(s.dayWise).sort().map(d => {
    const v = s.dayWise[d];
    return `<tr><td>${d}</td><td>${money(v.transport)}</td><td>${money(v.other)}</td><td>${money(v.transport + v.other)}</td></tr>`;
  }).join('');

  const itemRowsHtml = rows.map(r => {
    const e = entryParts(r);
    return `
      <tr>
        <td>${e.date}</td>
        <td>${e.type}</td>
        <td>${esc(e.mo)}</td>
        <td>${esc(e.details)}</td>
        <td>${esc(e.paid)}</td>
        <td>${esc(e.remarks)}</td>
        <td>${money(e.amount)}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="wm">${monthTag(selectedMonth)}</div>
    <h1 class="report-title">Monthly Expense Report — ${monthLabel(selectedMonth)}</h1>
    <p class="report-subtitle">Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

    <div class="report-summary-grid">
      <div><span>Total Spent</span><span>${money(s.totalSpent)}</span></div>
      <div><span>Daily Average Spend</span><span>${money(s.dailyAverage)}</span></div>
      <div><span>Transport Total</span><span>${money(s.totalTransport)}</span></div>
      <div><span>Other Expenses Total</span><span>${money(s.totalOther)}</span></div>
    </div>

    <h2 class="report-section-title">Spending by Category</h2>
    <table class="report-table">
      <thead><tr><th>Category</th><th>Amount</th><th>% of Total</th></tr></thead>
      <tbody>${categoryRowsHtml}</tbody>
    </table>

    ${transportRowsHtml ? `
      <h2 class="report-section-title">Transport Breakdown</h2>
      <table class="report-table">
        <thead><tr><th>Type</th><th>Amount</th><th>% of Transport</th></tr></thead>
        <tbody>${transportRowsHtml}</tbody>
      </table>
    ` : ''}

    <h2 class="report-section-title">Day-Wise Totals</h2>
    <table class="report-table">
      <thead><tr><th>Date</th><th>Transport</th><th>Other</th><th>Day Total</th></tr></thead>
      <tbody>${dayRowsHtml}</tbody>
    </table>

    <h2 class="report-section-title">All Expenses (${rows.length})</h2>
    <table class="report-table">
      <thead><tr><th>DATE</th><th>TYPE</th><th>MoT / MoD</th><th>DETAILS</th><th>PAID VIA</th><th>REMARKS</th><th>AMOUNT</th></tr></thead>
      <tbody>${itemRowsHtml}</tbody>
    </table>
  `;

  window.print();
}

document.getElementById('report-btn').addEventListener('click', generateMonthlyReport);

// ---------- Month-end PDF (jsPDF, direct download) ----------
function getJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  return null;
}

document.getElementById('pdf-btn').addEventListener('click', () => {
  const msg = document.getElementById('pdf-msg');
  try {
    downloadMonthPdf(msg);
  } catch (err) {
    console.error(err);
    showMsg(msg, 'PDF failed: ' + (err && err.message ? err.message : 'unknown error') + '. Try the Print option instead.', false);
  }
});

function downloadMonthPdf(msg) {
  const JsPDF = getJsPDF();
  if (!JsPDF) {
    showMsg(msg, 'PDF library did not load (no internet?). Use the Print / Save option instead.', false);
    return;
  }

  const s = computeMonthStats(selectedMonth);
  const rows = buildReportRows(s.monthTransport, s.monthOther);
  if (rows.length === 0) {
    showMsg(msg, 'No expenses recorded for this month.', false);
    return;
  }

  const tag = monthTag(selectedMonth);
  const doc = new JsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 36;
  let y = 0;

  const cols = [
    { k: 'date', t: 'DATE', w: 52, a: 'left' },
    { k: 'type', t: 'TYPE', w: 58, a: 'left' },
    { k: 'mo', t: 'MoT / MoD', w: 108, a: 'left' },
    { k: 'details', t: 'DETAILS', w: 190, a: 'left' },
    { k: 'paid', t: 'PAID VIA', w: 100, a: 'left' },
    { k: 'rem', t: 'REMARKS', w: 176, a: 'left' },
    { k: 'amt', t: 'AMOUNT', w: 86, a: 'right' }
  ];
  const xs = [];
  let acc = M;
  cols.forEach(c => { xs.push(acc); acc += c.w; });
  const right = acc;

  function watermark() {
    const ang = 30 * Math.PI / 180;
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.09 }));
    doc.setTextColor(79, 70, 229);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(120);
    const w = doc.getTextWidth(tag);
    const x0 = PW / 2 - (w / 2) * Math.cos(ang) + 20;
    const y0 = PH / 2 + (w / 2) * Math.sin(ang) + 10;
    doc.text(tag, x0, y0, { angle: 30 });
    doc.restoreGraphicsState();
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }

  function pageFooter() {
    watermark();
    const page = doc.internal.getCurrentPageInfo ? doc.internal.getCurrentPageInfo().pageNumber : 1;
    doc.setFontSize(8.5); doc.setTextColor(130);
    doc.text('Daily Expense Tracker — ' + tag, M, PH - 24);
    doc.text('Page ' + page, PW - M, PH - 24, { align: 'right' });
    doc.setTextColor(0); doc.setFontSize(9);
  }

  function drawHeader(first) {
    y = M;
    if (first) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('Monthly Expense Report — ' + tag, M, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text(monthLabel(selectedMonth), M, y + 20);
      doc.text('Generated ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), right, y + 20, { align: 'right' });
      doc.setTextColor(0);
      y += 38;

      doc.setDrawColor(200); doc.setFillColor(238, 240, 253);
      doc.rect(M, y, right - M, 58, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
      doc.text('Total Spent: INR ' + plain(s.totalSpent), M + 10, y + 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('Transport: INR ' + plain(s.totalTransport) + '    Other: INR ' + plain(s.totalOther)
        + '    Daily average: INR ' + plain(s.dailyAverage), M + 10, y + 31);
      const catLine = Object.keys(s.categoryBreakdown)
        .map(c => c.replace('_', ' ') + ' ' + plain(s.categoryBreakdown[c])).join('   |   ');
      doc.text(doc.splitTextToSize(catLine, right - M - 20), M + 10, y + 45);
      y += 74;
    }
    doc.setFillColor(79, 70, 229);
    doc.rect(M, y, right - M, 22, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255);
    cols.forEach((c, i) => {
      const tx = c.a === 'right' ? xs[i] + c.w - 6 : xs[i] + 6;
      doc.text(c.t, tx, y + 14.5, { align: c.a });
    });
    doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    y += 22;
  }

  drawHeader(true);

  let zebra = false;
  let total = 0;
  let lastDay = null;

  rows.forEach(r => {
    if (r.expense_date !== lastDay) {
      if (y + 40 > PH - 50) { pageFooter(); doc.addPage(); drawHeader(false); zebra = false; }
      const dv = s.dayWise[r.expense_date];
      doc.setFillColor(232, 234, 248);
      doc.rect(M, y, right - M, 16, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      doc.text(prettyDate(r.expense_date) + ' (' + r.expense_date + ')', M + 6, y + 11);
      doc.text('Day total: INR ' + plain(dv.transport + dv.other), right - 6, y + 11, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      y += 16;
      lastDay = r.expense_date;
      zebra = false;
    }

    const e = entryParts(r);
    const cell = {
      date: e.date.slice(8, 10) + '-' + e.date.slice(5, 7),
      type: e.type,
      mo: e.mo,
      details: e.details,
      paid: e.paid,
      rem: e.remarks,
      amt: plain(e.amount)
    };

    const wrapped = {};
    let lines = 1;
    cols.forEach(c => {
      wrapped[c.k] = doc.splitTextToSize(String(cell[c.k]), c.w - 12);
      lines = Math.max(lines, wrapped[c.k].length);
    });
    const h = Math.max(19, lines * 10.5 + 9);

    if (y + h > PH - 50) { pageFooter(); doc.addPage(); drawHeader(false); zebra = false; }
    if (zebra) { doc.setFillColor(248, 248, 252); doc.rect(M, y, right - M, h, 'F'); }
    zebra = !zebra;
    doc.setDrawColor(224); doc.line(M, y + h, right, y + h);
    cols.forEach((c, i) => {
      const tx = c.a === 'right' ? xs[i] + c.w - 6 : xs[i] + 6;
      doc.text(wrapped[c.k], tx, y + 13, { align: c.a });
    });
    y += h;
    total += r.amount;
  });

  if (y + 30 > PH - 50) { pageFooter(); doc.addPage(); drawHeader(false); }
  doc.setFillColor(222, 227, 248);
  doc.rect(M, y, right - M, 26, 'F');
  doc.setDrawColor(150); doc.line(M, y, right, y);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  doc.text('Total for ' + tag, M + 6, y + 17);
  doc.text('INR ' + plain(total), right - 6, y + 17, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  pageFooter();
  doc.save('expense-report-' + selectedMonth + '.pdf');
  showMsg(msg, 'PDF downloaded.', true);
}

// ---------- Init ----------
renderDayFilterOptions();
renderSummary();
renderHistory();

// ---------- Register service worker (enables offline install as an app) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      // Silently ignore if this file is opened directly without a server;
      // the app still works fine, it just won't be installable as a home-screen app.
    });
  });
}
