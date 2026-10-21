'use strict';
/* Демо-режим для GitHub Pages: сервер заменён эмуляцией API в браузере.
   Повторяет логику app/main.py. Данные хранятся в localStorage этого устройства. */
(function () {
  const KEY = 'dsp_demo_db_v3';
  const STATUS_TEXT = { new: 'Новый', work: 'В работе', done: 'Выполнен', cancel: 'Отменён' };
  const PAY_TEXT = { cash: 'наличные', card: 'перевод', invoice: 'безнал по счёту' };
  let mem = null; // если localStorage недоступен — держим в памяти

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
  const normPhone = p => {
    let d = String(p || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    if (d.length === 10) d = '7' + d;
    return d;
  };

  function seed() {
    const db = {
      seq: {}, sessions: {},
      settings: { company_name: 'Диспетчерская (демо)', day_start: '7', day_end: '23', tg_token: '', tg_dispatch_chat: '' },
      users: [{ id: 1, name: 'Админ', pin: '1111', is_admin: 1, active: 1 }, { id: 2, name: 'Диспетчер', pin: '2222', is_admin: 0, active: 1 }],
      drivers: [{ id: 1, name: 'Алексей', phone: '+7 999 111-22-33', tg_chat_id: '', active: 1 },
        { id: 2, name: 'Сергей', phone: '+7 999 444-55-66', tg_chat_id: '', active: 1 },
        { id: 3, name: 'Рустам', phone: '+7 999 777-88-99', tg_chat_id: '', active: 1 }],
      types: [{ id: 1, name: 'Эвакуатор', sort: 1, active: 1 }, { id: 2, name: 'Грузовая', sort: 2, active: 1 }],
      expCats: ['Ремонт', 'Запчасти', 'Шины', 'ТО, масло, фильтры', 'Топливо', 'Страховка', 'Техосмотр', 'Мойка', 'Штрафы', 'Другое']
        .map((title, i) => ({ id: i + 1, title, sort: i + 1, active: 1 })),
      vehicles: [
        { id: 1, name: 'Эвакуатор', type_id: 1, plate: 'А123ВС 164', color: '#dc2626', default_driver_id: 1, sort: 1, active: 1, ownership: 'own', owner_name: '', owner_share: 0,
          brand: 'ГАЗ Next, ломаная платформа', year: 2019, vin: 'X96A21R32K0012345', pts: '52 ОА 123456', sts: '99 12 345678', mileage: 187400, mileage_date: shift(-3),
          osago_until: shift(18), inspection_until: shift(140), service_every_km: 10000, last_service_km: 178000, fleet_note: '' },
        { id: 2, name: 'Грузовая', type_id: 2, plate: 'В456ОР 164', color: '#2563eb', default_driver_id: 2, sort: 2, active: 1, ownership: 'own', owner_name: '', owner_share: 0,
          brand: 'Isuzu ELF, будка 5 м', year: 2017, vin: 'JAANKR85E07123456', pts: '25 УТ 654321', sts: '99 98 765432', mileage: 243100, mileage_date: shift(-1),
          osago_until: shift(200), inspection_until: shift(-5), service_every_km: 15000, last_service_km: 230000, fleet_note: 'Подтекает гидроборт, следить' },
        { id: 3, name: 'Газель (наём)', type_id: 2, plate: 'Е789КХ 164', color: '#16a34a', default_driver_id: 3, sort: 3, active: 1, ownership: 'hired', owner_name: 'Рустам', owner_share: 70,
          brand: 'ГАЗель Next, тент', year: 2021, vin: '', pts: '', sts: '', mileage: 96000, mileage_date: shift(-7),
          osago_until: shift(90), inspection_until: shift(90), service_every_km: 0, last_service_km: 0, fleet_note: 'Обслуживает владелец' }],
      docs: [], expenses: [],
      reasons: ['Все машины заняты', 'Нет свободного водителя', 'Далеко, не обслуживаем', 'Не устроила цена', 'Клиент нашёл другого', 'Другое']
        .map((title, i) => ({ id: i + 1, title, sort: i + 1, active: 1 })),
      lost: [],
      services: [
        [1, 'Эвакуация по городу', 3500, 'шт'], [1, 'Эвакуация за город (за км)', 50, 'км'], [1, 'Заблокированные колёса', 1000, 'шт'],
        [1, 'Внедорожник / микроавтобус', 1000, 'шт'], [1, 'Ожидание (за час)', 500, 'ч'], [2, 'Грузоперевозка по городу (за час)', 1400, 'ч'],
        [2, 'Грузчик (за час)', 600, 'ч'], [2, 'Межгород (за км)', 40, 'км'], [null, 'Ночной тариф', 1000, 'шт'],
      ].map(([type_id, title, price, unit], i) => ({ id: i + 1, type_id, title, price, unit, active: 1 })),
      clients: [
        ['person', 'Андрей', '+7 (960) 777-22-11', ''], ['person', 'Сергей', '+7 (922) 777-28-19', ''],
        ['person', 'Марина', '+7 (903) 123-45-67', ''], ['person', 'Игорь Петрович', '+7 (927) 555-10-20', ''],
        ['org', 'ООО «СтройМаркет»', '+7 (8452) 39-40-50', '6450012345'], ['org', 'Автосервис «Форсаж»', '+7 (917) 300-20-10', '6452098765'],
        ['person', 'Ольга', '+7 (937) 222-33-44', ''],
      ].map(([kind, name, phone, inn], i) => ({ id: i + 1, kind, name, phone, phone_norm: normPhone(phone), inn, note: '', created_at: now() })),
      orders: [], lines: [],
    };
    db.seq = { users: 2, drivers: 3, vehicles: 3, services: 9, clients: 7, orders: 0, lines: 0, reasons: 6, lost: 0, types: 2, expCats: 10, docs: 0, expenses: 0 };

    // детерминированный генератор, чтобы демо выглядело одинаково
    let x = 7;
    const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const ADDR = ['пр. Строителей, 14', 'ул. Чернышевского, 90', 'Московское шоссе, 3', 'ул. Рахова, 187', '2-я Поперечная, 5',
      'ТЦ Триумф Молл', 'ул. Блинова, 50', 'Энгельс, пр. Строителей, 1'];
    const NOTES = ['Renault Duster, пробито 2 колеса', 'Не заводится', 'ДТП, не на ходу', 'Переезд, 2-комн. квартира',
      'Стройматериалы, 1,5 т', 'Kia Rio, заблокировано колесо', ''];
    const byVeh = {};
    db.vehicles.forEach(v => { byVeh[v.id] = db.services.filter(s => s.type_id === v.type_id || s.type_id === null); });
    for (let off = -14; off <= 1; off++) {
      for (const veh of [1, 2, 3]) {
        let hour = 8;
        const n = Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++) {
          hour += Math.floor(rnd() * 4);
          const dur = pick([1, 1.5, 2, 3]);
          if (hour + dur > 22) break;
          const half = rnd() < 0.3 ? 30 : 0;
          const sm = hour * 60 + half, em = sm + dur * 60;
          const t = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          const main = byVeh[veh][0];
          const lines = [[main, main.unit === 'ч' ? dur : 1]];
          const extra = pick(byVeh[veh].slice(1));
          if (rnd() < 0.5) lines.push([extra, extra.unit === 'км' ? pick([20, 35, 60]) : extra.unit === 'ч' ? dur : 1]);
          const plan = lines.reduce((s, [sv, q]) => s + sv.price * q, 0);
          let status, paid;
          if (off < 0) { status = rnd() < 0.07 ? 'cancel' : 'done'; paid = rnd() < 0.85 ? plan : Math.round(plan / 200) * 100; }
          else if (off === 0) { status = hour < 12 ? 'done' : 'new'; paid = status === 'done' ? plan : 0; }
          else { status = 'new'; paid = 0; }
          const id = ++db.seq.orders;
          db.orders.push({
            id, vehicle_id: veh, driver_id: rnd() < 0.8 ? veh : (veh === 1 ? 2 : 1), client_id: 1 + Math.floor(rnd() * 7),
            date: shift(off), start_time: t(sm), end_time: t(em), address_from: pick(ADDR), address_to: rnd() < 0.6 ? pick(ADDR) : '',
            note: pick(NOTES), status, plan_amount: plan, paid_amount: paid, payment_method: pick(['cash', 'cash', 'card', 'invoice']),
            created_by: 1, created_at: now(), updated_at: now(),
          });
          lines.forEach(([sv, q]) => db.lines.push({ id: ++db.seq.lines, order_id: id, service_id: sv.id, title: sv.title, qty: q, price: sv.price }));
          hour = Math.floor(em / 60) + 1;
        }
      }
    }
    // отказы: звонили, а машина занята / нет водителя
    for (let off = -14; off <= 0; off++) {
      if (rnd() < 0.35) continue;
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const veh = pick([1, 1, 2, 2, 3]);
        const sv = byVeh[veh][0], extra = rnd() < 0.3 ? pick(byVeh[veh].slice(1)) : null;
        const lines = [{ service_id: sv.id, title: sv.title, qty: sv.unit === 'ч' ? pick([1, 2, 3]) : 1, price: sv.price }];
        if (extra) lines.push({ service_id: extra.id, title: extra.title, qty: extra.unit === 'км' ? pick([20, 40]) : 1, price: extra.price });
        const partner = rnd() < 0.25;
        const amount = lines.reduce((s, x) => s + x.qty * x.price, 0);
        db.lost.push({ id: ++db.seq.lost, date: shift(off), time: `${String(8 + Math.floor(rnd() * 12)).padStart(2, '0')}:${pick(['05', '20', '40', '55'])}`,
          type_id: db.vehicles.find(v => v.id === veh).type_id, reason_id: pick([1, 1, 1, 2, 2, 3, 4, 5]), lines, amount, client_phone: '', note: '',
          partner: partner ? 1 : 0, partner_name: partner ? 'Магомед' : '', partner_income: partner ? Math.round(amount * 0.15 / 50) * 50 : 0,
          created_by: 1, created_at: now() });
      }
    }
    // расходы по машинам
    [[1, -20, 3, 'Зимняя резина, 6 шт', 54000, 182000, 'Старая лысая, шиномонтаж на Рахова'],
      [1, -12, 4, 'ТО: масло, фильтры', 9800, 178000, 'Плановое ТО'],
      [1, -4, 1, 'Замена троса лебёдки', 7500, 186900, 'Трос перетёрся на погрузке'],
      [2, -16, 2, 'Колодки передние', 6200, 241000, 'Скрипели при торможении'],
      [2, -9, 1, 'Ремонт гидроборта', 18500, 242300, 'Течь гидравлики, делали в сервисе «Гидравлика 64», гарантия 3 мес.'],
      [2, -2, 9, 'Штраф за превышение', 500, 0, 'Камера на Московском шоссе'],
      [1, -6, 8, 'Мойка', 800, 0, ''], [2, -6, 8, 'Мойка', 1000, 0, ''],
    ].forEach(([vid, off, cat, title, amount, mileage, note]) => db.expenses.push({ id: ++db.seq.expenses, vehicle_id: vid, date: shift(off),
      category_id: cat, title, amount, mileage, note, created_by: 1, created_at: now() }));
    return db;
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* нет доступа */ }
    if (mem) return mem;
    const db = seed(); save(db); return db;
  }
  function save(db) { mem = db; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* только память */ } }

  class HttpError extends Error { constructor(status, detail) { super(typeof detail === 'string' ? detail : detail.message); this.status = status; this.detail = detail; } }
  const fail = (s, d) => { throw new HttpError(s, d); };

  function currentUser(db) {
    let token = null;
    try { token = sessionStorage.getItem('dsp_demo_token') || localStorage.getItem('dsp_demo_token'); } catch { /* */ }
    const uid = token && db.sessions[token];
    const u = uid && db.users.find(x => x.id === uid && x.active);
    if (!u) fail(401, 'Нужно войти');
    return { id: u.id, name: u.name, is_admin: u.is_admin };
  }
  const admin = db => { const u = currentUser(db); if (!u.is_admin) fail(403, 'Доступно только администратору'); return u; };

  function upsert(db, table, id, data) {
    if (id) Object.assign(db[table].find(r => r.id === id) || fail(404, 'Не найдено'), data);
    else { id = ++db.seq[table]; db[table].push({ id, ...data }); }
    return id;
  }

  function enrich(db, o, withLines = true) {
    const v = db.vehicles.find(x => x.id === o.vehicle_id) || {};
    const d = db.drivers.find(x => x.id === o.driver_id);
    const c = db.clients.find(x => x.id === o.client_id);
    const u = db.users.find(x => x.id === o.created_by);
    const r = { ...o, vehicle_name: v.name, vehicle_color: v.color, driver_name: d?.name ?? null, driver_phone: d?.phone ?? null,
      client_name: c?.name ?? null, client_phone: c?.phone ?? null, client_kind: c?.kind ?? null, client_inn: c?.inn ?? null,
      created_by_name: u?.name ?? null };
    if (withLines) r.lines = db.lines.filter(l => l.order_id === o.id).map(({ service_id, title, qty, price }) => ({ service_id, title, qty, price }));
    return r;
  }
  const byTime = (a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time);
  const ordersBetween = (db, f, t) => db.orders.filter(o => o.date >= f && o.date <= t).sort(byTime).map(o => enrich(db, o));
  const debtOf = o => o.status === 'done' ? Math.max(o.plan_amount - o.paid_amount, 0) : 0;

  function clientStats(db, c) {
    const os = db.orders.filter(o => o.client_id === c.id && o.status !== 'cancel');
    return { ...c, orders_count: os.length, paid_total: os.reduce((s, o) => s + o.paid_amount, 0),
      last_date: os.reduce((m, o) => (!m || o.date > m ? o.date : m), null) };
  }

  function searchClients(db, q, limit) {
    const digits = q.replace(/\D/g, '');
    let list = db.clients;
    if (digits.length >= 3) {
      const tail = digits.length >= 4 && '78'.includes(digits[0]) ? digits.slice(1) : digits;
      list = list.filter(c => c.phone_norm.includes(tail));
    } else if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(s) || c.inn.includes(s));
    }
    return list.map(c => clientStats(db, c))
      .sort((a, b) => (b.last_date || '').localeCompare(a.last_date || '') || b.id - a.id).slice(0, limit);
  }

  function resolveClient(db, c) {
    if (!c) return null;
    const pn = normPhone(c.phone);
    if (c.id) { Object.assign(db.clients.find(x => x.id === c.id), { kind: c.kind, name: c.name.trim(), phone: c.phone, phone_norm: pn, inn: c.inn || '' }); return c.id; }
    if (pn) {
      const ex = db.clients.find(x => x.phone_norm === pn);
      if (ex) { if (c.name.trim() && !ex.name) ex.name = c.name.trim(); return ex.id; }
    }
    if (!pn && !c.name.trim()) return null;
    return upsert(db, 'clients', null, { kind: c.kind || 'person', name: c.name.trim(), phone: c.phone, phone_norm: pn, inn: c.inn || '', note: '', created_at: now() });
  }

  function saveOrder(db, user, id, b) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) fail(422, 'Проверьте дату');
    if (b.end_time <= b.start_time) fail(400, 'Время окончания должно быть позже начала');
    if (!b.force) {
      const c = db.orders.find(o => o.vehicle_id === b.vehicle_id && o.date === b.date && o.status !== 'cancel' && o.id !== (id || 0)
        && o.start_time < b.end_time && o.end_time > b.start_time);
      if (c) {
        const e = enrich(db, c, false);
        fail(409, { message: `Машина «${e.vehicle_name}» уже занята с ${c.start_time} до ${c.end_time} (заказ #${c.id}, ${e.client_name || 'без имени'})`, conflict_id: c.id });
      }
    }
    const lines = (b.lines || []).filter(l => String(l.title).trim());
    const fields = {
      vehicle_id: b.vehicle_id, driver_id: b.driver_id ?? null, client_id: resolveClient(db, b.client),
      date: b.date, start_time: b.start_time, end_time: b.end_time, address_from: b.address_from || '', address_to: b.address_to || '',
      note: b.note || '', status: b.status || 'new',
      plan_amount: lines.length ? Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100 : (b.plan_amount || 0),
      paid_amount: b.paid_amount || 0, payment_method: b.payment_method || 'cash', updated_at: now(),
    };
    if (id) {
      Object.assign(db.orders.find(o => o.id === id) || fail(404, 'Заказ не найден'), fields);
      db.lines = db.lines.filter(l => l.order_id !== id);
    } else {
      id = ++db.seq.orders;
      db.orders.push({ id, ...fields, created_by: user.id, created_at: now() });
    }
    lines.forEach(l => db.lines.push({ id: ++db.seq.lines, order_id: id, service_id: l.service_id ?? null, title: String(l.title).trim(), qty: l.qty, price: l.price }));
    return enrich(db, db.orders.find(o => o.id === id));
  }

  function enrichLost(db, l) {
    const t = db.types.find(x => x.id === l.type_id), r = db.reasons.find(x => x.id === l.reason_id), u = db.users.find(x => x.id === l.created_by);
    return { ...l, type_name: t?.name ?? null, vehicle_name: null, reason_title: r?.title ?? null, created_by_name: u?.name ?? null };
  }
  const lostBetween = (db, f, t) => db.lost.filter(l => l.date >= f && l.date <= t)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.id - b.id).map(l => enrichLost(db, l));

  function enrichExpense(db, e) {
    const v = db.vehicles.find(x => x.id === e.vehicle_id), c = db.expCats.find(x => x.id === e.category_id), u = db.users.find(x => x.id === e.created_by);
    return { ...e, vehicle_name: v?.name ?? '', vehicle_color: v?.color ?? '', category_title: c?.title ?? null, created_by_name: u?.name ?? null };
  }
  const expensesBetween = (db, f, t, vid) => db.expenses.filter(e => e.date >= f && e.date <= t && (!vid || e.vehicle_id === vid))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map(e => enrichExpense(db, e));

  function report(db, f, t) {
    const orders = ordersBetween(db, f, t), active = orders.filter(o => o.status !== 'cancel');
    const group = (key, name) => {
      const out = new Map();
      active.forEach(o => {
        const k = key(o);
        if (!out.has(k)) out.set(k, { id: k, name: name(o), orders: 0, plan: 0, paid: 0, debt: 0 });
        const g = out.get(k); g.orders++; g.plan += o.plan_amount; g.paid += o.paid_amount; g.debt += debtOf(o);
      });
      return [...out.values()].sort((a, b) => b.paid - a.paid);
    };
    const services = new Map();
    active.forEach(o => o.lines.forEach(l => {
      if (!services.has(l.title)) services.set(l.title, { name: l.title, qty: 0, amount: 0, orders: 0 });
      const g = services.get(l.title); g.qty += l.qty; g.amount += l.qty * l.price; g.orders++;
    }));
    const byDay = [];
    for (let d = new Date(f + 'T00:00:00'), end = new Date(t + 'T00:00:00'); d <= end && byDay.length < 400; d.setDate(d.getDate() + 1)) {
      const ds = iso(d), os = active.filter(o => o.date === ds);
      byDay.push({ date: ds, orders: os.length, plan: os.reduce((s, o) => s + o.plan_amount, 0), paid: os.reduce((s, o) => s + o.paid_amount, 0) });
    }
    return {
      date_from: f, date_to: t,
      totals: { orders: active.length, cancelled: orders.length - active.length, plan: active.reduce((s, o) => s + o.plan_amount, 0),
        paid: active.reduce((s, o) => s + o.paid_amount, 0), debt: active.reduce((s, o) => s + debtOf(o), 0) },
      by_vehicle: group(o => o.vehicle_id, o => o.vehicle_name),
      by_driver: group(o => o.driver_id || 0, o => o.driver_name || 'Не указан'),
      by_payment: group(o => o.payment_method, o => { const s = PAY_TEXT[o.payment_method] || o.payment_method; return s[0].toUpperCase() + s.slice(1); }),
      by_service: [...services.values()].sort((a, b) => b.amount - a.amount),
      by_day: byDay,
      debts: active.filter(o => debtOf(o) > 0.009),
      lost: lostBetween(db, f, t),
      expenses: expensesBetween(db, f, t),
    };
  }

  function handle(method, path, q, body) {
    const db = load();
    let m;
    const done = r => { save(db); return r; };
    if (path === '/api/login-users') return db.users.filter(u => u.active).map(({ id, name }) => ({ id, name }));
    if (path === '/api/login' && method === 'POST') {
      const u = db.users.find(x => x.id === body.user_id && x.active);
      if (!u || u.pin !== body.pin) fail(401, 'Неверный пин-код');
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      db.sessions[token] = u.id;
      try { localStorage.setItem('dsp_demo_token', token); } catch { /* */ }
      return done({ ok: true });
    }
    if (path === '/api/logout') { try { localStorage.removeItem('dsp_demo_token'); } catch { /* */ } return { ok: true }; }

    const user = currentUser(db);
    if (path === '/api/bootstrap') {
      const s = { ...db.settings };
      if (user.is_admin) s.tg_token_set = !!s.tg_token;
      delete s.tg_token;
      return { me: user, vehicles: [...db.vehicles].sort((a, b) => a.sort - b.sort || a.id - b.id), drivers: [...db.drivers].sort((a, b) => a.name.localeCompare(b.name)),
        reasons: [...db.reasons].sort((a, b) => a.sort - b.sort || a.id - b.id),
        types: [...db.types].sort((a, b) => a.sort - b.sort || a.id - b.id),
        expense_categories: [...db.expCats].sort((a, b) => a.sort - b.sort || a.id - b.id),
        services: [...db.services].sort((a, b) => (a.vehicle_id === null) - (b.vehicle_id === null) || (a.vehicle_id || 0) - (b.vehicle_id || 0) || a.id - b.id), settings: s };
    }
    if ((m = path.match(/^\/api\/(vehicles|drivers|services)(?:\/(\d+))?$/))) return done({ id: upsert(db, m[1], m[2] ? +m[2] : null, body) });

    if ((m = path.match(/^\/api\/reasons(?:\/(\d+))?$/))) return done({ id: upsert(db, 'reasons', m[1] ? +m[1] : null, body) });
    if ((m = path.match(/^\/api\/types(?:\/(\d+))?$/))) return done({ id: upsert(db, 'types', m[1] ? +m[1] : null, body) });
    if ((m = path.match(/^\/api\/expense-categories(?:\/(\d+))?$/))) return done({ id: upsert(db, 'expCats', m[1] ? +m[1] : null, body) });
    if ((m = path.match(/^\/api\/vehicles\/(\d+)\/docs$/))) {
      const vid = +m[1];
      if (method === 'GET') return db.docs.filter(d => d.vehicle_id === vid).sort((a, b) => b.id - a.id)
        .map(({ data, ...d }) => ({ ...d, created_by_name: db.users.find(u => u.id === d.created_by)?.name ?? null }));
      const id = ++db.seq.docs;
      const size = Math.round((body.data_b64.split(',').pop().length * 3) / 4);
      db.docs.push({ id, vehicle_id: vid, title: body.title, original_name: body.original_name || '', mime: body.mime || '', size,
        data: body.data_b64, created_by: user.id, created_at: now() });
      try { save(db); } catch { /* */ }
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { db.docs.pop(); fail(400, 'В демо не хватило места в браузере. Попробуйте файл поменьше.'); }
      return { id };
    }
    if ((m = path.match(/^\/api\/docs\/(\d+)$/)) && method === 'DELETE') { db.docs = db.docs.filter(d => d.id !== +m[1]); return done({ ok: true }); }
    if (path === '/api/expenses' && method === 'GET') {
      return expensesBetween(db, q.get('date_from') || '2000-01-01', q.get('date_to') || '2999-12-31', q.get('vehicle_id') ? +q.get('vehicle_id') : null);
    }
    if ((m = path.match(/^\/api\/expenses(?:\/(\d+))?$/))) {
      const id = m[1] ? +m[1] : null;
      if (method === 'DELETE') { db.expenses = db.expenses.filter(e => e.id !== id); return done({ ok: true }); }
      const data = { vehicle_id: body.vehicle_id, date: body.date, category_id: body.category_id ?? null, title: body.title || '',
        amount: body.amount || 0, mileage: body.mileage || 0, note: body.note || '' };
      if (!id) { data.created_by = user.id; data.created_at = now(); }
      const newId = upsert(db, 'expenses', id, data);
      const v = db.vehicles.find(x => x.id === data.vehicle_id);
      if (v && data.mileage > (v.mileage || 0)) { v.mileage = data.mileage; v.mileage_date = data.date; }
      const cat = db.expCats.find(c => c.id === data.category_id);
      if (v && data.mileage && cat && cat.title.toUpperCase().startsWith('ТО') && data.mileage > (v.last_service_km || 0)) v.last_service_km = data.mileage;
      return done(enrichExpense(db, db.expenses.find(e => e.id === newId)));
    }
    if (path === '/api/lost' && method === 'GET') {
      const d = q.get('date') || iso(new Date());
      return lostBetween(db, q.get('date_from') || d, q.get('date_to') || d);
    }
    if ((m = path.match(/^\/api\/lost(?:\/(\d+))?$/))) {
      const id = m[1] ? +m[1] : null;
      if (method === 'DELETE') { db.lost = db.lost.filter(l => l.id !== id); return done({ ok: true }); }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) fail(422, 'Проверьте дату');
      const lines = (body.lines || []).filter(l => String(l.title).trim());
      const data = { date: body.date, time: body.time || '', type_id: body.type_id ?? null, reason_id: body.reason_id ?? null, lines,
        amount: lines.length ? Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100 : (body.amount || 0),
        client_phone: body.client_phone || '', note: body.note || '', partner: body.partner ? 1 : 0,
        partner_name: body.partner ? (body.partner_name || '') : '', partner_income: body.partner ? (body.partner_income || 0) : 0 };
      if (!id) { data.created_by = user.id; data.created_at = now(); }
      const newId = upsert(db, 'lost', id, data);
      return done(enrichLost(db, db.lost.find(l => l.id === newId)));
    }
    if (path === '/api/clients' && method === 'GET') return searchClients(db, q.get('q') || '', +(q.get('limit') || 20));
    if ((m = path.match(/^\/api\/clients\/(\d+)$/)) && method === 'GET') {
      const c = db.clients.find(x => x.id === +m[1]) || fail(404, 'Клиент не найден');
      return { ...c, orders: db.orders.filter(o => o.client_id === c.id).sort(byTime).reverse().slice(0, 50).map(o => enrich(db, o, false)) };
    }
    if ((m = path.match(/^\/api\/clients(?:\/(\d+))?$/))) {
      const id = m[1] ? +m[1] : null, pn = normPhone(body.phone);
      if (pn && db.clients.some(c => c.phone_norm === pn && c.id !== id)) fail(409, 'Клиент с таким телефоном уже есть');
      return done({ id: upsert(db, 'clients', id, { ...body, phone_norm: pn }) });
    }

    if (path === '/api/orders' && method === 'GET') {
      const d = q.get('date') || iso(new Date());
      return ordersBetween(db, q.get('date_from') || d, q.get('date_to') || d);
    }
    if ((m = path.match(/^\/api\/orders\/(\d+)\/status$/))) {
      const o = db.orders.find(x => x.id === +m[1]) || fail(404, 'Заказ не найден');
      o.status = body.status; o.updated_at = now();
      return done(enrich(db, o));
    }
    if ((m = path.match(/^\/api\/orders\/(\d+)\/pay$/))) {
      const o = db.orders.find(x => x.id === +m[1]) || fail(404, 'Заказ не найден');
      o.paid_amount = body.paid_amount; if (body.payment_method) o.payment_method = body.payment_method;
      if (body.mark_done) o.status = 'done';
      o.updated_at = now();
      return done(enrich(db, o));
    }
    if ((m = path.match(/^\/api\/orders\/(\d+)$/))) {
      const id = +m[1];
      if (method === 'GET') return enrich(db, db.orders.find(o => o.id === id) || fail(404, 'Заказ не найден'));
      if (method === 'DELETE') { db.orders = db.orders.filter(o => o.id !== id); db.lines = db.lines.filter(l => l.order_id !== id); return done({ ok: true }); }
      return done(saveOrder(db, user, id, body));
    }
    if (path === '/api/orders' && method === 'POST') return done(saveOrder(db, user, null, body));

    if (path === '/api/report') return report(db, q.get('date_from'), q.get('date_to'));

    if (path === '/api/settings') { admin(db); Object.entries(body).forEach(([k, v]) => { if (v !== null && v !== undefined) db.settings[k] = String(v); }); return done({ ok: true }); }
    if (path.startsWith('/api/telegram')) { admin(db); fail(400, 'В демо-версии Telegram не подключается. Работает после установки на сервер.'); }
    if (path === '/api/users' && method === 'GET') { admin(db); return db.users.map(({ id, name, is_admin, active }) => ({ id, name, is_admin, active })); }
    if ((m = path.match(/^\/api\/users(?:\/(\d+))?$/))) {
      admin(db);
      const id = m[1] ? +m[1] : null;
      const data = { name: body.name, is_admin: body.is_admin ? 1 : 0, active: body.active ? 1 : 0 };
      if (body.pin) { if (!/^\d{4}$/.test(body.pin)) fail(400, 'Пин-код — 4 цифры'); data.pin = body.pin; }
      else if (!id) fail(400, 'Задайте пин-код');
      if (id === user.id && (!body.is_admin || !body.active)) fail(400, 'Нельзя снять права администратора с себя');
      return done({ id: upsert(db, 'users', id, data) });
    }
    fail(404, 'Not found');
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const idx = url.pathname.indexOf('/api/');
    if (idx < 0) return realFetch(input, init);
    const path = url.pathname.slice(idx);
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    try {
      const body = init.body ? JSON.parse(init.body) : {};
      return json(handle(init.method || 'GET', path, url.searchParams, body));
    } catch (e) {
      return e instanceof HttpError ? json({ detail: e.detail }, e.status) : json({ detail: String(e.message || e) }, 500);
    }
  };

  window.DEMO = {
    openDoc(id) {
      const d = load().docs.find(x => x.id === id);
      if (!d) return;
      const [head, b64] = d.data.split(',');
      const bin = atob(b64), arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([arr], { type: d.mime || head.slice(5, head.indexOf(';')) }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    reset() { try { localStorage.removeItem(KEY); localStorage.removeItem('dsp_demo_token'); } catch { /* */ } mem = null; location.reload(); },
    exportCsv(f, t) {
      const db = load();
      const cell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const rows = [['№', 'Дата', 'С', 'По', 'Машина', 'Водитель', 'Клиент', 'Телефон', 'Откуда', 'Куда', 'Услуги', 'Расчёт', 'Взяли', 'Долг', 'Оплата', 'Статус', 'Комментарий']];
      ordersBetween(db, f, t).forEach(o => rows.push([o.id, o.date, o.start_time, o.end_time, o.vehicle_name, o.driver_name, o.client_name, o.client_phone,
        o.address_from, o.address_to, o.lines.map(l => l.title + (l.qty !== 1 ? ' × ' + l.qty : '')).join('; '), o.plan_amount, o.paid_amount, debtOf(o),
        PAY_TEXT[o.payment_method], STATUS_TEXT[o.status], o.note]));
      const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `orders_${f}_${t}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    const p = document.createElement('p');
    p.className = 'muted';
    p.style.cssText = 'margin-top:16px;font-size:13px';
    p.textContent = 'Демо-версия. Пин: Админ 1111, Диспетчер 2222. Записи хранятся только на этом устройстве.';
    document.querySelector('.login-card').appendChild(p);
  });
})();
