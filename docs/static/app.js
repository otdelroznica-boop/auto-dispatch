'use strict';

/* ================= Состояние ================= */
const S = {
  me: null, vehicles: [], drivers: [], services: [], settings: {},
  date: isoDate(new Date()),
  veh: localGet('veh', 'all'),
  status: 'all', search: '',
  orders: [],
  view: 'day',
  phoneMode: localGet('phoneMode', 'timeline'),
  report: { period: 'week', from: null, to: null },
};
const F = {}; // форма заказа

const STATUS = { new: 'Новый', work: 'В работе', done: 'Выполнен', cancel: 'Отменён' };
const PAY = { cash: 'Наличные', card: 'Перевод', invoice: 'Безнал' };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ================= Утилиты ================= */
function localGet(k, d) { try { return localStorage.getItem('dsp_' + k) ?? d; } catch { return d; } }
function localSet(k, v) { try { localStorage.setItem('dsp_' + k, v); } catch { /* приватный режим */ } }
function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(v) { return Math.round(v || 0).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'; }
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function toTime(min) { min = Math.max(0, Math.min(1440, min)); return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function icon(id) { return `<svg><use href="#i-${id}"/></svg>`; }
function isPhone() { return matchMedia('(max-width: 767px)').matches; }

function dateRu(s, withWeekday = true) {
  const d = parseDate(s);
  const txt = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (!withWeekday) return txt;
  const today = isoDate(new Date());
  const rel = s === today ? 'сегодня' : s === addDays(today, 1) ? 'завтра' : s === addDays(today, -1) ? 'вчера'
    : d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return `${rel}, ${txt}`;
}

function formatPhone(raw) {
  let d = digits(raw);
  if (!d) return '';
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  d = d.slice(0, 11);
  let out = '+7';
  if (d.length > 1) out += ' (' + d.slice(1, 4);
  if (d.length >= 4) out += ')';
  if (d.length > 4) out += ' ' + d.slice(4, 7);
  if (d.length > 7) out += '-' + d.slice(7, 9);
  if (d.length > 9) out += '-' + d.slice(9, 11);
  return out;
}

function payState(o) {
  if (o.status === 'cancel') return null;
  if (o.plan_amount > 0 && o.paid_amount >= o.plan_amount - 0.01) return { cls: 'b-paid', text: 'оплачено' };
  if (o.paid_amount > 0) return { cls: 'b-debt', text: 'долг ' + money(o.plan_amount - o.paid_amount) };
  if (o.status === 'done' && o.plan_amount > 0) return { cls: 'b-debt', text: 'не оплачено' };
  return { cls: 'b-unpaid', text: 'не оплачено' };
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const res = await fetch(path.replace(/^\//, ''), init);
  if (res.status === 401 && !path.startsWith('/api/login')) { showLogin(); throw new Error('Нужно войти'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const detail = data?.detail;
    const err = new Error(typeof detail === 'string' ? detail : detail?.message || (Array.isArray(detail) ? 'Проверьте заполнение полей' : 'Ошибка ' + res.status));
    err.status = res.status; err.detail = detail;
    throw err;
  }
  return data;
}

/* ================= Вход ================= */
let loginUser = null, pin = '';

async function showLogin() {
  $('#app').classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
  const users = await api('/api/login-users');
  const box = $('#loginUsers');
  box.innerHTML = users.map(u => `<button data-id="${u.id}">${esc(u.name)}</button>`).join('');
  $$('button', box).forEach(b => b.onclick = () => pickLoginUser(+b.dataset.id));
  const last = +localGet('lastUser', 0);
  if (users.length === 1) pickLoginUser(users[0].id);
  else if (users.some(u => u.id === last)) pickLoginUser(last);
}

function pickLoginUser(id) {
  loginUser = id; pin = '';
  $$('#loginUsers button').forEach(b => b.classList.toggle('active', +b.dataset.id === id));
  $('#pinBox').classList.remove('hidden');
  $('#loginError').textContent = '';
  renderPinDots();
}

function renderPinDots() { $$('#pinDots i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); }

function initPinPad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  $('#pinPad').innerHTML = keys.map(k => k === '' ? '<span></span>'
    : k === 'del' ? '<button class="ghost" data-k="del">Стереть</button>' : `<button data-k="${k}">${k}</button>`).join('');
  $('#pinPad').onclick = e => { const k = e.target.closest('button')?.dataset.k; if (k) pinKey(k); };
  document.addEventListener('keydown', e => {
    if ($('#loginScreen').classList.contains('hidden') || !loginUser) return;
    if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('del');
  });
}

async function pinKey(k) {
  if (k === 'del') pin = pin.slice(0, -1);
  else if (pin.length < 4) pin += k;
  renderPinDots();
  if (pin.length === 4) {
    try {
      await api('/api/login', { method: 'POST', body: { user_id: loginUser, pin } });
      localSet('lastUser', loginUser);
      $('#loginScreen').classList.add('hidden');
      await start();
    } catch (e) {
      $('#loginError').textContent = e.message;
      pin = ''; renderPinDots();
    }
  }
}

/* ================= Старт ================= */
async function start() {
  const b = await api('/api/bootstrap');
  Object.assign(S, { me: b.me, vehicles: b.vehicles, drivers: b.drivers, services: b.services, reasons: b.reasons || [], types: b.types || [], expCats: b.expense_categories || [], settings: b.settings });
  if (S.veh !== 'all' && !S.vehicles.some(v => v.id === +S.veh && v.active)) S.veh = 'all';
  $('#brandName').textContent = S.settings.company_name || 'Диспетчерская';
  $('#loginTitle').textContent = S.settings.company_name || 'Диспетчерская';
  $('#brandUser').textContent = S.me.name;
  document.title = S.settings.company_name || 'Диспетчерская';
  $('#app').classList.remove('hidden');
  setView(S.view);
  await loadDay();
  scrollTimelineToNow();
}

function activeVehicles() { return S.vehicles.filter(v => v.active); }
function vehicleById(id) { return S.vehicles.find(v => v.id === +id); }

/* ================= Навигация ================= */
function setView(view) {
  S.view = view;
  const map = { day: '#viewDay', report: '#viewReport', clients: '#viewClients', settings: '#viewSettings', fleet: '#viewFleet' };
  Object.entries(map).forEach(([k, sel]) => $(sel).classList.toggle('hidden', k !== view));
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('.datebar').style.visibility = view === 'day' ? '' : 'hidden';
  if (isPhone()) $('.datebar').style.display = view === 'day' ? '' : 'none';
  if (view === 'report') loadReport();
  if (view === 'clients') loadClients();
  if (view === 'settings') renderSettings();
  if (view === 'fleet') loadFleet();
  setDialogWide(false);
  if (view === 'day') renderDay();
  window.scrollTo(0, 0);
}

function initNav() {
  $$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#prevDay').onclick = () => setDate(addDays(S.date, -1));
  $('#nextDay').onclick = () => setDate(addDays(S.date, 1));
  $('#todayBtn').onclick = () => setDate(isoDate(new Date()));
  $('#dateInput').onchange = e => e.target.value && setDate(e.target.value);
  $('#newOrderBtn').onclick = () => openOrder(null, {});
  $('#fabNew').onclick = () => openOrder(null, {});
  $$('[data-lost-new]').forEach(b => b.onclick = () => openLost(null));
  $('#newExpenseBtn').onclick = () => openExpense(null);
  $('#searchInput').oninput = e => { S.search = e.target.value.trim().toLowerCase(); renderDay(); };
  $$('#statusTabs button').forEach(b => b.onclick = () => {
    S.status = b.dataset.status;
    $$('#statusTabs button').forEach(x => x.classList.toggle('active', x === b));
    renderList();
  });
  $$('#phoneMode button').forEach(b => b.onclick = () => { S.phoneMode = b.dataset.mode; localSet('phoneMode', S.phoneMode); renderDay(); });
  $$('[data-close]').forEach(b => b.onclick = () => b.closest('.sheet-backdrop').classList.add('hidden'));
  $$('.sheet-backdrop').forEach(bd => bd.addEventListener('mousedown', e => { if (e.target === bd) bd.classList.add('hidden'); }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.sheet-backdrop').forEach(b => b.classList.add('hidden'));
  });
}

async function setDate(d) {
  S.date = d;
  await loadDay();
}

async function loadDay() {
  $('#dateLabel').textContent = dateRu(S.date);
  $('#dateInput').value = S.date;
  [S.orders, S.lost] = await Promise.all([api('/api/orders?date=' + S.date), api('/api/lost?date=' + S.date)]);
  renderDay();
}

/* ================= День ================= */
function visibleVehicles() {
  const act = activeVehicles();
  return S.veh === 'all' ? act : act.filter(v => v.id === +S.veh);
}

function matchesSearch(o) {
  if (!S.search) return true;
  const q = S.search, qd = digits(q);
  const hay = [o.client_name, o.address_from, o.address_to, o.note, o.driver_name, String(o.id)].join(' ').toLowerCase();
  if (hay.includes(q)) return true;
  if (qd.length >= 3) {
    const p = digits(o.client_phone);
    const tail = qd.length >= 4 && (qd[0] === '7' || qd[0] === '8') ? qd.slice(1) : qd;
    return p.includes(tail);
  }
  return false;
}

function dayOrders() {
  const ids = new Set(visibleVehicles().map(v => v.id));
  return S.orders.filter(o => ids.has(o.vehicle_id));
}

function renderDay() {
  if (S.view !== 'day') return;
  // вкладки машин
  const tabs = [{ id: 'all', name: 'Все авто' }, ...activeVehicles()];
  $('#vehicleTabs').innerHTML = tabs.map(v => `<button data-veh="${v.id}" class="${String(S.veh) === String(v.id) ? 'active' : ''}">
    ${v.color ? `<i class="dot" style="background:${esc(v.color)}"></i>` : ''}${esc(v.name)}</button>`).join('');
  $$('#vehicleTabs button').forEach(b => b.onclick = () => { S.veh = b.dataset.veh; localSet('veh', S.veh); renderDay(); });
  $$('#phoneMode button').forEach(b => b.classList.toggle('active', b.dataset.mode === S.phoneMode));
  $('.day-body').dataset.mode = S.phoneMode;

  // итоги дня
  const act = dayOrders().filter(o => o.status !== 'cancel');
  const plan = act.reduce((s, o) => s + o.plan_amount, 0);
  const paid = act.reduce((s, o) => s + o.paid_amount, 0);
  const debt = act.filter(o => o.status === 'done').reduce((s, o) => s + Math.max(o.plan_amount - o.paid_amount, 0), 0);
  const lost = dayLost(), lostSum = lost.reduce((s, l) => s + l.amount, 0);
  if (isPhone()) {
    $('#dayStats').innerHTML = `<div><b>${act.length}</b> зак. на <b>${money(plan)}</b></div>
      <div>взяли <b class="ok">${money(paid)}</b>${debt > 0 ? `, долг <b style="color:var(--danger)">${money(debt)}</b>` : ''}</div>
      ${lost.length ? `<div>отказов ${lost.length} на <b style="color:var(--warn)">${money(lostSum)}</b></div>` : ''}`;
  } else $('#dayStats').innerHTML = `
    <div class="stat"><span>Заказов</span><b>${act.length}</b></div>
    <div class="stat"><span>Расчёт</span><b>${money(plan)}</b></div>
    <div class="stat ${paid > 0 ? 'ok' : ''}"><span>Взяли</span><b>${money(paid)}</b></div>
    ${debt > 0 ? `<div class="stat bad"><span>Не добрали</span><b>${money(debt)}</b></div>` : ''}
    ${lost.length ? `<div class="stat warn" title="Упущенная прибыль за день"><span>Отказов ${lost.length}</span><b>${money(lostSum)}</b></div>` : ''}`;

  renderList();
  renderTimeline();
  renderFleetBanner();
  topbarHeight();
}

function orderCard(o) {
  const v = vehicleById(o.vehicle_id);
  const ps = payState(o);
  const next = o.status === 'new' ? ['work', 'В работу'] : o.status === 'work' ? ['done', 'Выполнен'] : null;
  return `<div class="ocard ${o.status}" style="--c:${esc(v?.color || '#2563eb')}" data-id="${o.id}">
    <div class="ocard-top">${o.start_time}–${o.end_time}
      ${S.veh === 'all' ? `<span class="veh"><i class="dot" style="background:${esc(v?.color)}"></i>${esc(o.vehicle_name)}</span>` : ''}
      <span class="badge b-${o.status}">${STATUS[o.status]}</span></div>
    <div class="ocard-line">${icon('user')}<span>${esc(o.client_name || 'Без имени')} ${esc(o.client_phone || '')}</span></div>
    ${o.address_from ? `<div class="ocard-line">${icon('pin')}<span>${esc(o.address_from)}${o.address_to ? ' → ' + esc(o.address_to) : ''}</span></div>` : ''}
    ${o.lines.length ? `<div class="ocard-line"><span>${esc(o.lines.map(l => l.title).join(', '))}</span></div>` : ''}
    <div class="ocard-money"><b>${money(o.plan_amount)}</b>${ps ? `<span class="badge ${ps.cls}">${esc(ps.text)}</span>` : ''}
      ${o.driver_name ? `<span class="muted" style="margin-left:auto">${esc(o.driver_name)}</span>` : ''}</div>
    ${o.status !== 'cancel' ? `<div class="ocard-actions">
      ${o.client_phone ? `<a class="chip" href="tel:+${digits(o.client_phone)}" data-stop style="display:inline-flex;align-items:center;text-decoration:none">Позвонить</a>` : ''}
      <button class="chip" data-pay="${o.id}">Взяли</button>
      ${next ? `<button class="chip" data-next="${o.id}" data-st="${next[0]}">${next[1]}</button>` : ''}
    </div>` : ''}
  </div>`;
}

function dayLost() {
  const types = new Set(visibleVehicles().map(v => v.type_id));
  return (S.lost || []).filter(l => S.veh === 'all' || types.has(l.type_id));
}

function lostCard(l) {
  return `<div class="ocard lost" data-lost="${l.id}" style="--c:var(--warn)">
    <div class="ocard-top">Отказ${l.time ? ' ' + l.time : ''}
      ${l.type_name || l.vehicle_name ? `<span class="veh" style="display:inline-flex">${esc(l.type_name || l.vehicle_name)}</span>` : ''}
      <span class="badge ${l.partner ? 'b-paid' : 'b-work'}">${l.partner ? 'партнёру' : 'упущен'}</span></div>
    <div class="ocard-line"><span>${esc(l.reason_title || 'Причина не указана')}</span></div>
    ${l.lines.length ? `<div class="ocard-line"><span>${esc(l.lines.map(x => x.title).join(', '))}</span></div>` : ''}
    <div class="ocard-money"><b>${money(l.amount)}</b>${l.partner && l.partner_income ? `<span class="muted">получили ${money(l.partner_income)}</span>` : ''}
      ${l.client_phone ? `<span class="muted" style="margin-left:auto">${esc(l.client_phone)}</span>` : ''}</div>
  </div>`;
}

function renderList() {
  const all = dayOrders();
  const list = all.filter(o => (S.status === 'all' || o.status === S.status) && matchesSearch(o));
  const lost = S.status === 'all' && !S.search ? dayLost() : [];
  const box = $('#orderList');
  const lostHtml = lost.length ? `<div class="list-note" style="margin-top:6px">Отказы за день</div>` + lost.map(lostCard).join('') : '';
  if (!all.length) {
    box.innerHTML = `<div class="empty"><b>Заказов нет</b>Нажмите на свободное время на шкале или кнопку «Заказ».</div>` + lostHtml;
  } else {
    const note = list.length !== all.length ? `<div class="list-note">Показано ${list.length} из ${all.length}</div>` : '';
    box.innerHTML = note + (list.length ? list.map(orderCard).join('')
      : `<div class="empty"><b>Ничего не найдено</b>Измените поиск или фильтр.</div>`) + lostHtml;
    bindCards(box);
  }
  $$('[data-lost]', box).forEach(c => c.onclick = () => openLost((S.lost || []).find(l => l.id === +c.dataset.lost)));
}

function bindCards(box) {
  $$('.ocard[data-id]', box).forEach(c => c.addEventListener('click', e => {
    if (e.target.closest('[data-stop]')) return;
    const pay = e.target.closest('[data-pay]'), nx = e.target.closest('[data-next]');
    if (pay) return quickPay(+pay.dataset.pay);
    if (nx) return quickStatus(+nx.dataset.next, nx.dataset.st);
    openOrder(+c.dataset.id);
  }));
}

function timelineRange() {
  let start = +S.settings.day_start || 7, end = +S.settings.day_end || 23;
  dayOrders().forEach(o => {
    start = Math.min(start, Math.floor(toMin(o.start_time) / 60));
    end = Math.max(end, Math.ceil(toMin(o.end_time) / 60));
  });
  return [start, Math.min(end, 24)];
}

function renderTimeline() {
  const vehs = visibleVehicles();
  const [h0, h1] = timelineRange();
  const cols = `52px repeat(${vehs.length}, minmax(${isPhone() ? 120 : 160}px, 1fr))`;
  const hours = [];
  for (let h = h0; h < h1; h++) hours.push(h);

  let html = `<div class="tl-head" style="grid-template-columns:${cols}"><div></div>`;
  html += vehs.map(v => {
    const drv = S.drivers.find(d => d.id === v.default_driver_id);
    return `<div><i class="dot" style="background:${esc(v.color)}"></i>${esc(v.name)}${v.ownership === 'hired' ? ' <span class="badge b-unpaid">наёмная</span>' : ''}${drv && !isPhone() ? ` <small>${esc(drv.name)}</small>` : ''}</div>`;
  }).join('');
  html += `</div><div class="tl-grid" style="grid-template-columns:${cols}"><div class="tl-times">`;
  html += hours.map(h => `<div class="tl-time">${String(h).padStart(2, '0')}:00</div>`).join('') + '</div>';
  vehs.forEach(v => {
    html += `<div class="tl-lane" data-veh="${v.id}">`;
    hours.forEach(h => { html += `<div class="tl-slot" data-t="${h * 60}"></div><div class="tl-slot" data-t="${h * 60 + 30}"></div>`; });
    html += '</div>';
  });
  html += '</div>';
  const tl = $('#timeline');
  tl.innerHTML = html;

  const hourPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 64;
  const pxPerMin = hourPx / 60;
  vehs.forEach(v => {
    const lane = $(`.tl-lane[data-veh="${v.id}"]`, tl);
    S.orders.filter(o => o.vehicle_id === v.id).forEach(o => {
      const top = (toMin(o.start_time) - h0 * 60) * pxPerMin;
      const height = Math.max((toMin(o.end_time) - toMin(o.start_time)) * pxPerMin - 2, 24);
      const ps = payState(o);
      const el = document.createElement('div');
      el.className = `tl-block st-${o.status}` + (height < (isPhone() ? 100 : 56) ? ' short' : '');
      el.style.top = top + 1 + 'px';
      el.style.height = height + 'px';
      if (S.search && !matchesSearch(o)) el.style.opacity = '.25';
      el.innerHTML = `<div class="t">${o.start_time}–${o.end_time}
          ${ps ? `<span class="badge ${ps.cls}">${esc(ps.text)}</span>` : `<span class="badge b-cancel">отменён</span>`}
          <span class="sum">${money(o.plan_amount)}</span></div>
        <div class="c">${esc(o.client_name || 'Без имени')} ${esc(o.client_phone || '')}</div>
        <div class="a">${esc([o.address_from, o.lines.map(l => l.title).join(', '), o.note].filter(Boolean).join(' · '))}</div>`;
      el.onclick = e => { e.stopPropagation(); openOrder(o.id); };
      lane.appendChild(el);
    });
    lane.addEventListener('click', e => {
      const slot = e.target.closest('.tl-slot');
      if (!slot) return;
      const t = +slot.dataset.t;
      openOrder(null, { vehicle_id: v.id, start: toMin(toTime(t)) });
    });
  });

  // линия «сейчас»
  if (S.date === isoDate(new Date())) {
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    if (m >= h0 * 60 && m <= h1 * 60) {
      const line = document.createElement('div');
      line.className = 'tl-now';
      line.style.top = (m - h0 * 60) * pxPerMin + 'px';
      line.style.left = '52px';
      $('.tl-grid', tl).appendChild(line);
    }
  }
}

function topbarHeight() {
  const h = $('.topbar').offsetHeight;
  document.documentElement.style.setProperty('--topbar-h', h + 'px');
  return h;
}

function scrollTimelineToNow() {
  const tl = $('#timeline');
  const [h0] = timelineRange();
  const first = S.orders.length ? Math.min(...S.orders.map(o => toMin(o.start_time))) : null;
  const now = new Date();
  const target = S.date === isoDate(now) ? now.getHours() * 60 - 60 : first ?? 9 * 60;
  const hourPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 64;
  const offset = Math.max(0, (target - h0 * 60) / 60 * hourPx);
  if (!isPhone()) tl.scrollTop = offset;
  else if (S.phoneMode === 'timeline') window.scrollTo(0, Math.max(0, tl.getBoundingClientRect().top + window.scrollY - topbarHeight() - 40 + offset));
}

/* ================= Быстрые действия ================= */
async function quickStatus(id, status) {
  await api(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } });
  toast(`Статус: ${STATUS[status]}`);
  await loadDay();
}

function quickPay(id) {
  const o = S.orders.find(x => x.id === id);
  let method = o.payment_method;
  openDialog('Сколько взяли', `
    <div class="muted">${esc(o.client_name || 'Без имени')}, ${o.start_time}–${o.end_time}. Расчёт: <b>${money(o.plan_amount)}</b></div>
    <label class="field"><span>Взяли, ₽</span>
      <div class="input-with-btn"><input type="number" id="qpAmount" inputmode="decimal" value="${o.paid_amount || o.plan_amount || ''}">
      <button class="chip" type="button" id="qpFull">= всё</button></div></label>
    <div class="seg seg-full" id="qpMethod">${Object.entries(PAY).map(([k, t]) => `<button data-v="${k}" class="${k === method ? 'active' : ''}">${t}</button>`).join('')}</div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="qpDone" ${o.status !== 'done' ? 'checked' : ''} style="width:20px;height:20px"> Отметить «Выполнен»</label>`,
    [{ text: 'Сохранить', primary: true, onClick: async () => {
      await api(`/api/orders/${id}/pay`, { method: 'PATCH', body: { paid_amount: +$('#qpAmount').value || 0, payment_method: method, mark_done: $('#qpDone').checked } });
      closeDialog(); toast('Оплата записана'); await loadDay();
    } }]);
  $('#qpFull').onclick = () => { $('#qpAmount').value = o.plan_amount; };
  $$('#qpMethod button').forEach(b => b.onclick = () => { method = b.dataset.v; $$('#qpMethod button').forEach(x => x.classList.toggle('active', x === b)); });
  setTimeout(() => $('#qpAmount').select(), 50);
}

/* ================= Универсальное окно ================= */
function openDialog(title, body, buttons = []) {
  $('#dialogTitle').textContent = title;
  $('#dialogBody').innerHTML = body;
  const foot = $('#dialogFoot');
  foot.innerHTML = '';
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.primary ? 'btn-primary' : b.danger ? 'btn-danger-ghost' : 'btn-ghost');
    el.textContent = b.text;
    el.onclick = async () => {
      el.disabled = true;
      try { await b.onClick(); } catch (e) { toast(e.message, true); } finally { el.disabled = false; }
    };
    foot.appendChild(el);
  });
  $('#dialog').classList.remove('hidden');
}
function closeDialog() { $('#dialog').classList.add('hidden'); setDialogWide(false); }

/* ================= Форма заказа ================= */
function timeOptions() {
  let html = '';
  for (let m = 0; m <= 1440; m += 30) html += `<option value="${toTime(m)}">${toTime(m)}</option>`;
  return html;
}

async function openOrder(id, preset = {}) {
  let o = null;
  if (id) o = await api('/api/orders/' + id);
  const defVeh = preset.vehicle_id || (S.veh !== 'all' ? +S.veh : activeVehicles()[0]?.id);
  const now = new Date();
  let start = preset.start ?? nextFreeSlot(defVeh, S.date === isoDate(now) ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30 : 9 * 60);
  start = Math.min(start, 1410);

  Object.assign(F, {
    id: o?.id || null,
    vehicle_id: o?.vehicle_id || defVeh,
    driver_id: o ? o.driver_id : vehicleById(defVeh)?.default_driver_id ?? null,
    date: o?.date || preset.date || S.date,
    start: o?.start_time || toTime(start),
    end: o?.end_time || toTime(Math.min(start + 60, 1440)),
    client: o?.client_id ? { id: o.client_id, kind: o.client_kind, name: o.client_name || '', phone: o.client_phone || '', inn: o.client_inn || '' }
      : { id: preset.client?.id || null, kind: preset.client?.kind || 'person', name: preset.client?.name || '', phone: preset.client?.phone || '', inn: preset.client?.inn || '' },
    lines: (o?.lines || []).map(l => ({ ...l })),
    plan: o?.plan_amount || 0,
    paid: o?.paid_amount || 0,
    pay: o?.payment_method || 'cash',
    status: o?.status || 'new',
    from: o?.address_from || '', to: o?.address_to || '', note: o?.note || '',
    order: o,
  });

  $('#orderTitle').textContent = o ? `Заказ #${o.id}` : 'Новый заказ';
  $('#ofStart').innerHTML = timeOptions();
  $('#ofEnd').innerHTML = timeOptions();
  $('#ofDate').value = F.date;
  $('#ofStart').value = F.start;
  $('#ofEnd').value = F.end;
  $('#ofPhone').value = F.client.phone ? formatPhone(F.client.phone) : '';
  $('#ofName').value = F.client.name;
  $('#ofInn').value = F.client.inn;
  $('#ofPlan').value = F.plan || '';
  $('#ofPaid').value = F.paid || '';
  $('#ofFrom').value = F.from;
  $('#ofTo').value = F.to;
  $('#ofNote').value = F.note;
  $('#ofSuggest').classList.add('hidden');

  renderOfVehicle(); renderOfDrivers(); renderOfKind(); renderOfClientFound();
  renderOfServices(); renderOfLines(); renderOfSeg('#ofPay', 'pay', F.pay); renderOfSeg('#ofStatus', 'status', F.status);
  $$('#ofDuration button').forEach(b => b.classList.toggle('active', +b.dataset.min === toMin(F.end) - toMin(F.start)));

  $('#ofExtra').classList.toggle('hidden', !o);
  if (o) {
    $('#ofCall').href = o.client_phone ? 'tel:+' + digits(o.client_phone) : '#';
    $('#ofCall').style.display = o.client_phone ? '' : 'none';
    const q = o.address_to ? `?rtext=${encodeURIComponent(o.address_from)}~${encodeURIComponent(o.address_to)}&rtt=auto` : `?text=${encodeURIComponent(o.address_from)}`;
    $('#ofMap').href = 'https://yandex.ru/maps/' + q;
    $('#ofMap').style.display = o.address_from ? '' : 'none';
    $('#ofMeta').textContent = `Создал: ${o.created_by_name || '—'}, ${o.created_at?.slice(0, 16).replace('T', ' ')}`;
  } else {
    $('#ofMeta').textContent = '';
  }
  await checkConflict();
  $('#orderSheet').classList.remove('hidden');
  $('#orderSheet .sheet-body').scrollTop = 0;
  if (!o && !isPhone()) setTimeout(() => $('#ofPhone').focus(), 60);
}

// ближайшее время, когда машина свободна хотя бы час (заказы текущего дня)
function nextFreeSlot(vehId, from) {
  const busy = S.orders.filter(o => o.vehicle_id === vehId && o.status !== 'cancel')
    .map(o => [toMin(o.start_time), toMin(o.end_time)]);
  for (let t = from; t <= 1380; t += 30) {
    if (!busy.some(([s, e]) => s < t + 60 && e > t)) return t;
  }
  return from;
}

function renderOfSeg(sel, key, val) {
  $$(sel + ' button').forEach(b => b.classList.toggle('active', b.dataset[key] === val));
}

function renderOfVehicle() {
  $('#ofVehicle').innerHTML = activeVehicles().map(v => `<button data-id="${v.id}" class="${v.id === F.vehicle_id ? 'active' : ''}">
    <i class="dot" style="background:${esc(v.color)}"></i>${esc(v.name)}</button>`).join('');
  $$('#ofVehicle button').forEach(b => b.onclick = () => {
    const prev = vehicleById(F.vehicle_id);
    F.vehicle_id = +b.dataset.id;
    // водитель по умолчанию меняется вместе с машиной, если его не выбирали вручную
    if (!F.driver_id || F.driver_id === prev?.default_driver_id) F.driver_id = vehicleById(F.vehicle_id).default_driver_id;
    renderOfVehicle(); renderOfDrivers(); renderOfServices(); checkConflict();
  });
}

function renderOfDrivers() {
  const list = S.drivers.filter(d => d.active || d.id === F.driver_id);
  $('#ofDriver').innerHTML = '<option value="">Не указан</option>' + list.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  $('#ofDriver').value = F.driver_id || '';
}

function renderOfKind() {
  renderOfSeg('#ofKind', 'kind', F.client.kind);
  $('#ofNameLabel').textContent = F.client.kind === 'org' ? 'Организация' : 'Имя';
  $('#ofInnWrap').classList.toggle('hidden', F.client.kind !== 'org');
}

function renderOfClientFound() {
  const box = $('#ofClientFound');
  if (F.client.id) {
    box.innerHTML = `Клиент из базы${F.client.stats ? ': ' + esc(F.client.stats) : ''}<button class="link-btn" type="button" id="ofClientReset">Другой клиент</button>`;
    box.classList.remove('hidden');
    $('#ofClientReset').onclick = () => {
      F.client = { id: null, kind: 'person', name: '', phone: '', inn: '' };
      $('#ofPhone').value = ''; $('#ofName').value = ''; $('#ofInn').value = '';
      renderOfKind(); renderOfClientFound(); $('#ofPhone').focus();
    };
  } else {
    box.classList.add('hidden');
  }
}

function durationHours() { return Math.max(0.5, (toMin(F.end) - toMin(F.start)) / 60); }

function renderOfDuration() {
  const dur = toMin(F.end) - toMin(F.start);
  $$('#ofDuration button').forEach(b => b.classList.toggle('active', +b.dataset.min === dur));
  // почасовые услуги следуют за длительностью заказа
  let changed = false;
  F.lines.forEach(l => {
    const unit = l.unit || S.services.find(x => x.id === l.service_id)?.unit;
    if (unit === 'ч' && dur > 0 && l.qty !== dur / 60) { l.qty = dur / 60; changed = true; }
  });
  if (changed) renderOfLines();
}

function servicesFor(vehId) { return servicesForType(vehicleById(vehId)?.type_id); }
function servicesForType(typeId) {
  return S.services.filter(s => s.active && (s.type_id === null || s.type_id === typeId));
}

function renderOfServices() {
  $('#ofServiceChips').innerHTML = servicesFor(F.vehicle_id).map(s =>
    `<button type="button" data-id="${s.id}" class="${F.lines.some(l => l.service_id === s.id) ? 'active' : ''}">${esc(s.title)}<small>${money(s.price)}${s.unit && s.unit !== 'шт' ? '/' + esc(s.unit) : ''}</small></button>`).join('');
  $$('#ofServiceChips button').forEach(b => b.onclick = () => {
    const s = S.services.find(x => x.id === +b.dataset.id);
    const line = F.lines.find(l => l.service_id === s.id);
    if (line) line.qty += 1;
    else F.lines.push({ service_id: s.id, title: s.title, qty: s.unit === 'ч' ? durationHours() : 1, price: s.price, unit: s.unit });
    renderOfLines(); renderOfServices();
  });
}

function recalcPlan() {
  if (F.lines.length) {
    F.plan = F.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.price || 0), 0);
    $('#ofPlan').value = F.plan;
    $('#ofPlan').readOnly = true;
    $('#ofPlan').title = 'Считается по услугам';
  } else {
    $('#ofPlan').readOnly = false;
    $('#ofPlan').title = '';
  }
}

function renderOfLines() {
  $('#ofLines').innerHTML = F.lines.map((l, i) => `<div class="line" data-i="${i}">
    <div class="title">${l.service_id ? esc(l.title) : `<input type="text" data-f="title" value="${esc(l.title)}" placeholder="Название услуги">`}</div>
    <div class="qty"><button type="button" data-q="-1">−</button><input type="number" inputmode="decimal" data-f="qty" value="${l.qty}"><button type="button" data-q="1">+</button></div>
    <input class="price" type="number" inputmode="decimal" data-f="price" value="${l.price}" aria-label="Цена">
    <button type="button" class="rm" aria-label="Убрать">${icon('x')}</button></div>`).join('');
  $$('#ofLines .line').forEach(row => {
    const l = F.lines[+row.dataset.i];
    $$('input', row).forEach(inp => inp.oninput = () => {
      l[inp.dataset.f] = inp.dataset.f === 'title' ? inp.value : (parseFloat(inp.value) || 0);
      recalcPlan();
    });
    $$('[data-q]', row).forEach(b => b.onclick = () => {
      l.qty = Math.max(1, (+l.qty || 0) + +b.dataset.q);
      $('[data-f=qty]', row).value = l.qty;
      recalcPlan();
    });
    $('.rm', row).onclick = () => { F.lines.splice(+row.dataset.i, 1); renderOfLines(); renderOfServices(); };
  });
  recalcPlan();
}

let conflictTimer;
async function checkConflict() {
  const box = $('#ofConflict');
  const list = F.date === S.date ? S.orders : await api('/api/orders?date=' + F.date).catch(() => []);
  const s = toMin(F.start), e = toMin(F.end);
  const c = list.find(o => o.vehicle_id === F.vehicle_id && o.id !== F.id && o.status !== 'cancel'
    && toMin(o.start_time) < e && toMin(o.end_time) > s);
  if (e <= s) {
    box.textContent = 'Время окончания должно быть позже начала';
    box.classList.remove('hidden');
  } else if (c) {
    const typeId = vehicleById(F.vehicle_id)?.type_id;
    const free = activeVehicles().filter(v => v.id !== F.vehicle_id && v.type_id === typeId && !list.some(o => o.vehicle_id === v.id
      && o.id !== F.id && o.status !== 'cancel' && toMin(o.start_time) < e && toMin(o.end_time) > s));
    box.innerHTML = `<div>Машина в это время занята: ${c.start_time}–${c.end_time}, ${esc(c.client_name || 'без имени')}</div>
      ${free.length ? `<div style="margin-top:6px">Свободна: ${free.map(v => esc(v.name)).join(', ')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${free.map(v => `<button type="button" class="btn btn-sm btn-ghost" data-switch="${v.id}">Записать на «${esc(v.name)}»</button>`).join('')}</div>`
      : `${typeId ? `<div style="margin-top:6px">Все машины вида «${esc(typeName(typeId))}» в это время заняты.</div>` : ''}
        ${F.id ? '' : '<button type="button" class="btn btn-sm btn-ghost" id="ofToLost" style="margin-top:8px">Записать как отказ</button>'}`}`;
    box.classList.remove('hidden');
    $$('[data-switch]', box).forEach(btn => btn.onclick = () => {
      const prev = vehicleById(F.vehicle_id);
      F.vehicle_id = +btn.dataset.switch;
      if (!F.driver_id || F.driver_id === prev?.default_driver_id) F.driver_id = vehicleById(F.vehicle_id).default_driver_id;
      renderOfVehicle(); renderOfDrivers(); renderOfServices(); checkConflict();
    });
    const b = $('#ofToLost');
    if (b) b.onclick = () => {
      $('#orderSheet').classList.add('hidden');
      openLost(null, { type_id: typeId, date: F.date, lines: F.lines.map(l => ({ ...l })), client_phone: F.client.phone,
        note: [F.client.name, $('#ofFrom').value.trim(), $('#ofNote').value.trim()].filter(Boolean).join(', '),
        reason_id: S.reasons.find(r => r.active && /занят/i.test(r.title))?.id ?? null });
    };
  } else box.classList.add('hidden');
}

let suggestTimer;
async function onPhoneInput() {
  const inp = $('#ofPhone');
  const d = digits(inp.value);
  inp.value = d ? formatPhone(inp.value) : '';
  F.client.phone = inp.value;
  if (F.client.id) { F.client.id = null; renderOfClientFound(); }
  clearTimeout(suggestTimer);
  if (d.length < 3) { $('#ofSuggest').classList.add('hidden'); return; }
  suggestTimer = setTimeout(async () => {
    const list = await api('/api/clients?limit=6&q=' + encodeURIComponent(d));
    const full = digits(F.client.phone);
    const exact = full.length === 11 && list.find(c => c.phone_norm === full);
    if (exact) { pickClient(exact); return; }
    renderSuggest(list);
  }, 180);
}

async function onNameInput() {
  F.client.name = $('#ofName').value;
  if (F.client.id || digits(F.client.phone).length >= 3) return;
  clearTimeout(suggestTimer);
  const q = F.client.name.trim();
  if (q.length < 2) { $('#ofSuggest').classList.add('hidden'); return; }
  suggestTimer = setTimeout(async () => renderSuggest(await api('/api/clients?limit=6&q=' + encodeURIComponent(q))), 200);
}

function renderSuggest(list) {
  const box = $('#ofSuggest');
  if (!list.length) { box.classList.add('hidden'); return; }
  box.innerHTML = list.map((c, i) => `<button type="button" data-i="${i}">
    <div class="main"><b>${esc(c.name || 'Без имени')}</b><small>${esc(c.phone)}${c.kind === 'org' ? ' · организация' : ''}</small></div>
    <small>${c.orders_count ? c.orders_count + ' зак.' : 'новый'}</small></button>`).join('');
  $$('button', box).forEach(b => b.onmousedown = e => { e.preventDefault(); pickClient(list[+b.dataset.i]); });
  box.classList.remove('hidden');
}

function pickClient(c) {
  F.client = { id: c.id, kind: c.kind, name: c.name, phone: c.phone, inn: c.inn || '',
    stats: c.orders_count ? `${c.orders_count} зак., последний ${c.last_date ? dateRu(c.last_date, false) : '—'}` : '' };
  $('#ofPhone').value = formatPhone(c.phone) || c.phone;
  $('#ofName').value = c.name;
  $('#ofInn').value = c.inn || '';
  $('#ofSuggest').classList.add('hidden');
  renderOfKind(); renderOfClientFound();
}

function initOrderForm() {
  $('#ofDate').onchange = e => { F.date = e.target.value; checkConflict(); };
  $('#ofStart').onchange = e => {
    const dur = toMin(F.end) - toMin(F.start);
    F.start = e.target.value;
    F.end = toTime(Math.min(toMin(F.start) + Math.max(dur, 30), 1440));
    $('#ofEnd').value = F.end;
    renderOfDuration(); checkConflict();
  };
  $('#ofEnd').onchange = e => { F.end = e.target.value; renderOfDuration(); checkConflict(); };
  $$('#ofDuration button').forEach(b => b.onclick = () => {
    F.end = toTime(Math.min(toMin(F.start) + +b.dataset.min, 1440));
    $('#ofEnd').value = F.end;
    renderOfDuration(); checkConflict();
  });
  $('#ofPhone').oninput = onPhoneInput;
  $('#ofPhone').onblur = () => setTimeout(() => $('#ofSuggest').classList.add('hidden'), 150);
  $('#ofName').oninput = onNameInput;
  $('#ofName').onblur = () => setTimeout(() => $('#ofSuggest').classList.add('hidden'), 150);
  $('#ofInn').oninput = e => { F.client.inn = e.target.value; };
  $$('#ofKind button').forEach(b => b.onclick = () => { F.client.kind = b.dataset.kind; renderOfKind(); });
  $('#ofDriver').onchange = e => { F.driver_id = e.target.value ? +e.target.value : null; };
  $('#ofAddCustom').onclick = () => {
    F.lines.push({ service_id: null, title: '', qty: 1, price: 0 });
    renderOfLines();
    $$('#ofLines .line').at(-1).querySelector('input').focus();
  };
  $('#ofPlan').oninput = e => { F.plan = parseFloat(e.target.value) || 0; };
  $('#ofPaid').oninput = e => { F.paid = parseFloat(e.target.value) || 0; };
  $('#ofPaidFull').onclick = () => { F.paid = F.plan; $('#ofPaid').value = F.plan; };
  $$('#ofPay button').forEach(b => b.onclick = () => { F.pay = b.dataset.pay; renderOfSeg('#ofPay', 'pay', F.pay); });
  $$('#ofStatus button').forEach(b => b.onclick = () => { F.status = b.dataset.status; renderOfSeg('#ofStatus', 'status', F.status); });
  $('#saveOrderBtn').onclick = () => saveOrder();
  $('#saveOrderTop').onclick = () => saveOrder();
  $('#ofDelete').onclick = deleteOrder;
  $('#ofShare').onclick = shareToDriver;
}

async function saveOrder(force = false) {
  const body = {
    vehicle_id: F.vehicle_id, driver_id: F.driver_id, date: F.date, start_time: F.start, end_time: F.end,
    client: (F.client.id || digits(F.client.phone) || F.client.name.trim())
      ? { id: F.client.id, kind: F.client.kind, name: $('#ofName').value.trim(), phone: F.client.phone, inn: F.client.inn } : null,
    address_from: $('#ofFrom').value.trim(), address_to: $('#ofTo').value.trim(), note: $('#ofNote').value.trim(),
    status: F.status, lines: F.lines.filter(l => String(l.title).trim()), plan_amount: F.plan, paid_amount: F.paid,
    payment_method: F.pay, force,
  };
  const btns = [$('#saveOrderBtn'), $('#saveOrderTop')];
  btns.forEach(b => b.disabled = true);
  try {
    const saved = await api(F.id ? '/api/orders/' + F.id : '/api/orders', { method: F.id ? 'PUT' : 'POST', body });
    $('#orderSheet').classList.add('hidden');
    toast(F.id ? 'Заказ сохранён' : `Заказ #${saved.id} записан`);
    if (saved.date !== S.date) S.date = saved.date;
    await loadDay();
  } catch (e) {
    if (e.status === 409 && e.detail?.conflict_id) {
      if (confirm(e.message + '\n\nВсё равно записать?')) return saveOrder(true);
    } else toast(e.message, true);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

async function deleteOrder() {
  if (!confirm(`Удалить заказ #${F.id} совсем? Если клиент отказался, лучше поставить статус «Отменён» — он останется в истории.`)) return;
  await api('/api/orders/' + F.id, { method: 'DELETE' });
  $('#orderSheet').classList.add('hidden');
  toast('Заказ удалён');
  await loadDay();
}

function driverText(o) {
  const lines = [
    `Заказ #${o.id}: ${dateRu(o.date)}, ${o.start_time}–${o.end_time}`,
    `${o.vehicle_name}${o.driver_name ? ', водитель ' + o.driver_name : ''}`,
    `Клиент: ${o.client_name || 'без имени'} ${o.client_phone || ''}`.trim(),
  ];
  if (o.address_from) lines.push('Откуда: ' + o.address_from);
  if (o.address_to) lines.push('Куда: ' + o.address_to);
  if (o.lines.length) lines.push('Услуги: ' + o.lines.map(l => l.title + (l.qty !== 1 ? ' × ' + l.qty : '')).join('; '));
  lines.push(`Взять: ${money(o.plan_amount - o.paid_amount > 0 ? o.plan_amount - o.paid_amount : 0)} (${PAY[o.payment_method]})`);
  if (o.note) lines.push('Комментарий: ' + o.note);
  return lines.join('\n');
}

function shareToDriver() {
  const o = F.order;
  const text = driverText(o);
  const drv = S.drivers.find(d => d.id === o.driver_id);
  const wa = drv?.phone ? `https://wa.me/${digits(drv.phone).replace(/^8/, '7')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  openDialog('Текст для водителя', `<div class="share-text">${esc(text)}</div>
    <div class="muted" style="font-size:13px">Если у водителя указан Telegram в Настройках, бот уже отправил ему этот заказ автоматически.</div>`, [
    { text: 'Копировать', onClick: async () => { await navigator.clipboard.writeText(text); toast('Скопировано'); } },
    { text: 'Telegram', onClick: () => window.open('https://t.me/share/url?url=%20&text=' + encodeURIComponent(text)) },
    { text: 'WhatsApp', primary: true, onClick: () => window.open(wa) },
  ]);
}

/* ================= Отчёты ================= */
function periodRange(p) {
  const t = new Date(), today = isoDate(t);
  if (p === 'today') return [today, today];
  if (p === 'yesterday') return [addDays(today, -1), addDays(today, -1)];
  if (p === 'week') { const wd = (t.getDay() + 6) % 7; return [addDays(today, -wd), today]; }
  if (p === 'month') return [isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), today];
  if (p === 'prevmonth') return [isoDate(new Date(t.getFullYear(), t.getMonth() - 1, 1)), isoDate(new Date(t.getFullYear(), t.getMonth(), 0))];
  return [S.report.from, S.report.to];
}

function initReport() {
  $$('#periodTabs button').forEach(b => b.onclick = () => { S.report.period = b.dataset.period; loadReport(); });
  $('#repFrom').onchange = $('#repTo').onchange = () => {
    S.report.period = 'custom'; S.report.from = $('#repFrom').value; S.report.to = $('#repTo').value; loadReport();
  };
  $('#exportBtn').onclick = () => {
    const [f, t] = periodRange(S.report.period);
    if (window.DEMO) return DEMO.exportCsv(f, t);
    location.href = `/api/export?date_from=${f}&date_to=${t}`;
  };
}

async function loadReport() {
  const [f, t] = periodRange(S.report.period);
  S.report.from = f; S.report.to = t;
  $('#repFrom').value = f; $('#repTo').value = t;
  $$('#periodTabs button').forEach(b => b.classList.toggle('active', b.dataset.period === S.report.period));
  const r = await api(`/api/report?date_from=${f}&date_to=${t}`);
  const T = r.totals;

  const groupTable = (rows, nameTitle) => rows.length ? `<table class="tbl"><tr><th>${nameTitle}</th><th class="r">Заказов</th><th class="r">Взяли</th><th class="r">Долг</th></tr>
    ${rows.map(g => `<tr><td>${esc(g.name)}<div class="bar" style="width:${T.paid ? Math.max(2, g.paid / T.paid * 100) : 0}%"></div></td>
      <td class="r">${g.orders}</td><td class="r"><b>${money(g.paid)}</b></td><td class="r">${g.debt > 0 ? money(g.debt) : '—'}</td></tr>`).join('')}</table>`
    : '<div class="muted">Нет данных</div>';

  const maxDay = Math.max(1, ...r.by_day.map(d => d.paid));
  const days = r.by_day.length > 1 ? `<div class="panel wide"><h4>По дням, взяли</h4><div class="bars">
    ${r.by_day.map(d => `<div class="col" title="${dateRu(d.date, false)}: ${money(d.paid)}, заказов ${d.orders}"><i style="height:${d.paid / maxDay * 100}%"></i><small>${d.date.slice(8)}</small></div>`).join('')}
    </div></div>` : '';

  $('#reportBody').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Заказов</span><b>${T.orders}</b>${T.cancelled ? `<small>отменено ${T.cancelled}</small>` : ''}</div>
      <div class="kpi"><span>Расчёт</span><b>${money(T.plan)}</b></div>
      <div class="kpi ok"><span>Взяли</span><b>${money(T.paid)}</b>${T.orders ? `<small>средний чек ${money(T.paid / T.orders)}</small>` : ''}</div>
      <div class="kpi ${T.debt > 0 ? 'bad' : ''}"><span>Не добрали</span><b>${money(T.debt)}</b></div>
    </div>
    <div class="panels">
      <div class="panel"><h4>По машинам</h4>${groupTable(r.by_vehicle, 'Машина')}</div>
      <div class="panel"><h4>По водителям</h4>${groupTable(r.by_driver, 'Водитель')}</div>
      ${days}
      <div class="panel"><h4>По услугам</h4>${r.by_service.length ? `<table class="tbl"><tr><th>Услуга</th><th class="r">Кол-во</th><th class="r">Сумма</th></tr>
        ${r.by_service.map(s => `<tr><td>${esc(s.name)}</td><td class="r">${+s.qty.toFixed(2)}</td><td class="r">${money(s.amount)}</td></tr>`).join('')}</table>` : '<div class="muted">Нет данных</div>'}</div>
      <div class="panel"><h4>По способу оплаты</h4>${groupTable(r.by_payment, 'Оплата')}</div>
      ${hiredPanel(r)}
      ${expensesPanel(r)}
      <div class="panel wide" id="lostPanel"></div>
      <div class="panel wide"><h4>Выполнены, но оплачены не полностью</h4>${r.debts.length ? `<table class="tbl"><tr><th>Дата</th><th>Клиент</th><th>Машина</th><th class="r">Долг</th></tr>
        ${r.debts.map(o => `<tr class="click" data-id="${o.id}"><td>${dateRu(o.date, false)}</td><td>${esc(o.client_name || 'Без имени')} ${esc(o.client_phone || '')}</td><td>${esc(o.vehicle_name)}</td><td class="r"><b>${money(o.plan_amount - o.paid_amount)}</b></td></tr>`).join('')}</table>` : '<div class="muted">Долгов нет</div>'}</div>
    </div>`;
  $$('#reportBody tr.click').forEach(tr => tr.onclick = () => openOrder(+tr.dataset.id));
  S.report.data = r;
  renderLostReport();
  $('#repAddExp').onclick = () => openExpense(null, null, loadReport);
  $$('#reportBody [data-exp]').forEach(row => row.onclick = () => openExpense((r.expenses || []).find(e => e.id === +row.dataset.exp), null, loadReport));
}

function hiredPanel(r) {
  const hired = S.vehicles.filter(v => v.ownership === 'hired');
  if (!hired.length) return '';
  const rows = hired.map(v => {
    const g = r.by_vehicle.find(x => x.id === v.id) || { orders: 0, paid: 0 };
    const owner = Math.round(g.paid * (+v.owner_share || 0)) / 100;
    return { v, g, owner, ours: g.paid - owner };
  });
  const tot = rows.reduce((a, x) => ({ paid: a.paid + x.g.paid, owner: a.owner + x.owner, ours: a.ours + x.ours }), { paid: 0, owner: 0, ours: 0 });
  return `<div class="panel wide"><h4>Наёмные машины: расчёт с владельцами</h4>
    <table class="tbl"><tr><th>Машина</th><th>Владелец</th><th class="r">Заказов</th><th class="r">Взяли</th><th class="r">%</th><th class="r">Владельцу</th><th class="r">Нам</th></tr>
    ${rows.map(x => `<tr><td>${esc(x.v.name)}</td><td>${esc(x.v.owner_name || '—')}</td><td class="r">${x.g.orders}</td><td class="r">${money(x.g.paid)}</td>
      <td class="r">${+x.v.owner_share || 0}%</td><td class="r"><b>${money(x.owner)}</b></td><td class="r">${money(x.ours)}</td></tr>`).join('')}
    ${rows.length > 1 ? `<tr><td><b>Итого</b></td><td></td><td></td><td class="r"><b>${money(tot.paid)}</b></td><td></td><td class="r"><b>${money(tot.owner)}</b></td><td class="r"><b>${money(tot.ours)}</b></td></tr>` : ''}
    </table><div class="muted" style="font-size:12px;margin-top:6px">Считается от суммы «Взяли» по неотменённым заказам за период.</div></div>`;
}

function renderLostReport() {
  const box = $('#lostPanel');
  if (!box) return;
  const all = S.report.data.lost || [];
  const fv = S.report.lostVeh || '', fs = S.report.lostSrv || '';
  const items = all.filter(l => (!fv || String(l.type_id) === fv) && (!fs || l.lines.some(x => x.title === fs)));
  const sum = items.reduce((s, l) => s + l.amount, 0);
  const given = items.filter(l => l.partner), income = given.reduce((s, l) => s + (l.partner_income || 0), 0);
  const grp = (keyFn) => {
    const m = new Map();
    items.forEach(l => keyFn(l).forEach(([k, amount]) => {
      const g = m.get(k) || { name: k, count: 0, amount: 0 };
      g.count++; g.amount += amount; m.set(k, g);
    }));
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  };
  const byVeh = grp(l => [[l.type_name || l.vehicle_name || 'Не указан', l.amount]]);
  const bySrv = grp(l => l.lines.length ? l.lines.map(x => [x.title, x.qty * x.price]) : [['Без услуги', l.amount]]);
  const byRsn = grp(l => [[l.reason_title || 'Не указана', l.amount]]);
  const tbl = (rows, title) => rows.length ? `<table class="tbl"><tr><th>${title}</th><th class="r">Отказов</th><th class="r">Упущено</th></tr>
    ${rows.map(g => `<tr><td>${esc(g.name)}<div class="bar" style="background:var(--warn);width:${sum ? Math.max(2, g.amount / sum * 100) : 0}%"></div></td><td class="r">${g.count}</td><td class="r"><b>${money(g.amount)}</b></td></tr>`).join('')}</table>`
    : '<div class="muted">Нет данных</div>';
  const vehOpts = [...new Map(all.filter(l => l.type_id).map(l => [l.type_id, l.type_name])).entries()];
  const srvOpts = [...new Set(all.flatMap(l => l.lines.map(x => x.title)))];
  const sel = 'style="height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface);padding:0 8px;max-width:100%"';
  box.innerHTML = `<div class="page-head" style="margin-bottom:8px;flex-wrap:wrap"><h4 style="margin:0">Упущенная прибыль (отказы)</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <select id="lfVeh" ${sel}><option value="">Вся техника</option>${vehOpts.map(([id, n]) => `<option value="${id}" ${String(id) === fv ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <select id="lfSrv" ${sel}><option value="">Все услуги</option>${srvOpts.map(t => `<option ${t === fs ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </div></div>
    <div class="kpis" style="margin-bottom:12px">
      <div class="kpi"><span>Отказов</span><b>${items.length}</b></div>
      <div class="kpi bad"><span>Упущено</span><b>${money(sum)}</b></div>
      <div class="kpi"><span>Передано партнёрам</span><b>${given.length}</b><small>на ${money(given.reduce((s, l) => s + l.amount, 0))}</small></div>
      <div class="kpi ok"><span>Получили с передачи</span><b>${money(income)}</b></div>
    </div>
    ${items.length ? `<div class="panels">
      <div><h4>По виду техники</h4>${tbl(byVeh, 'Вид')}</div>
      <div><h4>По услугам</h4>${tbl(bySrv, 'Услуга')}</div>
      <div><h4>По причинам</h4>${tbl(byRsn, 'Причина')}</div>
      <div><h4>Список</h4><table class="tbl"><tr><th>Дата</th><th>Техника</th><th>Причина</th><th class="r">Сумма</th></tr>
        ${items.slice().reverse().map(l => `<tr class="click" data-lostid="${l.id}"><td>${dateRu(l.date, false)}</td><td>${esc(l.type_name || l.vehicle_name || '—')}</td><td>${esc(l.reason_title || '—')}${l.partner ? ' <span class="badge b-paid">партнёру</span>' : ''}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}</table></div>
    </div>` : '<div class="muted">Отказов за период нет. Отказ записывается кнопкой «Отказ» на главном экране.</div>'}`;
  $('#lfVeh').onchange = e => { S.report.lostVeh = e.target.value; renderLostReport(); };
  $('#lfSrv').onchange = e => { S.report.lostSrv = e.target.value; renderLostReport(); };
  $$('#lostPanel tr[data-lostid]').forEach(tr => tr.onclick = () => openLost(all.find(l => l.id === +tr.dataset.lostid), null, loadReport));
}

/* ================= Отказ (упущенная прибыль) ================= */
function openLost(item, preset = null, after = loadDay) {
  const nowT = new Date();
  const L = item ? { ...item, lines: item.lines.map(x => ({ ...x })) } : {
    id: null, date: S.date, time: `${String(nowT.getHours()).padStart(2, '0')}:${String(nowT.getMinutes()).padStart(2, '0')}`,
    type_id: S.veh !== 'all' ? vehicleById(S.veh)?.type_id : activeTypes()[0]?.id, reason_id: null, lines: [], amount: 0,
    client_phone: '', note: '', partner: 0, partner_name: '', partner_income: 0, ...(preset || {}),
  };
  const reasons = S.reasons.filter(r => r.active || r.id === L.reason_id);
  openDialog(item ? 'Отказ' : 'Отказ: не смогли взять заказ', `
    <div class="muted" style="font-size:13px">Звонил клиент, а взять заказ не смогли. Сумма попадёт в отчёт «Упущенная прибыль».</div>
    <div class="block-title">Что нужно было клиенту</div>
    <div class="seg seg-full" id="lsVeh">${activeTypes().map(t => `<button data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>
    <div class="row-2" style="grid-template-columns:1fr 1fr"><label class="field"><span>На какой день просили</span><input type="date" id="lsDate" value="${L.date}"></label>
      <label class="field"><span>Время звонка</span><input type="time" id="lsTime" value="${esc(L.time)}"></label></div>
    <div class="block-title">Причина</div>
    <div class="chips" id="lsReason">${reasons.map(r => `<button type="button" data-id="${r.id}">${esc(r.title)}</button>`).join('')}</div>
    <div class="block-title">Какая услуга требовалась</div>
    <div class="chips chips-services" id="lsChips"></div>
    <div class="lines" id="lsLines"></div>
    <label class="field"><span>Упущенная сумма, ₽</span><input type="number" id="lsAmount" inputmode="decimal" min="0"></label>
    <label class="field"><span>Телефон клиента (необязательно)</span><input type="tel" id="lsPhone" value="${esc(formatPhone(L.client_phone) || L.client_phone)}"></label>
    <label class="field"><span>Комментарий</span><textarea id="lsNote" rows="2">${esc(L.note)}</textarea></label>
    <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="lsPartner" ${L.partner ? 'checked' : ''} style="width:20px;height:20px"> Передали заказ партнёру</label>
    <div class="row-2 ${L.partner ? '' : 'hidden'}" id="lsPartnerBox" style="grid-template-columns:1fr 1fr">
      <label class="field"><span>Кому</span><input type="text" id="lsPartnerName" value="${esc(L.partner_name)}" placeholder="Имя партнёра"></label>
      <label class="field"><span>Получили с этого, ₽</span><input type="number" id="lsIncome" inputmode="decimal" min="0" value="${L.partner_income || ''}"></label>
    </div>`, [
    ...(item ? [{ text: 'Удалить', danger: true, onClick: async () => {
      if (!confirm('Удалить этот отказ?')) return;
      await api('/api/lost/' + item.id, { method: 'DELETE' }); closeDialog(); toast('Отказ удалён'); await after();
    } }] : []),
    { text: 'Сохранить', primary: true, onClick: async () => {
      if (!L.type_id) throw new Error('Выберите вид техники');
      if (!L.reason_id) throw new Error('Выберите причину');
      if (!L.lines.length && !(+$('#lsAmount').value)) throw new Error('Выберите услугу или укажите сумму');
      await api(item ? '/api/lost/' + item.id : '/api/lost', { method: item ? 'PUT' : 'POST', body: {
        date: $('#lsDate').value || S.date, time: $('#lsTime').value, type_id: L.type_id, reason_id: L.reason_id,
        lines: L.lines, amount: +$('#lsAmount').value || 0, client_phone: $('#lsPhone').value.trim(), note: $('#lsNote').value.trim(),
        partner: $('#lsPartner').checked, partner_name: $('#lsPartnerName').value.trim(), partner_income: +$('#lsIncome').value || 0 } });
      closeDialog(); toast('Отказ записан'); await after();
    } }]);

  const renderVeh = () => $$('#lsVeh button').forEach(b => b.classList.toggle('active', +b.dataset.id === L.type_id));
  const renderReason = () => $$('#lsReason button').forEach(b => b.classList.toggle('active', +b.dataset.id === L.reason_id));
  const recalc = () => {
    const amt = $('#lsAmount');
    if (L.lines.length) { amt.value = L.lines.reduce((s, x) => s + (+x.qty || 0) * (+x.price || 0), 0); amt.readOnly = true; }
    else amt.readOnly = false;
  };
  const renderLines = () => {
    $('#lsLines').innerHTML = L.lines.map((x, i) => `<div class="line" data-i="${i}"><div class="title">${esc(x.title)}</div>
      <div class="qty"><button type="button" data-q="-1">−</button><input type="number" inputmode="decimal" data-f="qty" value="${x.qty}"><button type="button" data-q="1">+</button></div>
      <input class="price" type="number" inputmode="decimal" data-f="price" value="${x.price}" aria-label="Цена">
      <button type="button" class="rm" aria-label="Убрать">${icon('x')}</button></div>`).join('');
    $$('#lsLines .line').forEach(row => {
      const x = L.lines[+row.dataset.i];
      $$('input', row).forEach(inp => inp.oninput = () => { x[inp.dataset.f] = parseFloat(inp.value) || 0; recalc(); });
      $$('[data-q]', row).forEach(b => b.onclick = () => { x.qty = Math.max(1, (+x.qty || 0) + +b.dataset.q); $('[data-f=qty]', row).value = x.qty; recalc(); });
      $('.rm', row).onclick = () => { L.lines.splice(+row.dataset.i, 1); renderLines(); renderChips(); };
    });
    recalc();
  };
  const renderChips = () => {
    $('#lsChips').innerHTML = servicesForType(L.type_id).map(sv => `<button type="button" data-id="${sv.id}" class="${L.lines.some(x => x.service_id === sv.id) ? 'active' : ''}">${esc(sv.title)}<small>${money(sv.price)}</small></button>`).join('');
    $$('#lsChips button').forEach(b => b.onclick = () => {
      const sv = S.services.find(x => x.id === +b.dataset.id);
      const ex = L.lines.find(x => x.service_id === sv.id);
      if (ex) ex.qty += 1; else L.lines.push({ service_id: sv.id, title: sv.title, qty: 1, price: sv.price });
      renderLines(); renderChips();
    });
  };
  $$('#lsVeh button').forEach(b => b.onclick = () => { L.type_id = +b.dataset.id; renderVeh(); renderChips(); });
  $$('#lsReason button').forEach(b => b.onclick = () => { L.reason_id = +b.dataset.id; renderReason(); });
  $('#lsPartner').onchange = e => $('#lsPartnerBox').classList.toggle('hidden', !e.target.checked);
  $('#lsPhone').oninput = e => { e.target.value = digits(e.target.value) ? formatPhone(e.target.value) : ''; };
  $('#lsAmount').value = L.amount || '';
  renderVeh(); renderReason(); renderChips(); renderLines();
}


/* ================= Клиенты ================= */
let clientTimer;
function initClients() {
  $('#clientSearch').oninput = () => { clearTimeout(clientTimer); clientTimer = setTimeout(loadClients, 200); };
  $('#newClientBtn').onclick = () => editClient(null);
}

async function loadClients() {
  const q = $('#clientSearch').value.trim();
  const list = await api('/api/clients?limit=100&q=' + encodeURIComponent(q));
  $('#clientList').innerHTML = list.length ? list.map(c => `<div class="ccard" data-id="${c.id}">
    <div class="avatar">${esc((c.name || '?').trim()[0]?.toUpperCase() || '?')}</div>
    <div class="main"><b>${esc(c.name || 'Без имени')}</b><small>${esc(c.phone)}${c.kind === 'org' ? ' · организация' : ''}</small></div>
    <div class="side"><b>${money(c.paid_total)}</b>${c.orders_count} зак.</div></div>`).join('')
    : `<div class="empty"><b>Клиентов не найдено</b>Клиенты добавляются сами при записи заказа.</div>`;
  $$('#clientList .ccard').forEach(c => c.onclick = () => editClient(+c.dataset.id));
}

async function editClient(id) {
  const c = id ? await api('/api/clients/' + id) : { kind: 'person', name: '', phone: '', inn: '', note: '', orders: [] };
  let kind = c.kind;
  const hist = c.orders.length ? `<div class="block-title">История (${c.orders.length})</div><table class="tbl">
    ${c.orders.map(o => `<tr class="click" data-id="${o.id}"><td>${dateRu(o.date, false)}</td><td>${esc(o.vehicle_name)}</td><td class="r">${money(o.paid_amount)}</td><td class="r"><span class="badge b-${o.status}">${STATUS[o.status]}</span></td></tr>`).join('')}</table>` : '';
  openDialog(id ? 'Клиент' : 'Новый клиент', `
    <div class="seg seg-full" id="clKind"><button data-k="person">Физлицо</button><button data-k="org">Организация</button></div>
    <label class="field"><span>Телефон</span><input type="tel" id="clPhone" value="${esc(c.phone)}"></label>
    <label class="field"><span id="clNameLbl">Имя</span><input type="text" id="clName" value="${esc(c.name)}"></label>
    <label class="field" id="clInnWrap"><span>ИНН</span><input type="text" id="clInn" inputmode="numeric" value="${esc(c.inn)}"></label>
    <label class="field"><span>Заметка</span><textarea id="clNote" rows="2">${esc(c.note)}</textarea></label>
    ${hist}`, [
    ...(id ? [{ text: 'Новый заказ', onClick: () => { closeDialog(); openOrder(null, { client: { id: c.id, kind: c.kind, name: c.name, phone: c.phone, inn: c.inn } }); } }] : []),
    { text: 'Сохранить', primary: true, onClick: async () => {
      await api(id ? '/api/clients/' + id : '/api/clients', { method: id ? 'PUT' : 'POST',
        body: { kind, name: $('#clName').value.trim(), phone: $('#clPhone').value.trim(), inn: $('#clInn').value.trim(), note: $('#clNote').value.trim() } });
      closeDialog(); toast('Клиент сохранён'); loadClients();
    } }]);
  const setKind = k => {
    kind = k;
    $$('#clKind button').forEach(b => b.classList.toggle('active', b.dataset.k === k));
    $('#clNameLbl').textContent = k === 'org' ? 'Организация' : 'Имя';
    $('#clInnWrap').classList.toggle('hidden', k !== 'org');
  };
  $$('#clKind button').forEach(b => b.onclick = () => setKind(b.dataset.k));
  setKind(kind);
  $('#clPhone').oninput = e => { e.target.value = digits(e.target.value) ? formatPhone(e.target.value) : ''; };
  $$('#dialogBody tr.click').forEach(tr => tr.onclick = () => { closeDialog(); openOrder(+tr.dataset.id); });
}

/* ================= Настройки ================= */
async function reloadRefs() {
  const b = await api('/api/bootstrap');
  Object.assign(S, { vehicles: b.vehicles, drivers: b.drivers, services: b.services, reasons: b.reasons || [], types: b.types || [], expCats: b.expense_categories || [], settings: b.settings });
}

function renderSettings() {
  const admin = S.me.is_admin;
  const vehName = typeName;
  $('#settingsBody').innerHTML = `
    <div class="page-head"><h2>Настройки</h2><button class="btn btn-ghost" id="logoutBtn">Выйти (${esc(S.me.name)})</button></div>
    <button class="btn btn-ghost btn-block phone-only" id="goClients" style="margin-bottom:12px">${icon('users')}<span>Клиенты</span></button>

    <div class="settings-section"><h4>Машины</h4><p>Колонки на шкале. Водитель по умолчанию подставляется в новый заказ.</p>
      ${S.vehicles.map(v => `<div class="srow ${v.active ? '' : 'off'}" data-veh="${v.id}"><i class="dot" style="background:${esc(v.color)}"></i>
        <div class="main"><b>${esc(v.name)}</b><small>${[typeName(v.type_id), v.plate, S.drivers.find(d => d.id === v.default_driver_id)?.name,
          v.ownership === 'hired' ? `наёмная${v.owner_name ? ', ' + v.owner_name : ''}, владельцу ${+v.owner_share || 0}%` : ''].filter(Boolean).map(esc).join(' · ')}</small></div>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addVeh">+ Машина</button></div>

    <div class="settings-section"><h4>Водители</h4><p>Чтобы водитель получал заказы в Telegram, укажите его чат (раздел Telegram ниже).</p>
      ${S.drivers.map(d => `<div class="srow ${d.active ? '' : 'off'}" data-drv="${d.id}">
        <div class="main"><b>${esc(d.name)}</b><small>${esc(d.phone)}${d.tg_chat_id ? ' · Telegram подключён' : ''}</small></div>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addDrv">+ Водитель</button></div>

    <div class="settings-section"><h4>Виды техники</h4><p>Клиенту нужен вид техники, а не конкретная машина. По виду считаются отказы и подбирается прайс.</p>
      ${S.types.map(t => `<div class="srow ${t.active ? '' : 'off'}" data-type="${t.id}"><div class="main"><b>${esc(t.name)}</b>
        <small>${S.vehicles.filter(v => v.type_id === t.id && v.active).map(v => v.name).join(', ') || 'нет машин'}</small></div>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addType">+ Вид техники</button></div>

    <div class="settings-section"><h4>Статьи расходов</h4><p>Для учёта расходов в разделе «Автопарк».</p>
      ${S.expCats.map(c => `<div class="srow ${c.active ? '' : 'off'}" data-ecat="${c.id}"><div class="main"><b>${esc(c.title)}</b></div>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addEcat">+ Статья</button></div>

    <div class="settings-section"><h4>Причины отказа</h4><p>Список для кнопки «Отказ». По причинам строится отчёт по упущенной прибыли.</p>
      ${S.reasons.map(r => `<div class="srow ${r.active ? '' : 'off'}" data-rsn="${r.id}"><div class="main"><b>${esc(r.title)}</b></div>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addRsn">+ Причина</button></div>

    <div class="settings-section"><h4>Прайс услуг</h4><p>Кнопки услуг в заказе. Цену в заказе можно поменять.</p>
      ${S.services.map(s => `<div class="srow ${s.active ? '' : 'off'}" data-srv="${s.id}">
        <div class="main"><b>${esc(s.title)}</b><small>${esc(vehName(s.type_id))}</small></div><b>${money(s.price)}${s.unit !== 'шт' ? '/' + esc(s.unit) : ''}</b>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addSrv">+ Услуга</button></div>

    ${admin ? `
    <div class="settings-section"><h4>Telegram-уведомления</h4>
      <p>Бот присылает водителю и диспетчеру новый заказ, перенос и отмену.</p>
      <ol class="steps">
        <li>В Telegram откройте @BotFather, команда /newbot, получите токен.</li>
        <li>Вставьте токен сюда и сохраните.</li>
        <li>Каждый водитель и диспетчер пишет своему боту /start.</li>
        <li>Нажмите «Найти чаты» и назначьте каждый чат водителю или как чат диспетчера.</li>
      </ol>
      <label class="field"><span>Токен бота ${S.settings.tg_token_set ? '(сохранён)' : ''}</span>
        <input type="password" id="tgToken" placeholder="${S.settings.tg_token_set ? 'Сохранён. Введите новый, чтобы заменить' : '123456:ABC...'}" autocomplete="off"></label>
      <label class="field" style="margin-top:8px"><span>Чат диспетчера (получает все заказы)</span><input type="text" id="tgDispatch" value="${esc(S.settings.tg_dispatch_chat || '')}"></label>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="tgSave">Сохранить</button>
        <button class="btn btn-ghost" id="tgFind">Найти чаты</button>
      </div>
      <div id="tgChats"></div>
    </div>

    <div class="settings-section"><h4>Пользователи</h4><p>Кто входит в программу, у каждого свой пин-код из 4 цифр.</p>
      <div id="usersList"></div><button class="link-btn" id="addUser">+ Пользователь</button></div>

    <div class="settings-section"><h4>Общее</h4>
      <div class="row-3">
        <label class="field" style="grid-column:auto"><span>Название</span><input type="text" id="stName" value="${esc(S.settings.company_name)}"></label>
        <label class="field"><span>Шкала с, ч</span><input type="number" id="stStart" min="0" max="23" value="${esc(S.settings.day_start)}"></label>
        <label class="field"><span>до, ч</span><input type="number" id="stEnd" min="1" max="24" value="${esc(S.settings.day_end)}"></label>
      </div>
      <button class="btn btn-primary" id="stSave" style="margin-top:10px">Сохранить</button></div>` : ''}

    ${window.DEMO ? `<div class="settings-section"><h4>Демо-версия</h4>
      <p>Программа работает прямо в браузере, записи хранятся только на этом устройстве. В рабочей версии на сервере данные общие для всех телефонов и работает Telegram.</p>
      <button class="btn btn-ghost" id="demoReset">Сбросить демо-данные</button></div>` : ''}

    <div class="settings-section"><h4>Как приложение на телефоне</h4>
      <p>iPhone: Safari, кнопка «Поделиться», «На экран Домой». Android: Chrome, меню, «Добавить на главный экран».</p></div>`;

  if (window.DEMO) $('#demoReset').onclick = () => confirm('Вернуть демо-данные к исходным?') && DEMO.reset();
  $('#logoutBtn').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.reload(); };
  $$('[data-veh]', $('#settingsBody')).forEach(r => r.onclick = () => editVehicle(+r.dataset.veh));
  $$('[data-drv]').forEach(r => r.onclick = () => editDriver(+r.dataset.drv));
  $$('[data-srv]').forEach(r => r.onclick = () => editService(+r.dataset.srv));
  $('#addVeh').onclick = () => editVehicle(null);
  $('#addDrv').onclick = () => editDriver(null);
  $('#addSrv').onclick = () => editService(null);
  $$('[data-rsn]').forEach(r => r.onclick = () => editReason(+r.dataset.rsn));
  $('#addRsn').onclick = () => editReason(null);
  $$('[data-type]').forEach(r => r.onclick = () => editType(+r.dataset.type));
  $('#addType').onclick = () => editType(null);
  $$('[data-ecat]').forEach(r => r.onclick = () => editExpCat(+r.dataset.ecat));
  $('#addEcat').onclick = () => editExpCat(null);
  $('#goClients').onclick = () => setView('clients');
  if (admin) {
    $('#tgSave').onclick = async () => {
      const body = { tg_dispatch_chat: $('#tgDispatch').value.trim() };
      if ($('#tgToken').value.trim()) body.tg_token = $('#tgToken').value.trim();
      await api('/api/settings', { method: 'PUT', body });
      await reloadRefs(); toast('Сохранено'); renderSettings();
    };
    $('#tgFind').onclick = findChats;
    $('#stSave').onclick = async () => {
      await api('/api/settings', { method: 'PUT', body: { company_name: $('#stName').value.trim(), day_start: +$('#stStart').value, day_end: +$('#stEnd').value } });
      await reloadRefs(); toast('Сохранено'); start();
    };
    $('#addUser').onclick = () => editUser(null);
    loadUsers();
  }
}

async function findChats() {
  const box = $('#tgChats');
  box.innerHTML = '<div class="muted" style="margin-top:10px">Ищу…</div>';
  try {
    const chats = await api('/api/telegram/chats');
    if (!chats.length) { box.innerHTML = '<div class="muted" style="margin-top:10px">Никто ещё не писал боту. Пусть водитель напишет боту /start и нажмите снова.</div>'; return; }
    box.innerHTML = chats.map(c => `<div class="srow" style="cursor:default"><div class="main"><b>${esc(c.title)}</b><small>chat_id ${esc(c.chat_id)}</small></div>
      <select data-chat="${esc(c.chat_id)}" style="height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface)">
        <option value="">Назначить…</option><option value="dispatch">Диспетчер</option>
        ${S.drivers.map(d => `<option value="${d.id}">Водитель: ${esc(d.name)}</option>`).join('')}</select>
      <button class="chip" data-test="${esc(c.chat_id)}">Тест</button></div>`).join('');
    $$('select[data-chat]', box).forEach(sel => sel.onchange = async () => {
      const chat = sel.dataset.chat;
      if (sel.value === 'dispatch') await api('/api/settings', { method: 'PUT', body: { tg_dispatch_chat: chat } });
      else if (sel.value) {
        const d = S.drivers.find(x => x.id === +sel.value);
        await api('/api/drivers/' + d.id, { method: 'PUT', body: { name: d.name, phone: d.phone, tg_chat_id: chat, active: d.active } });
      }
      await reloadRefs(); toast('Назначено'); renderSettings();
    });
    $$('[data-test]', box).forEach(b => b.onclick = async () => {
      try { await api('/api/telegram/test?chat_id=' + encodeURIComponent(b.dataset.test), { method: 'POST' }); toast('Отправлено'); }
      catch (e) { toast(e.message, true); }
    });
  } catch (e) { box.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

function formFields(fields) {
  return fields.map(f => {
    if (f.type === 'select') return `<label class="field"><span>${f.label}</span><select id="ff_${f.key}">${f.options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(f.value ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    if (f.type === 'check') return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ff_${f.key}" ${f.value ? 'checked' : ''} style="width:20px;height:20px"> ${f.label}</label>`;
    return `<label class="field"><span>${f.label}</span><input type="${f.type || 'text'}" id="ff_${f.key}" value="${esc(f.value ?? '')}" ${f.attrs || ''}></label>`;
  }).join('');
}
function ff(key) { const el = $('#ff_' + key); return el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value; }

function editEntity(title, fields, url, id, build) {
  openDialog(title, formFields(fields), [{ text: 'Сохранить', primary: true, onClick: async () => {
    await api(id ? `${url}/${id}` : url, { method: id ? 'PUT' : 'POST', body: build() });
    closeDialog(); await reloadRefs(); toast('Сохранено'); renderSettings();
  } }]);
}

function editType(id) {
  const t = id ? S.types.find(x => x.id === id) : { name: '', sort: S.types.length + 1, active: 1 };
  editEntity(id ? 'Вид техники' : 'Новый вид техники', [
    { key: 'name', label: 'Название', value: t.name, attrs: 'placeholder="Например: Манипулятор"' },
    { key: 'sort', label: 'Порядок', type: 'number', value: t.sort },
    { key: 'active', label: 'Используется', type: 'check', value: t.active },
  ], '/api/types', id, () => ({ name: ff('name').trim(), sort: +ff('sort') || 0, active: ff('active') }));
}

function editExpCat(id) {
  const c = id ? S.expCats.find(x => x.id === id) : { title: '', sort: S.expCats.length + 1, active: 1 };
  editEntity(id ? 'Статья расходов' : 'Новая статья', [
    { key: 'title', label: 'Статья', value: c.title },
    { key: 'sort', label: 'Порядок', type: 'number', value: c.sort },
    { key: 'active', label: 'Показывать', type: 'check', value: c.active },
  ], '/api/expense-categories', id, () => ({ title: ff('title').trim(), sort: +ff('sort') || 0, active: ff('active') }));
}

function activeTypes() { return S.types.filter(t => t.active); }

function editReason(id) {
  const r = id ? S.reasons.find(x => x.id === id) : { title: '', sort: S.reasons.length + 1, active: 1 };
  editEntity(id ? 'Причина отказа' : 'Новая причина', [
    { key: 'title', label: 'Причина', value: r.title },
    { key: 'sort', label: 'Порядок', type: 'number', value: r.sort },
    { key: 'active', label: 'Показывать в списке', type: 'check', value: r.active },
  ], '/api/reasons', id, () => ({ title: ff('title').trim(), sort: +ff('sort') || 0, active: ff('active') }));
}

function editVehicle(id) {
  const v = id ? vehicleById(id) : { name: '', plate: '', color: '#16a34a', default_driver_id: null, sort: S.vehicles.length + 1, active: 1, ownership: 'own', owner_name: '', owner_share: 0 };
  editEntity(id ? 'Машина' : 'Новая машина', [
    { key: 'name', label: 'Название', value: v.name },
    { key: 'type', label: 'Вид техники', type: 'select', value: v.type_id ?? '', options: [['', 'Не указан'], ...S.types.map(t => [t.id, t.name])] },
    { key: 'plate', label: 'Госномер', value: v.plate },
    { key: 'color', label: 'Цвет', type: 'color', value: v.color, attrs: 'style="height:44px;padding:4px"' },
    { key: 'driver', label: 'Водитель по умолчанию', type: 'select', value: v.default_driver_id ?? '', options: [['', 'Не указан'], ...S.drivers.map(d => [d.id, d.name])] },
    { key: 'sort', label: 'Порядок колонки', type: 'number', value: v.sort },
    { key: 'active', label: 'Работает (показывать на шкале)', type: 'check', value: v.active },
    { key: 'own', label: 'Чья машина', type: 'select', value: v.ownership || 'own', options: [['own', 'Своя'], ['hired', 'Наёмная (отдаём владельцу часть)']] },
    { key: 'owner', label: 'Владелец наёмной машины', value: v.owner_name || '' },
    { key: 'share', label: 'Отдаём владельцу, % от «Взяли»', type: 'number', value: v.owner_share || 0, attrs: 'min="0" max="100" inputmode="decimal"' },
  ], '/api/vehicles', id, () => ({ name: ff('name'), type_id: ff('type') ? +ff('type') : null, plate: ff('plate'), color: ff('color'), default_driver_id: ff('driver') ? +ff('driver') : null, sort: +ff('sort') || 0, active: ff('active'),
    ownership: ff('own'), owner_name: ff('own') === 'hired' ? ff('owner').trim() : '', owner_share: ff('own') === 'hired' ? Math.min(100, Math.max(0, +ff('share') || 0)) : 0 }));
  const toggle = () => ['owner', 'share'].forEach(k => $('#ff_' + k).closest('.field').classList.toggle('hidden', $('#ff_own').value !== 'hired'));
  $('#ff_own').onchange = toggle;
  toggle();
}

function editDriver(id) {
  const d = id ? S.drivers.find(x => x.id === id) : { name: '', phone: '', tg_chat_id: '', active: 1 };
  editEntity(id ? 'Водитель' : 'Новый водитель', [
    { key: 'name', label: 'Имя', value: d.name },
    { key: 'phone', label: 'Телефон', type: 'tel', value: d.phone },
    { key: 'tg', label: 'Telegram chat_id', value: d.tg_chat_id, attrs: 'placeholder="Проще через «Найти чаты»"' },
    { key: 'active', label: 'Работает', type: 'check', value: d.active },
  ], '/api/drivers', id, () => ({ name: ff('name'), phone: ff('phone'), tg_chat_id: ff('tg').trim(), active: ff('active') }));
}

function editService(id) {
  const s = id ? S.services.find(x => x.id === id) : { title: '', price: 0, unit: 'шт', type_id: null, active: 1 };
  editEntity(id ? 'Услуга' : 'Новая услуга', [
    { key: 'title', label: 'Название', value: s.title },
    { key: 'price', label: 'Цена, ₽', type: 'number', value: s.price, attrs: 'inputmode="decimal"' },
    { key: 'unit', label: 'Единица', type: 'select', value: s.unit, options: [['шт', 'за выезд / штука'], ['ч', 'за час'], ['км', 'за км']] },
    { key: 'veh', label: 'Для вида техники', type: 'select', value: s.type_id ?? '', options: [['', 'Любая техника'], ...S.types.map(t => [t.id, t.name])] },
    { key: 'active', label: 'Показывать в заказе', type: 'check', value: s.active },
  ], '/api/services', id, () => ({ title: ff('title'), price: +ff('price') || 0, unit: ff('unit'), type_id: ff('veh') ? +ff('veh') : null, active: ff('active') }));
}

async function loadUsers() {
  const users = await api('/api/users');
  S.users = users;
  $('#usersList').innerHTML = users.map(u => `<div class="srow ${u.active ? '' : 'off'}" data-user="${u.id}">
    <div class="main"><b>${esc(u.name)}</b><small>${u.is_admin ? 'администратор' : 'диспетчер'}</small></div>${icon('right')}</div>`).join('');
  $$('[data-user]').forEach(r => r.onclick = () => editUser(+r.dataset.user));
}

function editUser(id) {
  const u = id ? S.users.find(x => x.id === id) : { name: '', is_admin: 0, active: 1 };
  openDialog(id ? 'Пользователь' : 'Новый пользователь', formFields([
    { key: 'name', label: 'Имя', value: u.name },
    { key: 'pin', label: id ? 'Новый пин-код (пусто — не менять)' : 'Пин-код, 4 цифры', type: 'password', attrs: 'inputmode="numeric" maxlength="4" autocomplete="new-password"' },
    { key: 'admin', label: 'Администратор (настройки, Telegram, пользователи)', type: 'check', value: u.is_admin },
    { key: 'active', label: 'Может входить', type: 'check', value: u.active },
  ]), [{ text: 'Сохранить', primary: true, onClick: async () => {
    await api(id ? '/api/users/' + id : '/api/users', { method: id ? 'PUT' : 'POST',
      body: { name: ff('name').trim(), pin: ff('pin') || null, is_admin: !!ff('admin'), active: !!ff('active') } });
    closeDialog(); toast('Сохранено'); loadUsers();
  } }]);
}

/* ================= Автопарк ================= */
function typeName(id) { return id ? (S.types.find(t => t.id === id)?.name || '—') : 'Любая техника'; }
function daysTo(dateStr) {
  if (!dateStr) return null;
  return Math.round((parseDate(dateStr) - parseDate(isoDate(new Date()))) / 86400000);
}

// Напоминания по машине: ОСАГО, техосмотр, ТО по пробегу
function vehicleAlerts(v) {
  const out = [];
  const dateCheck = (d, what) => {
    const n = daysTo(d);
    if (n === null) return;
    if (n < 0) out.push({ level: 'bad', text: `${what} просрочен${what === 'ОСАГО' ? 'о' : ''} с ${dateRu(d, false)}` });
    else if (n <= 30) out.push({ level: 'warn', text: `${what}: осталось ${n} дн. (до ${dateRu(d, false)})` });
  };
  dateCheck(v.osago_until, 'ОСАГО');
  dateCheck(v.inspection_until, 'Техосмотр');
  if (v.service_every_km > 0 && v.mileage > 0) {
    const left = (v.last_service_km || 0) + v.service_every_km - v.mileage;
    if (left <= 0) out.push({ level: 'bad', text: left === 0 ? 'Пора делать ТО' : `ТО просрочено на ${(-left).toLocaleString('ru-RU')} км` });
    else if (left <= 1000) out.push({ level: 'warn', text: `ТО через ${left.toLocaleString('ru-RU')} км` });
  }
  return out;
}
function fleetAlerts() {
  return activeVehicles().flatMap(v => vehicleAlerts(v).map(a => ({ ...a, vehicle: v })))
    .sort((a, b) => (b.level === 'bad') - (a.level === 'bad'));
}

function renderFleetBanner() {
  const box = $('#fleetBanner');
  if (!box) return;
  const al = fleetAlerts();
  box.classList.toggle('hidden', !al.length);
  if (!al.length) return;
  const bad = al.some(a => a.level === 'bad');
  box.className = 'fleet-banner ' + (bad ? 'bad' : 'warn');
  box.innerHTML = `<b>Автопарк:</b> ${al.slice(0, 2).map(a => `${esc(a.vehicle.name)} — ${esc(a.text)}`).join('; ')}${al.length > 2 ? ` и ещё ${al.length - 2}` : ''}
    <span class="link-btn" style="padding:0;margin-left:6px">Открыть</span>`;
  box.onclick = () => setView('fleet');
}

async function loadFleet() {
  const today = isoDate(new Date());
  const monthStart = today.slice(0, 8) + '01';
  const exp = await api(`/api/expenses?date_from=${monthStart}&date_to=${today}`);
  const sumBy = id => exp.filter(e => e.vehicle_id === id).reduce((s, e) => s + e.amount, 0);
  const list = S.vehicles.slice().sort((a, b) => b.active - a.active || a.sort - b.sort);
  $('#fleetList').innerHTML = list.map(v => {
    const al = vehicleAlerts(v);
    return `<div class="fcard ${v.active ? '' : 'off'}" data-fleet="${v.id}" style="--c:${esc(v.color)}">
      <div class="fcard-head"><i class="dot" style="background:${esc(v.color)}"></i><b>${esc(v.name)}</b>
        <span class="muted">${esc(typeName(v.type_id))}${v.ownership === 'hired' ? ', наёмная' : ''}</span>
        <span class="plate">${esc(v.plate || 'без номера')}</span></div>
      ${v.brand || v.year ? `<div class="muted" style="font-size:13px;margin-top:-4px">${esc([v.brand, v.year ? v.year + ' г.' : ''].filter(Boolean).join(', '))}</div>` : ''}
      <div class="fcard-grid">
        <div><span>Пробег</span><b>${v.mileage ? v.mileage.toLocaleString('ru-RU') + ' км' : '—'}</b></div>
        <div><span>ОСАГО до</span><b>${v.osago_until ? dateRu(v.osago_until, false) : '—'}</b></div>
        <div><span>Техосмотр до</span><b>${v.inspection_until ? dateRu(v.inspection_until, false) : '—'}</b></div>
        <div><span>Расходы за месяц</span><b>${money(sumBy(v.id))}</b></div>
      </div>
      ${al.map(a => `<div class="alert ${a.level}">${esc(a.text)}</div>`).join('')}
    </div>`;
  }).join('') || '<div class="empty"><b>Машин нет</b>Добавьте машину в Настройках.</div>';
  $$('#fleetList [data-fleet]').forEach(c => c.onclick = () => openVehicleCard(+c.dataset.fleet));
}

function setDialogWide(on) { $('#dialog .sheet').classList.toggle('sheet-wide', on); }

async function openVehicleCard(id, tab = 'data') {
  const v = vehicleById(id);
  const [docs, exps] = await Promise.all([api(`/api/vehicles/${id}/docs`), api(`/api/expenses?vehicle_id=${id}`)]);
  const total = exps.reduce((s, e) => s + e.amount, 0);
  const al = vehicleAlerts(v);
  const field = (key, label, type = 'text', attrs = '') =>
    `<label class="field"><span>${label}</span><input type="${type}" id="vc_${key}" value="${esc(v[key] ?? '')}" ${attrs}></label>`;
  setDialogWide(true);
  openDialog(`${v.name}${v.plate ? ', ' + v.plate : ''}`, `
    ${al.map(a => `<div class="alert ${a.level}">${esc(a.text)}</div>`).join('')}
    <div class="seg seg-full" id="vcTabs"><button data-tab="data">Данные</button><button data-tab="docs">Документы (${docs.length})</button><button data-tab="exp">Расходы (${exps.length})</button></div>

    <div data-pane="data" class="vc-pane">
      <div class="grid-2">
        ${field('brand', 'Марка, модель')}
        ${field('year', 'Год выпуска', 'number', 'inputmode="numeric"')}
        ${field('plate', 'Госномер')}
        ${field('vin', 'VIN')}
        ${field('pts', 'ПТС, номер')}
        ${field('sts', 'СТС, номер')}
        ${field('mileage', 'Пробег сейчас, км', 'number', 'inputmode="numeric"')}
        ${field('osago_until', 'ОСАГО действует до', 'date')}
        ${field('inspection_until', 'Техосмотр до', 'date')}
        ${field('service_every_km', 'ТО каждые, км', 'number', 'inputmode="numeric" placeholder="например 10000"')}
        ${field('last_service_km', 'Пробег на последнем ТО, км', 'number', 'inputmode="numeric"')}
      </div>
      <label class="field"><span>Заметки по машине</span><textarea id="vc_fleet_note" rows="2">${esc(v.fleet_note || '')}</textarea></label>
      ${v.mileage_date ? `<div class="muted" style="font-size:12px">Пробег обновлён ${dateRu(v.mileage_date, false)}</div>` : ''}
      <button class="btn btn-primary" id="vcSave">Сохранить данные</button>
    </div>

    <div data-pane="docs" class="vc-pane hidden">
      <div class="muted" style="font-size:13px">ПТС, СТС, ОСАГО, диагностическая карта, договор аренды. Можно сфотографировать телефоном.</div>
      <div class="row-2" style="grid-template-columns:1fr auto">
        <label class="field"><span>Название документа</span><input type="text" id="docTitle" list="docTitles" placeholder="Например: ОСАГО 2026">
          <datalist id="docTitles"><option>ПТС</option><option>СТС</option><option>ОСАГО</option><option>Диагностическая карта</option><option>Договор аренды</option></datalist></label>
        <label class="btn btn-primary" style="align-self:end;height:44px">Добавить файл<input type="file" id="docFile" accept="image/*,application/pdf" hidden></label>
      </div>
      <div class="card-list" id="docList">${docs.map(d => `<div class="ccard" data-doc="${d.id}">
        <div class="avatar">${d.mime?.includes('pdf') ? 'PDF' : 'Фото'}</div>
        <div class="main"><b>${esc(d.title)}</b><small>${esc(d.original_name || '')} · ${Math.max(1, Math.round(d.size / 1024))} КБ · ${dateRu(d.created_at.slice(0, 10), false)}</small></div>
        <button class="chip" data-docdel="${d.id}">Удалить</button></div>`).join('') || '<div class="muted">Документов пока нет.</div>'}</div>
    </div>

    <div data-pane="exp" class="vc-pane hidden">
      <div class="page-head" style="margin:0"><div>Всего расходов: <b>${money(total)}</b></div>
        <button class="btn btn-primary btn-sm" id="vcAddExp">+ Расход</button></div>
      <div class="card-list">${exps.map(e => expenseRow(e)).join('') || '<div class="muted">Расходов пока нет.</div>'}</div>
    </div>`, []);

  const show = t => {
    $$('#vcTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    $$('#dialogBody .vc-pane').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t));
  };
  $$('#vcTabs button').forEach(b => b.onclick = () => show(b.dataset.tab));
  show(tab);

  $('#vcSave').onclick = async () => {
    const val = k => $('#vc_' + k).value.trim();
    const num = k => parseInt(val(k), 10) || 0;
    const body = { ...pickVehicle(v), brand: val('brand'), year: num('year'), plate: val('plate'), vin: val('vin').toUpperCase(),
      pts: val('pts'), sts: val('sts'), mileage: num('mileage'), osago_until: val('osago_until'), inspection_until: val('inspection_until'),
      service_every_km: num('service_every_km'), last_service_km: num('last_service_km'), fleet_note: val('fleet_note') };
    if (body.mileage !== (v.mileage || 0)) body.mileage_date = isoDate(new Date());
    try {
      await api('/api/vehicles/' + id, { method: 'PUT', body });
      await reloadRefs(); toast('Сохранено'); openVehicleCard(id, 'data'); if (S.view === 'fleet') loadFleet();
    } catch (e) { toast(e.message, true); }
  };
  $('#docFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const title = $('#docTitle').value.trim() || file.name.replace(/\.[^.]+$/, '');
    try {
      toast('Загружаю…');
      const prepared = await prepareFile(file);
      await api(`/api/vehicles/${id}/docs`, { method: 'POST', body: { title, original_name: prepared.name, mime: prepared.mime, data_b64: prepared.data } });
      toast('Документ добавлен'); openVehicleCard(id, 'docs');
    } catch (err) { toast(err.message, true); }
  };
  $$('#docList [data-doc]').forEach(c => c.onclick = e => {
    if (e.target.closest('[data-docdel]')) return;
    openDoc(+c.dataset.doc);
  });
  $$('#docList [data-docdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Удалить документ?')) return;
    await api('/api/docs/' + b.dataset.docdel, { method: 'DELETE' });
    toast('Удалён'); openVehicleCard(id, 'docs');
  });
  $('#vcAddExp').onclick = () => openExpense(null, { vehicle_id: id }, () => openVehicleCard(id, 'exp'));
  $$('#dialogBody [data-exp]').forEach(r => r.onclick = () => openExpense(exps.find(e => e.id === +r.dataset.exp), null, () => openVehicleCard(id, 'exp')));
}

// поля машины, которые есть в настройках: чтобы карточка парка их не затёрла
function pickVehicle(v) {
  const keys = ['name', 'plate', 'color', 'default_driver_id', 'sort', 'active', 'ownership', 'owner_name', 'owner_share', 'type_id',
    'brand', 'year', 'vin', 'pts', 'sts', 'mileage', 'mileage_date', 'osago_until', 'inspection_until', 'service_every_km', 'last_service_km', 'fleet_note'];
  return Object.fromEntries(keys.filter(k => v[k] !== undefined).map(k => [k, v[k]]));
}

// Фото ужимаем до 1600 px, чтобы с телефона не грузить по 8 МБ
function prepareFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Файл не прочитался'));
    reader.onload = () => {
      if (!file.type.startsWith('image/')) {
        if (file.size > (window.DEMO ? 3 : 15) * 1024 * 1024) return reject(new Error(window.DEMO ? 'В демо файл до 3 МБ' : 'Файл больше 15 МБ'));
        return resolve({ name: file.name, mime: file.type || 'application/octet-stream', data: reader.result });
      }
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85) });
      };
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function openDoc(docId) {
  if (window.DEMO) return DEMO.openDoc(docId);
  window.open('api/docs/' + docId, '_blank');
}

function expenseRow(e) {
  return `<div class="ccard exp" data-exp="${e.id}">
    <div class="main"><b>${esc(e.title || e.category_title || 'Расход')}</b>
      <small>${dateRu(e.date, false)}${e.category_title ? ' · ' + esc(e.category_title) : ''}${e.mileage ? ' · ' + e.mileage.toLocaleString('ru-RU') + ' км' : ''}${e.created_by_name ? ' · внёс ' + esc(e.created_by_name) : ''}</small>
      ${e.note ? `<div class="exp-note">${esc(e.note)}</div>` : ''}</div>
    <div class="side"><b>${money(e.amount)}</b></div></div>`;
}

function openExpense(item, preset = null, after = null) {
  const E = item ? { ...item } : { vehicle_id: preset?.vehicle_id || activeVehicles()[0]?.id, date: isoDate(new Date()), category_id: null, title: '', amount: '', mileage: '', note: '' };
  const cats = S.expCats.filter(c => c.active || c.id === E.category_id);
  setDialogWide(false);
  openDialog(item ? 'Расход' : 'Новый расход', `
    <div class="seg seg-full seg-wrap" id="exVeh">${S.vehicles.filter(v => v.active || v.id === E.vehicle_id).map(v => `<button data-id="${v.id}"><i class="dot" style="background:${esc(v.color)}"></i>${esc(v.name)}</button>`).join('')}</div>
    <div class="block-title">Статья</div>
    <div class="chips" id="exCat">${cats.map(c => `<button type="button" data-id="${c.id}">${esc(c.title)}</button>`).join('')}</div>
    <label class="field"><span>Что сделали или купили</span><input type="text" id="exTitle" value="${esc(E.title)}" placeholder="Например: замена передних колодок"></label>
    <div class="grid-2">
      <label class="field"><span>Сумма, ₽</span><input type="number" id="exAmount" inputmode="decimal" min="0" value="${E.amount}"></label>
      <label class="field"><span>Дата</span><input type="date" id="exDate" value="${E.date}"></label>
      <label class="field"><span>Пробег, км (необязательно)</span><input type="number" id="exMileage" inputmode="numeric" value="${E.mileage || ''}"></label>
    </div>
    <label class="field"><span>Комментарий: почему, где делали, кто</span><textarea id="exNote" rows="3" placeholder="Например: стучало спереди, делали в сервисе на Рахова, гарантия 6 мес.">${esc(E.note)}</textarea></label>
    ${item?.created_by_name ? `<div class="muted" style="font-size:12px">Внёс: ${esc(item.created_by_name)}, ${esc((item.created_at || '').slice(0, 16))}</div>` : ''}`, [
    ...(item ? [{ text: 'Удалить', danger: true, onClick: async () => {
      if (!confirm('Удалить расход?')) return;
      await api('/api/expenses/' + item.id, { method: 'DELETE' }); closeDialog(); toast('Удалён'); if (after) await after();
    } }] : []),
    { text: 'Сохранить', primary: true, onClick: async () => {
      const amount = +$('#exAmount').value;
      if (!E.vehicle_id) throw new Error('Выберите машину');
      if (!amount) throw new Error('Укажите сумму');
      if (!E.category_id && !$('#exTitle').value.trim()) throw new Error('Выберите статью или напишите, что сделали');
      await api(item ? '/api/expenses/' + item.id : '/api/expenses', { method: item ? 'PUT' : 'POST', body: {
        vehicle_id: E.vehicle_id, date: $('#exDate').value || isoDate(new Date()), category_id: E.category_id, title: $('#exTitle').value.trim(),
        amount, mileage: parseInt($('#exMileage').value, 10) || 0, note: $('#exNote').value.trim() } });
      await reloadRefs();
      closeDialog(); toast('Расход записан');
      if (after) await after(); else if (S.view === 'fleet') loadFleet();
    } }]);
  const rv = () => $$('#exVeh button').forEach(b => b.classList.toggle('active', +b.dataset.id === E.vehicle_id));
  const rc = () => $$('#exCat button').forEach(b => b.classList.toggle('active', +b.dataset.id === E.category_id));
  $$('#exVeh button').forEach(b => b.onclick = () => { E.vehicle_id = +b.dataset.id; rv(); });
  $$('#exCat button').forEach(b => b.onclick = () => { E.category_id = +b.dataset.id; rc(); });
  rv(); rc();
}

function expensesPanel(r) {
  const exps = r.expenses || [];
  const total = exps.reduce((s, e) => s + e.amount, 0);
  const group = keyFn => {
    const m = new Map();
    exps.forEach(e => { const k = keyFn(e); const g = m.get(k) || { name: k, count: 0, amount: 0 }; g.count++; g.amount += e.amount; m.set(k, g); });
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  };
  const tbl = (rows, title) => rows.length ? `<table class="tbl"><tr><th>${title}</th><th class="r">Записей</th><th class="r">Сумма</th></tr>
    ${rows.map(g => `<tr><td>${esc(g.name)}<div class="bar" style="background:var(--danger);width:${total ? Math.max(2, g.amount / total * 100) : 0}%"></div></td><td class="r">${g.count}</td><td class="r"><b>${money(g.amount)}</b></td></tr>`).join('')}</table>`
    : '<div class="muted">Нет данных</div>';
  // прибыль по машине: взяли − доля владельца − расходы
  const profit = S.vehicles.filter(v => v.active || r.by_vehicle.some(g => g.id === v.id)).map(v => {
    const paid = r.by_vehicle.find(g => g.id === v.id)?.paid || 0;
    const owner = v.ownership === 'hired' ? Math.round(paid * (+v.owner_share || 0)) / 100 : 0;
    const exp = exps.filter(e => e.vehicle_id === v.id).reduce((s, e) => s + e.amount, 0);
    return { v, paid, owner, exp, net: paid - owner - exp };
  });
  return `<div class="panel wide"><h4>Прибыль по машинам</h4>
      <table class="tbl"><tr><th>Машина</th><th class="r">Взяли</th><th class="r">Владельцу</th><th class="r">Расходы</th><th class="r">Остаётся</th></tr>
      ${profit.map(x => `<tr><td>${esc(x.v.name)}</td><td class="r">${money(x.paid)}</td><td class="r">${x.owner ? money(x.owner) : '—'}</td><td class="r">${x.exp ? money(x.exp) : '—'}</td>
        <td class="r"><b style="color:${x.net < 0 ? 'var(--danger)' : 'var(--ok)'}">${money(x.net)}</b></td></tr>`).join('')}</table>
      <div class="muted" style="font-size:12px;margin-top:6px">Взяли с клиентов минус доля владельца наёмной машины и минус расходы на машину за период.</div></div>
    <div class="panel wide"><div class="page-head" style="margin-bottom:8px"><h4 style="margin:0">Расходы на автопарк: ${money(total)}</h4>
      <button class="btn btn-ghost btn-sm" id="repAddExp">+ Расход</button></div>
      ${exps.length ? `<div class="panels">
        <div><h4>По машинам</h4>${tbl(group(e => e.vehicle_name), 'Машина')}</div>
        <div><h4>По статьям</h4>${tbl(group(e => e.category_title || 'Без статьи'), 'Статья')}</div>
        <div class="wide" style="grid-column:1/-1"><h4>Все расходы с комментариями</h4><div class="card-list">${exps.map(expenseRow).join('')}</div></div>
      </div>` : '<div class="muted">Расходов за период нет.</div>'}</div>`;
}

/* ================= Автообновление ================= */
function anySheetOpen() { return $$('.sheet-backdrop').some(b => !b.classList.contains('hidden')); }
setInterval(async () => {
  if (document.hidden || S.view !== 'day' || !S.me || anySheetOpen()) return;
  try {
    const fresh = await api('/api/orders?date=' + S.date);
    if (JSON.stringify(fresh) !== JSON.stringify(S.orders)) { S.orders = fresh; renderDay(); }
  } catch { /* сеть пропала — попробуем позже */ }
}, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me && S.view === 'day') loadDay(); });
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => S.me && renderDay(), 150); });

/* ================= Запуск ================= */
document.addEventListener('DOMContentLoaded', async () => {
  initPinPad(); initNav(); initOrderForm(); initReport(); initClients();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try {
    await start();
  } catch { /* showLogin уже вызван при 401 */ }
});
