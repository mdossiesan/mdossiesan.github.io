// DSJ tracker: meals (with AI photo scanning), exercise (done or scheduled), calendar, goals.
// Everything is saved in this browser (localStorage). The AI key is stored separately and never exported.

/* ================= helpers ================= */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== ''));
const ICONS = {
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M18 5l2 2"/>',
  out: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>'
};
function icon(name, size = 20) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) el.setAttribute(k, v);
  el.innerHTML = ICONS[name] || '';
  return el;
}
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const todayISO = () => iso(new Date());
const weekStart = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const isISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmt = (s, o) => parseISO(s).toLocaleDateString(undefined, o);
const dateLong = s => fmt(s, { weekday: 'long', month: 'long', day: 'numeric' });
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const r1 = v => Math.round(v * 10) / 10;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const str = (v, dflt, max) => (typeof v === 'string' && v.trim() ? v.trim() : dflt).slice(0, max);
const inVal = v => (v === 0 || v) ? String(Math.round(v * 100) / 100) : '';
const fmtTime = t => { if (!t) return ''; const [a, b] = t.split(':').map(Number); return new Date(2000, 0, 1, a, b).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
function fmtDur(sec) { sec = Math.round(sec); const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60; return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`; }
const fmtPace = spu => { const s = Math.round(spu); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

/* ================= constants & state ================= */
const MEALS = [{ key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' }, { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snacks' }];
const MEAL_KEYS = MEALS.map(m => m.key);
const mealLabel = k => (MEALS.find(m => m.key === k) || MEALS[3]).label;
const EX = [
  { key: 'run', label: 'Run', met: 9.8, dist: true, perKmKg: 1.0 },
  { key: 'walk', label: 'Walk', met: 3.5, dist: true },
  { key: 'cycle', label: 'Cycle', met: 7.5, dist: true },
  { key: 'swim', label: 'Swim', met: 7, dist: true },
  { key: 'strength', label: 'Strength', met: 5 },
  { key: 'hiit', label: 'HIIT', met: 8 },
  { key: 'yoga', label: 'Yoga', met: 2.5 },
  { key: 'sport', label: 'Sport', met: 7 },
  { key: 'other', label: 'Other', met: 5 }
];
const exType = k => EX.find(e => e.key === k) || EX[EX.length - 1];
const DEFAULTS = { calGoal: 2200, protein: 150, carbs: 230, fat: 70, weight: 165, weightUnit: 'lb', distUnit: 'mi', addBurn: true };
const LS = 'dsj-tracker:v1', LS_KEY = 'dsj-tracker:ai-key', LS_VIEW = 'dsj-tracker:view';
const MODEL = 'claude-opus-5-5';
const KM_PER_MI = 1.609344;
const SRC = { label: 'From label', product: 'Product data', estimate: 'AI estimate', manual: '' };

const S = { days: {}, settings: { ...DEFAULTS }, sel: todayISO(), view: 'week', month: todayISO().slice(0, 7) };

function normMeal(x) {
  x = x || {};
  return {
    id: String(x.id || uid()).slice(0, 40), meal: MEAL_KEYS.includes(x.meal) ? x.meal : 'snack',
    name: str(x.name, 'Food', 80), serving: str(x.serving, '', 60), qty: x.qty == null ? 1 : num(x.qty),
    cal: num(x.cal), p: num(x.p), c: num(x.c), f: num(x.f), fiber: num(x.fiber), sugar: num(x.sugar), sodium: num(x.sodium),
    source: x.source in SRC ? x.source : 'manual', t: num(x.t) || Date.now()
  };
}
function normEx(x) {
  x = x || {};
  return {
    id: String(x.id || uid()).slice(0, 40), status: x.status === 'scheduled' ? 'scheduled' : 'done', type: exType(x.type).key,
    time: typeof x.time === 'string' && /^\d{2}:\d{2}$/.test(x.time) ? x.time : '', sec: num(x.sec), km: num(x.km),
    kcal: Math.round(num(x.kcal)), kcalAuto: x.kcalAuto !== false, notes: str(x.notes, '', 300), t: num(x.t) || Date.now()
  };
}
const normDay = v => ({
  meals: Array.isArray(v && v.meals) ? v.meals.filter(o => o && typeof o === 'object').map(normMeal) : [],
  exercises: Array.isArray(v && v.exercises) ? v.exercises.filter(o => o && typeof o === 'object').map(normEx) : []
});
function cleanSettings(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of ['calGoal', 'protein', 'carbs', 'fat', 'weight']) if (Number(o[k]) > 0) out[k] = Number(o[k]);
  if (o.weightUnit === 'lb' || o.weightUnit === 'kg') out.weightUnit = o.weightUnit;
  if (o.distUnit === 'mi' || o.distUnit === 'km') out.distUnit = o.distUnit;
  if (typeof o.addBurn === 'boolean') out.addBurn = o.addBurn;
  return out;
}
const ensureDay = d => (S.days[d] ||= { meals: [], exercises: [] });

function load() {
  try {
    const o = JSON.parse(localStorage.getItem(LS) || 'null');
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o.days || {})) if (isISO(k)) S.days[k] = normDay(v);
      S.settings = { ...DEFAULTS, ...cleanSettings(o.settings) };
    }
    const v = localStorage.getItem(LS_VIEW);
    if (v === 'month' || v === 'week') S.view = v;
  } catch (e) { /* storage unavailable: start empty */ }
}
function save() {
  const days = {};
  for (const [k, d] of Object.entries(S.days)) if (d.meals.length || d.exercises.length) days[k] = d;
  try { localStorage.setItem(LS, JSON.stringify({ v: 1, days, settings: S.settings })); return true; }
  catch (e) { toast("Couldn't save on this device. Storage may be full or blocked."); return false; }
}
const getKey = () => { try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; } };
const setKey = k => { try { if (k) localStorage.setItem(LS_KEY, k); else localStorage.removeItem(LS_KEY); return true; } catch (e) { return false; } };

/* ================= units & totals ================= */
const U = () => S.settings.distUnit;
const kmToU = km => U() === 'mi' ? km / KM_PER_MI : km;
const uToKm = v => U() === 'mi' ? v * KM_PER_MI : v;
const fmtDist = km => nf2.format(Math.round(kmToU(km) * 100) / 100);
const weightKg = () => S.settings.weightUnit === 'lb' ? S.settings.weight * 0.45359237 : S.settings.weight;
function estBurn(x) {
  const t = exType(x.type), kg = weightKg();
  if (t.perKmKg && x.km > 0) return Math.round(t.perKmKg * kg * x.km);
  if (x.sec > 0) return Math.round(t.met * kg * x.sec / 3600);
  return 0;
}
function totals(date) {
  const t = { cal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sodium: 0, n: 0, burn: 0, done: 0, sched: 0 };
  const d = S.days[date]; if (!d) return t;
  for (const m of d.meals) { const q = m.qty; t.cal += m.cal * q; t.p += m.p * q; t.c += m.c * q; t.f += m.f * q; t.fiber += m.fiber * q; t.sugar += m.sugar * q; t.sodium += m.sodium * q; t.n++; }
  for (const x of d.exercises) { if (x.status === 'done') { t.burn += x.kcal; t.done++; } else t.sched++; }
  return t;
}
const budget = t => S.settings.calGoal + (S.settings.addBurn ? t.burn : 0);
function mealForNow() { const d = new Date(), m = d.getHours() * 60 + d.getMinutes(); return m < 630 ? 'breakfast' : m < 900 ? 'lunch' : m < 1020 ? 'snack' : m < 1290 ? 'dinner' : 'snack'; }
function exHeadline(x) {
  const t = exType(x.type);
  if (t.dist && x.km > 0) return { big: fmtDist(x.km), unit: U() };
  if (x.sec > 0) return { big: String(Math.round(x.sec / 60)), unit: 'min' };
  return { big: t.label, unit: '' };
}
function exStats(x) {
  const t = exType(x.type);
  return [
    x.sec ? (x.status === 'scheduled' ? 'planned ' : '') + fmtDur(x.sec) : '',
    t.dist && x.km > 0 && x.sec > 0 && (x.type === 'run' || x.type === 'walk') ? fmtPace(x.sec / kmToU(x.km)) + ' /' + U() : '',
    x.kcal ? nf0.format(x.kcal) + ' kcal' : ''
  ].filter(Boolean).join(' · ');
}

/* ================= Google Calendar ================= */
function gcalLink(x, date) {
  const t = exType(x.type);
  const title = `${t.label}${t.dist && x.km ? ' · ' + fmtDist(x.km) + ' ' + U() : ''}`;
  const details = [x.status === 'scheduled' ? 'Planned in DSJ Tracking.' : 'Logged in DSJ Tracking.', x.sec ? 'Duration: ' + fmtDur(x.sec) : '', x.kcal ? 'Calories: about ' + nf0.format(x.kcal) + ' kcal' : '', x.notes].filter(Boolean).join('\n');
  const enc = encodeURIComponent;
  let dates;
  if (x.time) {
    const [hh, mm] = x.time.split(':').map(Number);
    const s = parseISO(date); s.setHours(hh, mm, 0, 0);
    const e = new Date(s.getTime() + Math.max(15, Math.round((x.sec || 2700) / 60)) * 60000);
    const f = d => `${iso(d).replace(/-/g, '')}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    dates = `${f(s)}/${f(e)}`;
  } else dates = `${date.replace(/-/g, '')}/${addDays(date, 1).replace(/-/g, '')}`;
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(title)}&dates=${dates}&details=${enc(details)}${tz ? '&ctz=' + enc(tz) : ''}`;
}

/* ================= rendering ================= */
function selectDate(d) { if (!isISO(d)) return; S.sel = d; S.month = d.slice(0, 7); render(); }
function render() { renderDate(); renderCalendar(); renderCard(); renderLog(); }

function renderDate() {
  const t = todayISO(), s = S.sel;
  $('#dayTitle').textContent = s === t ? 'Today' : s === addDays(t, -1) ? 'Yesterday' : s === addDays(t, 1) ? 'Tomorrow' : fmt(s, { weekday: 'short', month: 'short', day: 'numeric' });
  $('#daySub').textContent = fmt(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#goToday').hidden = s === t;
  $('#viewWeek').setAttribute('aria-pressed', String(S.view === 'week'));
  $('#viewMonth').setAttribute('aria-pressed', String(S.view === 'month'));
}
function dayDots(date) {
  const d = S.days[date];
  const meals = !!(d && d.meals.length), done = !!(d && d.exercises.some(x => x.status === 'done')), sched = !!(d && d.exercises.some(x => x.status === 'scheduled'));
  return h('span', { class: 'dots', 'aria-hidden': 'true' }, meals ? h('i', { class: 'm' }) : null, done ? h('i', { class: 'x' }) : null, sched ? h('i', { class: 's' }) : null);
}
function dayLabel(date) {
  const d = S.days[date]; const bits = [];
  if (d && d.meals.length) bits.push('meals logged');
  if (d && d.exercises.some(x => x.status === 'done')) bits.push('workout done');
  if (d && d.exercises.some(x => x.status === 'scheduled')) bits.push('workout scheduled');
  return dateLong(date) + (bits.length ? ', ' + bits.join(', ') : '');
}
function renderCalendar() {
  const root = $('#calendar'), t = todayISO();
  if (S.view === 'week') {
    const ws = weekStart(S.sel);
    put(root, h('div', { class: 'week', role: 'group', 'aria-label': 'Days this week' }, Array.from({ length: 7 }, (_, i) => {
      const d = addDays(ws, i);
      return h('button', { class: 'wk' + (d === S.sel ? ' on' : '') + (d === t ? ' today' : ''), type: 'button', 'aria-pressed': String(d === S.sel), 'aria-label': dayLabel(d), onclick: () => selectDate(d) },
        h('span', { class: 'd' }, fmt(d, { weekday: 'short' })), h('span', { class: 'n' }, String(parseISO(d).getDate())), dayDots(d));
    })));
    return;
  }
  const [y, m] = S.month.split('-').map(Number);
  const first = iso(new Date(y, m - 1, 1)), start = weekStart(first);
  const shift = n => { const d = new Date(y, m - 1 + n, 1); S.month = iso(d).slice(0, 7); renderCalendar(); };
  put(root, h('div', { class: 'month' },
    h('div', { class: 'month-h' },
      h('button', { class: 'round', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, icon('left', 18)),
      h('b', { 'aria-live': 'polite' }, new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
      h('button', { class: 'round', type: 'button', 'aria-label': 'Next month', onclick: () => shift(1) }, icon('right', 18))),
    h('div', { class: 'month-grid' },
      Array.from({ length: 7 }, (_, i) => h('span', { class: 'wd', 'aria-hidden': 'true' }, fmt(addDays(start, i), { weekday: 'narrow' }))),
      Array.from({ length: 42 }, (_, i) => {
        const d = addDays(start, i), out = d.slice(0, 7) !== S.month;
        return h('button', { class: 'mday' + (out ? ' out' : '') + (d === S.sel ? ' on' : '') + (d === t ? ' today' : ''), type: 'button', 'aria-pressed': String(d === S.sel), 'aria-label': dayLabel(d), onclick: () => selectDate(d) },
          String(parseISO(d).getDate()), dayDots(d));
      })),
    h('div', { class: 'legend' },
      h('span', {}, h('span', { class: 'dots' }, h('i', { class: 'm' })), 'Meals'),
      h('span', {}, h('span', { class: 'dots' }, h('i', { class: 'x' })), 'Workout done'),
      h('span', {}, h('span', { class: 'dots' }, h('i', { class: 's' })), 'Scheduled'))));
}

function renderCard() {
  const t = totals(S.sel), st = S.settings, b = budget(t), left = Math.round(b - t.cal), over = left < 0;
  const pct = b > 0 ? Math.min(100, t.cal / b * 100) : 0;
  const d = S.days[S.sel] || { meals: [], exercises: [] };
  const bar = (label, val, goal, cls) => {
    const w = goal > 0 ? Math.min(100, val / goal * 100) : 0;
    return h('div', { class: 'mbar ' + cls + (cls !== 'p' && val > goal * 1.1 ? ' over' : '') },
      h('span', {}, label), h('span', { class: 't', role: 'meter', 'aria-label': `${label} ${Math.round(val)} of ${goal} grams`, 'aria-valuemin': 0, 'aria-valuemax': goal, 'aria-valuenow': Math.round(val) }, h('i', { style: `width:${w}%` })),
      h('em', {}, `${nf0.format(val)}/${nf0.format(goal)}g`));
  };
  // exercise summary
  const done = d.exercises.filter(x => x.status === 'done').sort((a, b2) => b2.kcal - a.kcal);
  const sched = d.exercises.filter(x => x.status === 'scheduled').sort((a, b2) => (a.time || '99').localeCompare(b2.time || '99'));
  let exBox;
  if (done.length) {
    const x = done[0], hd = exHeadline(x);
    exBox = h('div', { class: 'ex-sum' }, h('b', {}, hd.big), h('span', {}, `${hd.unit ? hd.unit + ' ' : ''}${exType(x.type).label.toLowerCase()}${done.length > 1 ? ` + ${done.length - 1} more` : ''}`, h('br'), exStats(x) || 'Tap the workout below to add details'));
  } else if (sched.length) {
    const x = sched[0];
    exBox = h('div', { class: 'ex-sum' }, h('b', {}, exHeadline(x).big), h('span', {}, `Scheduled ${exType(x.type).label.toLowerCase()}`, h('br'), [x.time ? fmtTime(x.time) : 'Any time', x.sec ? fmtDur(x.sec) : ''].filter(Boolean).join(' · ')));
  } else {
    exBox = h('div', { class: 'ex-sum' }, h('span', {}, 'No exercise yet. ', h('button', { class: 'link-btn', type: 'button', onclick: () => openExercise(null, 'done') }, 'Log a workout')));
  }
  // floating tags
  let tagA = null, tagB = null;
  if (d.meals.length) {
    const last = d.meals.reduce((a, m) => (m.t > a.t ? m : a), d.meals[0]);
    const k = sum(d.meals.filter(m => m.meal === last.meal), m => m.cal * m.qty);
    tagA = h('span', { class: 'float-tag a', 'aria-hidden': 'true' }, h('i'), `${mealLabel(last.meal)} · ${nf0.format(k)} kcal`);
    const p = t.p, g = st.protein;
    const txt = p >= g ? 'Protein goal hit' : p >= g * 0.5 ? 'Protein on track' : `${nf0.format(g - p)} g protein to go`;
    tagB = h('span', { class: 'float-tag b' + (p >= g * 0.5 ? ' ok' : ''), 'aria-hidden': 'true' }, h('i'), txt);
  }
  put($('#cardCol'),
    h('section', { class: 'today-card', 'aria-label': 'Day summary' },
      h('div', { class: 'tc-head' }, h('b', {}, S.sel === todayISO() ? 'Today' : fmt(S.sel, { weekday: 'long' })), h('span', { class: 'chip' }, fmt(S.sel, { month: 'short', day: 'numeric' }))),
      h('div', { class: 'ring-box' + (over ? ' over' : '') },
        svgRing(pct),
        h('div', { class: 'ring-mid' }, h('b', {}, nf0.format(Math.abs(left))), h('small', {}, over ? 'kcal over' : 'kcal left'))),
      h('div', { class: 'eq' }, h('span', {}, h('b', {}, nf0.format(st.calGoal)), ' goal'), h('span', {}, '−'), h('span', {}, h('b', {}, nf0.format(Math.round(t.cal))), ' food'),
        st.addBurn ? [h('span', {}, '+'), h('span', {}, h('b', {}, nf0.format(t.burn)), ' exercise')] : null),
      bar('Protein', t.p, st.protein, 'p'), bar('Carbs', t.c, st.carbs, 'c'), bar('Fat', t.f, st.fat, 'f'),
      exBox),
    tagA, tagB);
}
function svgRing(pct) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('aria-hidden', 'true');
  for (const [cls, dash] of [['track', null], ['fill', `${pct.toFixed(1)} 100`]]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', cls); c.setAttribute('cx', 60); c.setAttribute('cy', 60); c.setAttribute('r', 50); c.setAttribute('pathLength', 100);
    if (dash) { c.setAttribute('stroke-dasharray', dash); if (pct <= 0) c.setAttribute('stroke-opacity', '0'); }
    svg.append(c);
  }
  return svg;
}

function renderLog() {
  const d = S.days[S.sel] || { meals: [], exercises: [] }, t = totals(S.sel);
  const setup = !getKey() ? h('div', { class: 'setup-card' },
    h('p', {}, h('b', {}, 'Turn on AI food scanning. '), 'Add your Anthropic API key once and you can snap a meal or label to fill in the numbers.'),
    h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openSettings('ai') }, icon('key', 16), 'Set up')) : null;

  const foodSec = h('section', { class: 'log-sec', 'aria-label': 'Food' },
    h('div', { class: 'log-h' }, h('h2', {}, 'Food'), h('span', { class: 'k' }, t.n ? `${nf0.format(t.cal)} kcal` : ''),
      h('button', { class: 'add-mini', type: 'button', onclick: () => openAddMenu() }, '+ Add')),
    !d.meals.length ? h('div', { class: 'empty' }, h('b', {}, 'Nothing logged for this day'), 'Tap + to scan a meal with your camera, describe it, or enter it by hand.') : null,
    MEALS.map(m => {
      const items = d.meals.filter(x => x.meal === m.key).sort((a, b) => a.t - b.t);
      if (!items.length && !d.meals.length) return null;
      return h('div', { class: 'meal-g' },
        h('div', { class: 'meal-g-h' }, h('h3', {}, m.label), h('span', { class: 'k' }, items.length ? nf0.format(sum(items, x => x.cal * x.qty)) + ' kcal' : ''),
          h('button', { class: 'add-mini', type: 'button', 'aria-label': `Add to ${m.label}`, onclick: () => openAddMenu(m.key) }, '+')),
        items.length ? h('ul', { class: 'items' }, items.map(foodRow)) : null);
    }));

  const exs = d.exercises.slice().sort((a, b) => (a.status === b.status ? (a.time || '99').localeCompare(b.time || '99') : a.status === 'done' ? -1 : 1));
  const exSec = h('section', { class: 'log-sec', 'aria-label': 'Exercise' },
    h('div', { class: 'log-h' }, h('h2', {}, 'Exercise'), h('span', { class: 'k' }, t.burn ? `${nf0.format(t.burn)} kcal burned` : ''),
      h('button', { class: 'add-mini', type: 'button', onclick: () => openExercise(null, 'done') }, '+ Log'),
      h('button', { class: 'add-mini', type: 'button', onclick: () => openExercise(null, 'scheduled') }, 'Schedule')),
    exs.length ? exs.map(x => exCard(x, S.sel)) : h('div', { class: 'empty' }, h('b', {}, 'No workouts on this day'), 'Log one you finished, or schedule one and add it to Google Calendar.'));

  put($('#logCol'), setup, foodSec, exSec);
}
function foodRow(m) {
  const q = m.qty;
  const sub = [(q !== 1 ? nf2.format(q) + ' × ' : '') + (m.serving || '1 serving'), SRC[m.source]].filter(Boolean).join(' · ');
  return h('li', {}, h('button', { class: 'item', type: 'button', onclick: () => openEditMeal(S.sel, m.id) },
    h('span', { class: 'item-main' }, h('span', { class: 'item-name' }, m.name), h('span', { class: 'item-sub' }, sub)),
    h('span', { class: 'item-num' }, h('span', { class: 'item-k' }, nf0.format(m.cal * q), h('small', {}, ' kcal')),
      h('span', { class: 'mm', 'aria-label': `Protein ${nf0.format(m.p * q)} g, carbs ${nf0.format(m.c * q)} g, fat ${nf0.format(m.f * q)} g` },
        h('span', { class: 'c-p' }, 'P' + nf0.format(m.p * q)), h('span', { class: 'c-c' }, 'C' + nf0.format(m.c * q)), h('span', { class: 'c-f' }, 'F' + nf0.format(m.f * q))))));
}
function exCard(x, date) {
  const hd = exHeadline(x), sch = x.status === 'scheduled';
  return h('div', { class: 'ex' + (sch ? ' sched' : '') },
    h('button', { class: 'ex-main', type: 'button', onclick: () => openExercise({ date, id: x.id }) },
      h('span', { class: 'ex-big' }, hd.big, hd.unit ? h('small', {}, ' ' + hd.unit) : null),
      h('span', { class: 'ex-info' },
        h('span', { class: 'ex-t' }, [exType(x.type).label, x.time ? fmtTime(x.time) : ''].filter(Boolean).join(' · '), sch ? h('span', { class: 'chip blue' }, 'Scheduled') : h('span', { class: 'chip' }, 'Done')),
        h('span', { class: 'ex-s' }, exStats(x) || 'Tap to add time and distance'))),
    h('div', { class: 'ex-actions' },
      sch ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => openExercise({ date, id: x.id }, 'done') }, icon('check', 15), 'Mark done') : null,
      h('a', { class: 'gcal', href: gcalLink(x, date), target: '_blank', rel: 'noopener' }, icon('cal', 15), 'Add to Google Calendar')));
}

/* ================= sheet ================= */
const dlg = $('#sheet');
let sheetBuild = null, fromFab = false;
function openSheet(title, build) {
  $('#sheetTitle').textContent = title; sheetBuild = build; refreshSheet();
  if (!dlg.open) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } }
  $('#sheetBody').scrollTop = 0;
  $('#fab').setAttribute('aria-expanded', String(fromFab));
}
function refreshSheet() { if (sheetBuild) sheetBuild($('#sheetBody')); }
function closeSheet() { if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => {
  if (F) { if (F.ctl) F.ctl.abort(); stopTimer(); if (F.photoURL) URL.revokeObjectURL(F.photoURL); F = null; }
  sheetBuild = null; fromFab = false; $('#fab').setAttribute('aria-expanded', 'false');
});
dlg.addEventListener('click', e => { if (e.target === dlg) closeSheet(); });
$('#sheetClose').addEventListener('click', closeSheet);

function seg(options, value, onPick, label) {
  const wrap = h('div', { class: 'seg full', role: 'group', 'aria-label': label });
  const btns = options.map(([v, t]) => h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => { btns.forEach(b => b.setAttribute('aria-pressed', 'false')); btns[options.findIndex(o => o[0] === v)].setAttribute('aria-pressed', 'true'); onPick(v); } }, t));
  wrap.append(...btns); return wrap;
}

/* ================= + menu ================= */
let presetMeal = null;
function openAddMenu(meal) {
  presetMeal = meal || null;
  const hasKey = !!getKey();
  const opt = (ic, title, sub, onclick, primary) => h('button', { class: 'opt' + (primary ? ' primary' : ''), type: 'button', onclick },
    h('span', { class: 'o-ic' }, icon(ic)), h('span', { class: 'o-t' }, title), h('span', { class: 'o-sub' }, sub));
  const fileOpt = (ic, title, sub, capture, primary) => hasKey
    ? h('label', { class: 'opt' + (primary ? ' primary' : '') },
        h('span', { class: 'o-ic' }, icon(ic)), h('span', { class: 'o-t' }, title), h('span', { class: 'o-sub' }, sub),
        h('input', { class: 'vh', type: 'file', accept: 'image/*', capture: capture ? 'environment' : null, onchange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) openFood({ mode: 'scan', file: f }); } }))
    : h('button', { class: 'opt' + (primary ? ' primary' : ''), type: 'button', onclick: () => openSettings('ai') },
        h('span', { class: 'o-ic' }, icon(ic)), h('span', { class: 'o-t' }, title), h('span', { class: 'o-sub' }, 'Set up AI scanning first'), h('span', { class: 'chip o-lock' }, 'Setup'));
  openSheet('Add', body => put(body,
    h('p', { class: 'grp-l' }, presetMeal ? `Log ${mealLabel(presetMeal).toLowerCase()}` : 'Log a meal'),
    h('div', { class: 'opts' },
      fileOpt('camera', 'Scan with camera', 'Snap your plate or a nutrition label', true, true),
      fileOpt('image', 'Upload a photo', 'Pick a food photo you already took', false, false),
      hasKey ? opt('pencil', 'Describe it', 'Type what you ate and AI estimates it', () => openFood({ mode: 'describe' })) : opt('pencil', 'Describe it', 'Set up AI first', () => openSettings('ai')),
      opt('list', 'Enter manually', 'Type the numbers yourself', () => openFood({ mode: 'manual' }))),
    h('p', { class: 'grp-l' }, 'Log exercise'),
    h('div', { class: 'opts' },
      opt('check', 'I already did it', 'Log a finished workout', () => openExercise(null, 'done')),
      opt('cal', 'Schedule it', 'Plan a workout and add it to Google Calendar', () => openExercise(null, 'scheduled'))),
    h('p', { class: 'note' }, 'Adding to ', h('b', {}, dateLong(S.sel)), '. To add to another day, pick it on the calendar first.')));
}

/* ================= food flow ================= */
let F = null;
const blankItem = () => ({ id: uid(), name: '', serving: '1 serving', qty: 1, cal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sodium: 0, source: 'manual', include: true });
function openFood({ mode, file }) {
  if (F && F.photoURL) URL.revokeObjectURL(F.photoURL);
  F = { mode, stage: mode === 'manual' ? 'review' : mode, meal: presetMeal || mealForNow(), date: S.sel, items: mode === 'manual' ? [blankItem()] : [], note: '', busy: false, err: '', hint: '', text: '', photoURL: null, blob: null, ctl: null, started: 0, timer: null };
  openSheet(mode === 'manual' ? 'Add food' : mode === 'describe' ? 'Describe your meal' : 'Scan food', renderFood);
  if (file) usePhoto(file);
}
async function usePhoto(file) {
  if (!F) return;
  if (F.photoURL) URL.revokeObjectURL(F.photoURL);
  F.photoURL = URL.createObjectURL(file); F.stage = 'scan'; F.err = '';
  try { F.blob = await prepImage(file); }
  catch (e) { F.err = e.message || "This photo couldn't be read. Try a JPEG or PNG."; refreshSheet(); return; }
  runAI();
}
function renderFood(body) {
  if (!F) return;
  const busy = F.busy ? h('div', { class: 'busy', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }),
    h('p', {}, F.mode === 'describe' ? 'Estimating your meal…' : 'Reading your photo…', h('small', { id: 'busyT' }, elapsed())),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { if (F && F.ctl) F.ctl.abort(); } }, 'Stop')) : null;
  const err = F.err ? h('p', { class: 'err', role: 'alert' }, F.err) : null;
  const photoInputs = () => h('div', { class: 'row' },
    h('label', { class: 'btn btn-ghost btn-sm' }, icon('camera', 15), 'Retake', h('input', { class: 'vh', type: 'file', accept: 'image/*', capture: 'environment', onchange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) usePhoto(f); } })),
    h('label', { class: 'btn btn-ghost btn-sm' }, icon('image', 15), 'Choose another', h('input', { class: 'vh', type: 'file', accept: 'image/*', onchange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) usePhoto(f); } })));
  const hintRow = () => h('div', { class: 'fld' }, 'Note for the AI (optional)',
    h('div', { class: 'key-row' },
      h('input', { type: 'text', value: F.hint, placeholder: 'e.g. "I ate about half", "cooked in olive oil"', oninput: e => { F.hint = e.target.value; } }),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: F.busy || (F.mode === 'scan' && !F.blob), onclick: () => runAI() }, 'Ask again')));

  if (F.stage === 'scan') {
    put(body,
      F.photoURL ? h('img', { class: 'preview', src: F.photoURL, alt: 'Your food photo' }) : null,
      busy, err,
      !F.busy ? [photoInputs(), F.blob ? hintRow() : null, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { F.stage = 'review'; F.mode = 'manual'; F.items = [blankItem()]; refreshSheet(); } }, 'Enter it by hand instead')] : null);
    return;
  }
  if (F.stage === 'describe') {
    put(body,
      h('label', { class: 'fld' }, 'What did you eat?',
        h('textarea', { placeholder: 'e.g. 2 scrambled eggs, a slice of sourdough with butter and a large oat milk latte', oninput: e => { F.text = e.target.value; } }, F.text)),
      h('p', { class: 'note' }, 'Include amounts or brands if you know them. You can adjust everything before saving.'),
      busy, err,
      h('div', { class: 'sheet-actions' }, h('button', { class: 'btn btn-primary btn-wide', type: 'button', disabled: F.busy, onclick: () => { if (!F.text.trim()) { F.err = 'Type what you ate first.'; refreshSheet(); return; } runAI(); } }, 'Estimate nutrition')));
    return;
  }
  // review
  const saveBtn = h('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: saveFood });
  const upd = () => {
    const inc = F.items.filter(i => i.include !== false), k = sum(inc, i => i.cal * i.qty);
    saveBtn.textContent = inc.length ? `Save ${inc.length} ${inc.length === 1 ? 'item' : 'items'} · ${nf0.format(k)} kcal` : 'Select at least one item';
    saveBtn.disabled = !inc.length;
  };
  put(body,
    F.photoURL && F.mode === 'scan' ? h('img', { class: 'preview', src: F.photoURL, alt: 'Your food photo', style: 'max-height:150px' }) : null,
    F.note ? h('p', { class: 'ai-note' }, h('b', {}, 'AI: '), F.note) : null,
    F.mode !== 'manual' ? h('p', { class: 'note' }, 'Check the numbers and change anything that looks off. Untick anything you didn\'t eat.') : null,
    busy, err,
    h('ul', { class: 'eds' }, F.items.map(it => h('li', {}, itemEditor(it, { checkbox: F.mode !== 'manual' || F.items.length > 1, onChange: upd })))),
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { F.items.push(blankItem()); refreshSheet(); } }, icon('plus', 15), 'Add another item'),
    F.mode !== 'manual' && !F.busy ? hintRow() : null,
    h('div', {}, h('p', { class: 'grp-l', style: 'margin-bottom:8px' }, 'Meal'), seg(MEALS.map(m => [m.key, m.label]), F.meal, v => { F.meal = v; }, 'Meal')),
    h('p', { class: 'note' }, 'Saving to ', h('b', {}, dateLong(F.date)), '.'),
    h('div', { class: 'sheet-actions sticky-actions' }, saveBtn));
  upd();
}
function saveFood() {
  if (!F) return;
  const inc = F.items.filter(i => i.include !== false); if (!inc.length) return;
  const day = ensureDay(F.date), now = Date.now();
  inc.forEach((it, k) => day.meals.push(normMeal({ ...it, name: it.name.trim() || 'Food', meal: F.meal, id: uid(), t: now + k })));
  const n = inc.length, ml = mealLabel(F.meal);
  if (save()) toast(`Saved ${n} ${n === 1 ? 'item' : 'items'} to ${ml}`);
  closeSheet(); render();
}
function itemEditor(it, opts) {
  opts = opts || {};
  const total = h('div', { class: 'ed-total', 'aria-live': 'polite' });
  const upd = () => { const q = it.qty; total.textContent = `Total: ${nf0.format(it.cal * q)} kcal · protein ${nf1.format(it.p * q)} g · carbs ${nf1.format(it.c * q)} g · fat ${nf1.format(it.f * q)} g`; if (opts.onChange) opts.onChange(); };
  const numF = (key, label, unit, step) => h('label', { class: 'fld' }, label, h('span', { class: 'in-u' },
    h('input', { type: 'number', inputmode: 'decimal', min: 0, step: step || 'any', value: inVal(it[key]), oninput: e => { it[key] = num(e.target.value); upd(); } }), h('i', {}, unit)));
  const qty = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 0.25, value: inVal(it.qty), 'aria-label': 'Number of servings', oninput: e => { it.qty = num(e.target.value); upd(); } });
  const step = dlt => { it.qty = Math.max(0, Math.round((it.qty + dlt) * 4) / 4); qty.value = inVal(it.qty); upd(); };
  const card = h('div', { class: 'ed' + (opts.checkbox && it.include === false ? ' off' : '') });
  card.append(
    h('div', { class: 'ed-top' },
      opts.checkbox ? h('input', { type: 'checkbox', checked: it.include !== false, 'aria-label': 'Include this item', onchange: e => { it.include = e.target.checked; card.classList.toggle('off', !it.include); if (opts.onChange) opts.onChange(); } }) : null,
      h('input', { class: 'ed-name', type: 'text', value: it.name, placeholder: 'Food name', 'aria-label': 'Food name', oninput: e => { it.name = e.target.value; } }),
      SRC[it.source] ? h('span', { class: 'chip' + (it.source === 'label' ? ' blue' : '') }, SRC[it.source]) : null),
    h('div', { class: 'ed-serv' },
      h('label', { class: 'fld' }, 'Serving size', h('input', { type: 'text', value: it.serving, placeholder: '1 cup (240 g)', oninput: e => { it.serving = e.target.value; } })),
      h('div', { class: 'fld' }, 'Servings', h('div', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': 'Half a serving less', onclick: () => step(-0.5) }, '−'), qty,
        h('button', { type: 'button', 'aria-label': 'Half a serving more', onclick: () => step(0.5) }, '+')))),
    h('p', { class: 'per' }, 'Per serving'),
    h('div', { class: 'grid4' }, numF('cal', 'Calories', 'kcal', 1), numF('p', 'Protein', 'g'), numF('c', 'Carbs', 'g'), numF('f', 'Fat', 'g')),
    h('details', { class: 'ed-more' }, h('summary', {}, 'Fiber, sugar & sodium'),
      h('div', { class: 'grid3' }, numF('fiber', 'Fiber', 'g'), numF('sugar', 'Sugar', 'g'), numF('sodium', 'Sodium', 'mg', 1))),
    total);
  upd();
  return card;
}
function openEditMeal(date, id) {
  const day = S.days[date]; if (!day) return;
  const orig = day.meals.find(m => m.id === id); if (!orig) return;
  const it = { ...orig }; let meal = it.meal, confirmDel = false;
  openSheet('Edit food', body => put(body,
    itemEditor(it),
    h('div', {}, h('p', { class: 'grp-l', style: 'margin-bottom:8px' }, 'Meal'), seg(MEALS.map(m => [m.key, m.label]), meal, v => { meal = v; }, 'Meal')),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: () => {
        const d = ensureDay(date), i = d.meals.findIndex(m => m.id === id);
        const next = normMeal({ ...it, name: it.name.trim() || 'Food', meal });
        if (i >= 0) d.meals[i] = next; else d.meals.push(next);
        if (save()) toast('Saved'); closeSheet(); render();
      } }, 'Save changes'),
      date !== todayISO() ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => {
        ensureDay(todayISO()).meals.push(normMeal({ ...it, meal, id: uid(), t: Date.now() })); if (save()) toast('Copied to today'); closeSheet(); render();
      } }, 'Copy to today') : null,
      h('button', { class: 'btn btn-danger', type: 'button', onclick: e => {
        if (!confirmDel) { confirmDel = true; e.currentTarget.textContent = 'Tap again to delete'; return; }
        const d = ensureDay(date); d.meals = d.meals.filter(m => m.id !== id); if (save()) toast('Deleted'); closeSheet(); render();
      } }, 'Delete'))));
}

/* ================= AI (Claude) ================= */
let SDK = null;
async function loadSDK() { if (!SDK) SDK = (await import('./vendor/anthropic-sdk.mjs')).default; return SDK; }
const ITEM_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['name', 'serving', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'source', 'confidence'],
  properties: {
    name: { type: 'string' }, serving: { type: 'string' }, calories: { type: 'number' }, protein_g: { type: 'number' }, carbs_g: { type: 'number' },
    fat_g: { type: 'number' }, fiber_g: { type: 'number' }, sugar_g: { type: 'number' }, sodium_mg: { type: 'number' },
    source: { type: 'string', enum: ['label', 'product', 'estimate'] }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  }
};
const SCHEMA = { type: 'object', additionalProperties: false, required: ['items', 'note'], properties: { items: { type: 'array', items: ITEM_SCHEMA }, note: { type: 'string' } } };
const RULES = [
  '- "serving" is the amount the numbers are for, in everyday units with grams where helpful, e.g. "1 cup (185 g)".',
  '- calories in kcal; protein_g, carbs_g, fat_g, fiber_g and sugar_g in grams; sodium_mg in milligrams. Use your best single number, never a range.',
  '- "confidence" is how sure you are about the numbers.',
  '- "note" is one short sentence on what you saw or assumed.'
].join('\n');
function scanPrompt(hint) {
  return [
    'You are the food scanner in a calorie and macro tracking app. Look at the attached photo.',
    'It may show a plated meal, a single food or drink, the front of a packaged product, or a nutrition facts label.',
    '- List each distinct food or drink as its own item. Treat a mixed dish such as a burrito, sandwich or salad as one item.',
    '- If a nutrition label is readable, copy its per-serving numbers exactly, use the label serving size, and set "source" to "label".',
    '- If it is a recognizable packaged or restaurant product without a readable label, use that product\'s standard nutrition and set "source" to "product".',
    '- Otherwise estimate the visible portion and set "source" to "estimate".',
    RULES,
    '- If there is no food or drink in the photo, return no items and say what you saw in "note".',
    hint ? 'The person added this note about the photo: ' + JSON.stringify(hint.slice(0, 300)) : ''
  ].filter(Boolean).join('\n');
}
function describePrompt(text, hint) {
  return [
    'You are the nutrition estimator in a calorie and macro tracking app. The person describes what they ate.',
    '- Split it into separate items and estimate each for the amount described. If no amount is given, assume one typical serving and say so in "serving".',
    '- If they name a brand or restaurant item, use its standard nutrition and set "source" to "product"; otherwise set "source" to "estimate".',
    RULES,
    'What they ate: ' + JSON.stringify(text.slice(0, 1500)),
    hint ? 'Extra note: ' + JSON.stringify(hint.slice(0, 300)) : ''
  ].filter(Boolean).join('\n');
}
function aiError(e, A) {
  const detail = (e && e.error && e.error.error && e.error.error.message) || (e && e.message) || '';
  if (A && e instanceof A.APIUserAbortError) return { code: 'cancelled', message: '' };
  if (A && e instanceof A.AuthenticationError) return { code: 'auth', message: 'Anthropic rejected the API key. Check it in Settings.' };
  if (A && e instanceof A.PermissionDeniedError) return { code: 'perm', message: "This API key can't use the model. Check your Anthropic account." };
  if (A && e instanceof A.RateLimitError) return { code: 'rate', message: 'Too many requests right now. Wait a minute and try again.' };
  if (A && e instanceof A.BadRequestError) return { code: 'bad', message: 'Anthropic couldn\'t process this request: ' + detail };
  if (A && e instanceof A.APIConnectionTimeoutError) return { code: 'timeout', message: 'The AI took too long to answer. Try again.' };
  if (A && e instanceof A.APIConnectionError) return { code: 'net', message: "Couldn't reach Anthropic. Check your internet connection and try again." };
  if (A && e instanceof A.APIError) return { code: 'api', message: `Anthropic had a problem${e.status ? ' (error ' + e.status + ')' : ''}. Try again in a moment.` };
  return { code: 'other', message: 'Something went wrong. Try again.' };
}
async function analyzeFood({ key, blob, text, hint, signal }) {
  let A;
  try { A = await loadSDK(); } catch (e) { throw { code: 'load', message: "Couldn't load the AI tools. Check your connection and reload the page." }; }
  const client = new A({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 180000 });
  const content = [];
  if (blob) content.push({ type: 'image', source: { type: 'base64', media_type: blob.type || 'image/jpeg', data: await toBase64(blob) } });
  content.push({ type: 'text', text: blob ? scanPrompt(hint) : describePrompt(text, hint) });
  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }]
    }, { signal });
  } catch (e) { throw aiError(e, A); }
  if (res.stop_reason === 'refusal') throw { code: 'refused', message: 'The AI declined this one. Try a different photo, or describe the meal instead.' };
  if (res.stop_reason === 'max_tokens') throw { code: 'cut', message: 'The answer was cut short. Try a photo with fewer items.' };
  const txt = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let data;
  try { data = JSON.parse(txt); } catch (e) { throw { code: 'parse', message: "The AI's answer couldn't be read. Try again." }; }
  const items = (Array.isArray(data && data.items) ? data.items : []).filter(x => x && typeof x === 'object').slice(0, 20).map(x => ({
    id: uid(), name: str(x.name, 'Food', 80), serving: str(x.serving, '1 serving', 60), qty: 1,
    cal: Math.round(num(x.calories)), p: r1(num(x.protein_g)), c: r1(num(x.carbs_g)), f: r1(num(x.fat_g)),
    fiber: r1(num(x.fiber_g)), sugar: r1(num(x.sugar_g)), sodium: Math.round(num(x.sodium_mg)),
    source: ['label', 'product', 'estimate'].includes(x.source) ? x.source : 'estimate', include: true
  }));
  return { items, note: typeof data.note === 'string' ? data.note.slice(0, 300) : '' };
}
async function checkKey(key) {
  let A;
  try { A = await loadSDK(); } catch (e) { return { ok: false, message: "Couldn't load the AI tools. Check your connection." }; }
  try {
    const client = new A({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 20000 });
    await client.models.retrieve(MODEL);
    return { ok: true };
  } catch (e) { return { ok: false, message: aiError(e, A).message }; }
}
async function runAI() {
  if (!F) return;
  const key = getKey();
  if (!key) { F.err = 'Add your Anthropic API key in Settings to use AI.'; refreshSheet(); return; }
  if (F.ctl) F.ctl.abort();
  const ctl = new AbortController(); F.ctl = ctl; F.busy = true; F.err = ''; F.started = Date.now();
  stopTimer(); F.timer = setInterval(() => { const el = $('#busyT'); if (el) el.textContent = elapsed(); }, 1000);
  refreshSheet();
  const f = F;
  try {
    const res = await analyzeFood({ key, blob: f.mode === 'describe' ? null : f.blob, text: f.text, hint: f.hint.trim(), signal: ctl.signal });
    if (F !== f || f.ctl !== ctl) return;
    if (!res.items.length) f.err = (res.note ? res.note + ' ' : '') + 'No food found. Try another photo or describe it instead.';
    else { f.items = res.items; f.note = res.note; f.stage = 'review'; }
  } catch (e) {
    if (F !== f || f.ctl !== ctl) return;
    if (!(e && e.code === 'cancelled')) f.err = (e && e.message) || 'Something went wrong. Try again.';
  }
  f.busy = false; f.ctl = null; stopTimer();
  if (F === f && dlg.open) refreshSheet();
}
const elapsed = () => F && F.started ? `${Math.round((Date.now() - F.started) / 1000)}s · usually 10 to 40 seconds` : '';
function stopTimer() { if (F && F.timer) { clearInterval(F.timer); F.timer = null; } }
function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
}
async function prepImage(file) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    const out = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    if (out) return out;
  } catch (e) { /* fall through */ }
  if (ok.includes(file.type) && file.size < 4.5e6) return file;
  throw new Error("This photo's format isn't supported here. Try a JPEG or PNG photo.");
}

/* ================= exercise ================= */
function openExercise(ref, status) {
  const date0 = ref ? ref.date : S.sel;
  const ex0 = ref ? ((S.days[ref.date] && S.days[ref.date].exercises) || []).find(x => x.id === ref.id) : null;
  if (ref && !ex0) return;
  const x = ex0 ? { ...ex0 } : normEx({ id: uid(), status: status || 'done', type: 'run', time: status === 'scheduled' ? '07:00' : '' });
  if (status) x.status = status;
  const V = { h: x.sec ? String(Math.floor(x.sec / 3600)) : '', m: x.sec ? String(Math.floor((x.sec % 3600) / 60)) : '', s: x.sec ? String(Math.round(x.sec % 60)) : '', dist: x.km ? String(Math.round(kmToU(x.km) * 100) / 100) : '' };
  let date = date0, confirmDel = false;
  const title = ex0 ? (status === 'done' && ex0.status === 'scheduled' ? 'Mark as done' : 'Edit workout') : (x.status === 'scheduled' ? 'Schedule a workout' : 'Log a workout');
  const sync = () => {
    x.sec = num(V.h) * 3600 + num(V.m) * 60 + num(V.s);
    x.km = exType(x.type).dist ? uToKm(num(V.dist)) : 0;
    if (x.kcalAuto) x.kcal = estBurn(x);
  };
  openSheet(title, body => {
    sync();
    const t = exType(x.type);
    const live = h('div', { class: 'live', 'aria-live': 'polite' });
    const kcalIn = h('input', { type: 'number', inputmode: 'numeric', min: 0, step: 1, value: x.kcal ? String(x.kcal) : '', 'aria-label': 'Calories burned', oninput: e => { x.kcal = Math.round(num(e.target.value)); x.kcalAuto = false; reset.hidden = false; refreshLive(); } });
    const reset = h('button', { class: 'link-btn', type: 'button', hidden: x.kcalAuto, onclick: () => { x.kcalAuto = true; reset.hidden = true; refreshLive(); } }, 'Use the estimate');
    const gl = h('a', { class: 'gcal', target: '_blank', rel: 'noopener' }, icon('cal', 15), 'Add to Google Calendar');
    const refreshLive = () => {
      sync();
      if (x.kcalAuto) kcalIn.value = x.kcal ? String(x.kcal) : '';
      const dU = kmToU(x.km);
      put(live,
        t.dist && dU > 0 && x.sec > 0 ? h('span', {}, 'Pace ', h('b', {}, fmtPace(x.sec / dU) + ' /' + U())) : null,
        x.sec ? h('span', {}, 'Time ', h('b', {}, fmtDur(x.sec))) : null,
        h('span', {}, 'Burn ', h('b', {}, x.kcal ? '≈ ' + nf0.format(x.kcal) + ' kcal' : '–')));
      gl.href = gcalLink(x, date);
    };
    const durIn = (k, ph, lab, unit) => h('span', { class: 'in-u' }, h('input', { type: 'number', inputmode: 'numeric', min: 0, step: 1, placeholder: ph, value: V[k], 'aria-label': lab, oninput: e => { V[k] = e.target.value; refreshLive(); } }), h('i', {}, unit));
    put(body,
      seg([['done', 'I did it'], ['scheduled', 'Scheduled']], x.status, v => { x.status = v; if (v === 'scheduled' && !x.time) x.time = '07:00'; refreshSheet(); }, 'Status'),
      h('div', {}, h('p', { class: 'grp-l', style: 'margin-bottom:8px' }, 'Type'),
        h('div', { class: 'type-grid', role: 'group', 'aria-label': 'Workout type' }, EX.map(e => h('button', { type: 'button', 'aria-pressed': String(e.key === x.type), onclick: () => { x.type = e.key; if (!e.dist) V.dist = ''; refreshSheet(); } }, e.label)))),
      h('div', { class: 'grid2' },
        h('label', { class: 'fld' }, 'Date', h('input', { type: 'date', value: date, onchange: e => { if (isISO(e.target.value)) { date = e.target.value; refreshLive(); } } })),
        h('label', { class: 'fld' }, x.status === 'scheduled' ? 'Start time' : 'Start time (optional)', h('input', { type: 'time', value: x.time, oninput: e => { x.time = e.target.value; refreshLive(); } }))),
      h('div', { class: 'fld' }, x.status === 'scheduled' ? 'Planned duration' : 'Duration',
        h('div', { class: 'grid3' }, durIn('h', '0', 'Hours', 'h'), durIn('m', '45', 'Minutes', 'm'), durIn('s', '0', 'Seconds', 's'))),
      t.dist ? h('label', { class: 'fld' }, 'Distance', h('span', { class: 'in-u' }, h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 0.01, placeholder: U() === 'mi' ? '3.1' : '5', value: V.dist, oninput: e => { V.dist = e.target.value; refreshLive(); } }), h('i', {}, U()))) : null,
      h('div', { class: 'fld' }, 'Calories burned', h('span', { class: 'in-u' }, kcalIn, h('i', {}, 'kcal')), reset),
      h('label', { class: 'fld' }, 'Notes', h('textarea', { placeholder: 'How it felt, route, sets and reps…', style: 'min-height:72px', oninput: e => { x.notes = e.target.value; } }, x.notes)),
      live,
      h('div', { class: 'row' }, gl, h('span', { class: 'muted', style: 'font-size:12.5px' }, 'Opens Google Calendar with this workout filled in.')),
      h('div', { class: 'sheet-actions sticky-actions' },
        h('button', { class: 'btn btn-primary btn-wide', type: 'button', onclick: () => {
          sync();
          const next = normEx({ ...x, t: ex0 ? ex0.t : Date.now() });
          const nd = ensureDay(date), i = nd.exercises.findIndex(e => e.id === x.id);
          if (ex0 && date0 === date && i >= 0) nd.exercises[i] = next;
          else {
            if (ex0) { const od = ensureDay(date0); od.exercises = od.exercises.filter(e => e.id !== x.id); }
            nd.exercises.push(next);
          }
          if (save()) toast(next.status === 'scheduled' ? 'Workout scheduled' : 'Workout saved');
          closeSheet();
          if (date !== S.sel) selectDate(date); else render();
        } }, x.status === 'scheduled' ? 'Save to schedule' : 'Save workout'),
        ex0 ? h('button', { class: 'btn btn-danger', type: 'button', onclick: e => {
          if (!confirmDel) { confirmDel = true; e.currentTarget.textContent = 'Tap again to delete'; return; }
          const od = ensureDay(date0); od.exercises = od.exercises.filter(e2 => e2.id !== x.id); if (save()) toast('Workout deleted'); closeSheet(); render();
        } }, 'Delete') : null));
    refreshLive();
  });
}

/* ================= settings ================= */
function openSettings(focus) {
  let keyMsg = null, confirmClear = false;
  openSheet(focus === 'ai' ? 'AI food scanning' : 'Settings', body => {
    const st = S.settings, hasKey = !!getKey();
    const numF = (key, label, unit) => h('label', { class: 'fld' }, label, h('span', { class: 'in-u' },
      h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 1, value: inVal(st[key]), oninput: e => { const v = Number(e.target.value); if (v > 0) { st[key] = v; save(); macroLine(); render(); } } }), h('i', {}, unit)));
    const check = h('p', { class: 'note' });
    const macroLine = () => {
      const k = st.protein * 4 + st.carbs * 4 + st.fat * 9, diff = k - st.calGoal;
      check.textContent = `Protein ×4 + carbs ×4 + fat ×9 = ${nf0.format(k)} kcal, ` + (Math.abs(diff) <= st.calGoal * 0.05 ? 'which matches your calorie goal.' : `${nf0.format(Math.abs(diff))} kcal ${diff > 0 ? 'over' : 'under'} your calorie goal.`);
    };
    macroLine();
    const keyIn = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: hasKey ? 'Saved on this device' : 'sk-ant-…', 'aria-label': 'Anthropic API key' });
    const saveKeyBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => {
      const k = keyIn.value.trim();
      if (!k) { keyMsg = { ok: false, text: 'Paste your key first.' }; refreshSheet(); return; }
      saveKeyBtn.disabled = true; saveKeyBtn.textContent = 'Checking…';
      const r = await checkKey(k);
      if (r.ok) { setKey(k); keyMsg = { ok: true, text: 'Key checked and saved. AI scanning is on.' }; render(); }
      else keyMsg = { ok: false, text: r.message + ' The key was not saved.' };
      if (dlg.open) refreshSheet();
    } }, 'Save key');
    const aiSection = h('section', { class: 'fld', style: 'gap:10px' },
      h('p', { class: 'grp-l' }, 'AI food scanning'),
      h('p', { class: 'note' }, hasKey ? h('b', {}, 'On. ') : h('b', {}, 'Off. '), 'Scanning uses Claude through your own Anthropic API key. Get one at ',
        h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener' }, 'console.anthropic.com'), ' (API Keys). The key is saved only in this browser on this device and is sent only to Anthropic when you scan. Each scan costs a few cents on your Anthropic account.'),
      h('div', { class: 'key-row' }, keyIn, saveKeyBtn),
      keyMsg ? h('p', { class: keyMsg.ok ? 'ok-msg' : 'err', role: 'status' }, keyMsg.text) : null,
      hasKey ? h('div', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { setKey(''); keyMsg = { ok: true, text: 'Key removed from this device.' }; render(); refreshSheet(); } }, 'Remove key')) : null);
    const importIn = h('input', { class: 'vh', type: 'file', accept: 'application/json,.json', onchange: async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      try {
        const o = JSON.parse(await f.text());
        if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') throw new Error('bad');
        let n = 0;
        for (const [k, v] of Object.entries(o.days)) if (isISO(k)) { S.days[k] = normDay(v); n++; }
        if (o.settings) S.settings = { ...DEFAULTS, ...cleanSettings(o.settings) };
        if (save()) toast(`Imported ${n} ${n === 1 ? 'day' : 'days'}`); render(); refreshSheet();
      } catch (err) { toast("That file isn't a DSJ backup."); }
    } });
    put(body,
      focus === 'ai' ? aiSection : null,
      h('p', { class: 'grp-l' }, 'Daily goals'),
      h('div', { class: 'grid2' }, numF('calGoal', 'Calories', 'kcal'), numF('protein', 'Protein', 'g'), numF('carbs', 'Carbs', 'g'), numF('fat', 'Fat', 'g')),
      check,
      h('p', { class: 'grp-l' }, 'Body & units'),
      h('div', { class: 'grid2' }, numF('weight', 'Body weight', st.weightUnit),
        h('label', { class: 'fld' }, 'Weight unit', h('select', { onchange: e => { st.weightUnit = e.target.value; save(); render(); refreshSheet(); } }, [['lb', 'Pounds (lb)'], ['kg', 'Kilograms (kg)']].map(([v, t]) => h('option', { value: v, selected: st.weightUnit === v }, t)))),
        h('label', { class: 'fld' }, 'Distance unit', h('select', { onchange: e => { st.distUnit = e.target.value; save(); render(); } }, [['mi', 'Miles'], ['km', 'Kilometers']].map(([v, t]) => h('option', { value: v, selected: st.distUnit === v }, t))))),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: st.addBurn, onchange: e => { st.addBurn = e.target.checked; save(); render(); } }),
        h('span', {}, h('b', {}, 'Add exercise calories to my daily budget'), h('br'), h('span', { class: 'muted' }, 'Burned calories are estimated from your body weight. You can change them on any workout.'))),
      focus !== 'ai' ? aiSection : null,
      h('p', { class: 'grp-l' }, 'Your data'),
      h('p', { class: 'note' }, 'Your log is saved in this browser on this device. Download a backup to keep it safe or move it to another device. Backups never include your API key.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: exportBackup }, 'Download backup'),
        h('label', { class: 'btn btn-ghost btn-sm' }, 'Import backup', importIn),
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: e => {
          if (!confirmClear) { confirmClear = true; e.currentTarget.textContent = 'Tap again to delete everything'; return; }
          S.days = {}; save(); toast('All entries deleted'); render(); closeSheet();
        } }, 'Delete all entries')));
    if (focus === 'ai' && !hasKey) setTimeout(() => keyIn.focus({ preventScroll: true }), 120);
  });
}
function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: 'dsj-tracker', v: 1, exported: new Date().toISOString(), days: S.days, settings: S.settings }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `dsj-tracker-backup-${todayISO()}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ================= toast & wiring ================= */
let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }

function setView(v) { S.view = v; try { localStorage.setItem(LS_VIEW, v); } catch (e) { /* ignore */ } S.month = S.sel.slice(0, 7); render(); }
$('#prevDay').addEventListener('click', () => selectDate(addDays(S.sel, -1)));
$('#nextDay').addEventListener('click', () => selectDate(addDays(S.sel, 1)));
$('#goToday').addEventListener('click', () => selectDate(todayISO()));
$('#viewWeek').addEventListener('click', () => setView('week'));
$('#viewMonth').addEventListener('click', () => setView('month'));
$('#openSettings').addEventListener('click', () => openSettings());
$('#fab').addEventListener('click', () => { fromFab = true; openAddMenu(); });
window.addEventListener('storage', e => { if (e.key === LS) { S.days = {}; load(); render(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderDate(); });

load();
render();
