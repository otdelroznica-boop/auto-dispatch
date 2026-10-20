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
  Object.assign(S, { me: b.me, vehicles: b.vehicles, drivers: b.drivers, services: b.services, settings: b.settings });
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
  const map = { day: '#viewDay', report: '#viewReport', clients: '#viewClients', settings: '#viewSettings' };
  Object.entries(map).forEach(([k, sel]) => $(sel).classList.toggle('hidden', k !== view));
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('.datebar').style.visibility = view === 'day' ? '' : 'hidden';
  if (isPhone()) $('.datebar').style.display = view === 'day' ? '' : 'none';
  if (view === 'report') loadReport();
  if (view === 'clients') loadClients();
  if (view === 'settings') renderSettings();
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
  S.orders = await api('/api/orders?date=' + S.date);
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
  if (isPhone()) {
    $('#dayStats').innerHTML = `<div><b>${act.length}</b> зак. на <b>${money(plan)}</b></div>
      <div>взяли <b class="ok">${money(paid)}</b>${debt > 0 ? `, долг <b style="color:var(--danger)">${money(debt)}</b>` : ''}</div>`;
  } else $('#dayStats').innerHTML = `
    <div class="stat"><span>Заказов</span><b>${act.length}</b></div>
    <div class="stat"><span>Расчёт</span><b>${money(plan)}</b></div>
    <div class="stat ${paid > 0 ? 'ok' : ''}"><span>Взяли</span><b>${money(paid)}</b></div>
    ${debt > 0 && !isPhone() ? `<div class="stat bad"><span>Не добрали</span><b>${money(debt)}</b></div>` : ''}`;

  renderList();
  renderTimeline();
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

function renderList() {
  const all = dayOrders();
  const list = all.filter(o => (S.status === 'all' || o.status === S.status) && matchesSearch(o));
  const box = $('#orderList');
  if (!all.length) {
    box.innerHTML = `<div class="empty"><b>Заказов нет</b>Нажмите на свободное время на шкале или кнопку «Заказ».</div>`;
    return;
  }
  const note = list.length !== all.length ? `<div class="list-note">Показано ${list.length} из ${all.length}</div>` : '';
  box.innerHTML = note + (list.length ? list.map(orderCard).join('')
    : `<div class="empty"><b>Ничего не найдено</b>Измените поиск или фильтр.</div>`);
  bindCards(box);
}

function bindCards(box) {
  $$('.ocard', box).forEach(c => c.addEventListener('click', e => {
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
    return `<div><i class="dot" style="background:${esc(v.color)}"></i>${esc(v.name)}${drv && !isPhone() ? ` <small>${esc(drv.name)}</small>` : ''}</div>`;
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
function closeDialog() { $('#dialog').classList.add('hidden'); }

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

function servicesFor(vehId) {
  return S.services.filter(s => s.active && (s.vehicle_id === null || s.vehicle_id === vehId));
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
    box.textContent = `Машина в это время занята: ${c.start_time}–${c.end_time}, ${c.client_name || 'без имени'}`;
    box.classList.remove('hidden');
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
      <div class="panel wide"><h4>Выполнены, но оплачены не полностью</h4>${r.debts.length ? `<table class="tbl"><tr><th>Дата</th><th>Клиент</th><th>Машина</th><th class="r">Долг</th></tr>
        ${r.debts.map(o => `<tr class="click" data-id="${o.id}"><td>${dateRu(o.date, false)}</td><td>${esc(o.client_name || 'Без имени')} ${esc(o.client_phone || '')}</td><td>${esc(o.vehicle_name)}</td><td class="r"><b>${money(o.plan_amount - o.paid_amount)}</b></td></tr>`).join('')}</table>` : '<div class="muted">Долгов нет</div>'}</div>
    </div>`;
  $$('#reportBody tr.click').forEach(tr => tr.onclick = () => openOrder(+tr.dataset.id));
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
  Object.assign(S, { vehicles: b.vehicles, drivers: b.drivers, services: b.services, settings: b.settings });
}

function renderSettings() {
  const admin = S.me.is_admin;
  const vehName = id => id ? (vehicleById(id)?.name || '—') : 'Любая машина';
  $('#settingsBody').innerHTML = `
    <div class="page-head"><h2>Настройки</h2><button class="btn btn-ghost" id="logoutBtn">Выйти (${esc(S.me.name)})</button></div>

    <div class="settings-section"><h4>Машины</h4><p>Колонки на шкале. Водитель по умолчанию подставляется в новый заказ.</p>
      ${S.vehicles.map(v => `<div class="srow ${v.active ? '' : 'off'}" data-veh="${v.id}"><i class="dot" style="background:${esc(v.color)}"></i>
        <div class="main"><b>${esc(v.name)}</b><small>${esc(v.plate || '')} ${S.drivers.find(d => d.id === v.default_driver_id)?.name ? '· ' + esc(S.drivers.find(d => d.id === v.default_driver_id).name) : ''}</small></div>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addVeh">+ Машина</button></div>

    <div class="settings-section"><h4>Водители</h4><p>Чтобы водитель получал заказы в Telegram, укажите его чат (раздел Telegram ниже).</p>
      ${S.drivers.map(d => `<div class="srow ${d.active ? '' : 'off'}" data-drv="${d.id}">
        <div class="main"><b>${esc(d.name)}</b><small>${esc(d.phone)}${d.tg_chat_id ? ' · Telegram подключён' : ''}</small></div>${icon('right')}</div>`).join('')}
      <button class="link-btn" id="addDrv">+ Водитель</button></div>

    <div class="settings-section"><h4>Прайс услуг</h4><p>Кнопки услуг в заказе. Цену в заказе можно поменять.</p>
      ${S.services.map(s => `<div class="srow ${s.active ? '' : 'off'}" data-srv="${s.id}">
        <div class="main"><b>${esc(s.title)}</b><small>${esc(vehName(s.vehicle_id))}</small></div><b>${money(s.price)}${s.unit !== 'шт' ? '/' + esc(s.unit) : ''}</b>${icon('right')}</div>`).join('')}
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

function editVehicle(id) {
  const v = id ? vehicleById(id) : { name: '', plate: '', color: '#16a34a', default_driver_id: null, sort: S.vehicles.length + 1, active: 1 };
  editEntity(id ? 'Машина' : 'Новая машина', [
    { key: 'name', label: 'Название', value: v.name },
    { key: 'plate', label: 'Госномер', value: v.plate },
    { key: 'color', label: 'Цвет', type: 'color', value: v.color, attrs: 'style="height:44px;padding:4px"' },
    { key: 'driver', label: 'Водитель по умолчанию', type: 'select', value: v.default_driver_id ?? '', options: [['', 'Не указан'], ...S.drivers.map(d => [d.id, d.name])] },
    { key: 'sort', label: 'Порядок колонки', type: 'number', value: v.sort },
    { key: 'active', label: 'Работает (показывать на шкале)', type: 'check', value: v.active },
  ], '/api/vehicles', id, () => ({ name: ff('name'), plate: ff('plate'), color: ff('color'), default_driver_id: ff('driver') ? +ff('driver') : null, sort: +ff('sort') || 0, active: ff('active') }));
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
  const s = id ? S.services.find(x => x.id === id) : { title: '', price: 0, unit: 'шт', vehicle_id: null, active: 1 };
  editEntity(id ? 'Услуга' : 'Новая услуга', [
    { key: 'title', label: 'Название', value: s.title },
    { key: 'price', label: 'Цена, ₽', type: 'number', value: s.price, attrs: 'inputmode="decimal"' },
    { key: 'unit', label: 'Единица', type: 'select', value: s.unit, options: [['шт', 'за выезд / штука'], ['ч', 'за час'], ['км', 'за км']] },
    { key: 'veh', label: 'Для машины', type: 'select', value: s.vehicle_id ?? '', options: [['', 'Любая машина'], ...S.vehicles.map(v => [v.id, v.name])] },
    { key: 'active', label: 'Показывать в заказе', type: 'check', value: s.active },
  ], '/api/services', id, () => ({ title: ff('title'), price: +ff('price') || 0, unit: ff('unit'), vehicle_id: ff('veh') ? +ff('veh') : null, active: ff('active') }));
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
