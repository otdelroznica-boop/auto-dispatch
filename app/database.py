import hashlib
import secrets
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "dispatch.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    tg_chat_id TEXT DEFAULT '',
    active INTEGER DEFAULT 1
);

-- Вид техники: эвакуатор, грузовая... Клиенту нужен вид, а не конкретная машина
CREATE TABLE IF NOT EXISTS vehicle_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plate TEXT DEFAULT '',
    color TEXT DEFAULT '#dc2626',
    default_driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    sort INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,  -- устарело, вместо него type_id
    title TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'шт',
    active INTEGER DEFAULT 1
);

-- Автопарк: документы (сканы/фото) и расходы по машине
CREATE TABLE IF NOT EXISTS vehicle_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,        -- имя файла на диске в data/uploads
    original_name TEXT DEFAULT '',
    mime TEXT DEFAULT '',
    size INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    sort INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vehicle_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
    title TEXT DEFAULT '',         -- что сделали/купили
    amount REAL DEFAULT 0,
    mileage INTEGER DEFAULT 0,     -- пробег на момент расхода, 0 = не указан
    note TEXT DEFAULT '',          -- комментарий: почему, кто, где
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_exp_date ON vehicle_expenses(date);

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'person',   -- person | org
    name TEXT NOT NULL DEFAULT '',
    phone TEXT DEFAULT '',
    phone_norm TEXT DEFAULT '',            -- только цифры, начинается с 7
    inn TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_clients_phone ON clients(phone_norm);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    date TEXT NOT NULL,               -- YYYY-MM-DD
    start_time TEXT NOT NULL,         -- HH:MM
    end_time TEXT NOT NULL,           -- HH:MM
    address_from TEXT DEFAULT '',
    address_to TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'new',        -- new | work | done | cancel
    plan_amount REAL DEFAULT 0,       -- расчёт: сумма услуг
    paid_amount REAL DEFAULT 0,       -- взяли с клиента (факт)
    payment_method TEXT DEFAULT 'cash', -- cash | card | invoice
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_orders_date ON orders(date);

CREATE TABLE IF NOT EXISTS order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    qty REAL DEFAULT 1,
    price REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lost_reasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    sort INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
);

-- Отказы (упущенная прибыль): звонили, а взять заказ не смогли
CREATE TABLE IF NOT EXISTS lost_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,               -- на какой день просили
    time TEXT DEFAULT '',             -- когда звонили, HH:MM
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    reason_id INTEGER REFERENCES lost_reasons(id) ON DELETE SET NULL,
    lines_json TEXT DEFAULT '[]',     -- требовавшиеся услуги [{service_id,title,qty,price}]
    amount REAL DEFAULT 0,            -- упущенная сумма
    client_phone TEXT DEFAULT '',
    note TEXT DEFAULT '',
    partner INTEGER DEFAULT 0,        -- 1 = передали заказ партнёру
    partner_name TEXT DEFAULT '',
    partner_income REAL DEFAULT 0,    -- сколько получили за передачу
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_lost_date ON lost_orders(date);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
);
"""

DEFAULT_SETTINGS = {
    "company_name": "Диспетчерская",
    "day_start": "7",
    "day_end": "23",
    "tg_token": "",
    "tg_dispatch_chat": "",
}


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_pin(pin: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def check_pin(pin: str, stored: str) -> bool:
    salt, _ = stored.split("$", 1)
    return secrets.compare_digest(hash_pin(pin, salt), stored)


def normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    return digits


DEFAULT_TYPES = ["Эвакуатор", "Грузовая"]
DEFAULT_EXPENSE_CATEGORIES = ["Ремонт", "Запчасти", "Шины", "ТО, масло, фильтры", "Топливо", "Страховка", "Техосмотр",
                              "Мойка", "Штрафы", "Другое"]
DEFAULT_REASONS = ["Все машины заняты", "Нет свободного водителя", "Далеко, не обслуживаем", "Не устроила цена",
                   "Клиент нашёл другого", "Другое"]


NEW_COLUMNS = {
    "vehicles": [
        ("ownership", "TEXT DEFAULT 'own'"),      # own | hired
        ("owner_name", "TEXT DEFAULT ''"),
        ("owner_share", "REAL DEFAULT 0"),        # % от «взяли», который отдаём владельцу
        ("type_id", "INTEGER"),
        # карточка для контроля парка
        ("brand", "TEXT DEFAULT ''"),             # марка, модель
        ("year", "INTEGER DEFAULT 0"),
        ("vin", "TEXT DEFAULT ''"),
        ("pts", "TEXT DEFAULT ''"),               # номер ПТС
        ("sts", "TEXT DEFAULT ''"),               # номер СТС
        ("mileage", "INTEGER DEFAULT 0"),         # текущий пробег, км
        ("mileage_date", "TEXT DEFAULT ''"),
        ("osago_until", "TEXT DEFAULT ''"),       # ОСАГО действует до
        ("inspection_until", "TEXT DEFAULT ''"),  # техосмотр (диагностическая карта) до
        ("service_every_km", "INTEGER DEFAULT 0"),  # ТО каждые N км
        ("last_service_km", "INTEGER DEFAULT 0"),   # пробег на последнем ТО
        ("fleet_note", "TEXT DEFAULT ''"),
    ],
    "services": [("type_id", "INTEGER")],         # NULL = для любой техники
    "lost_orders": [("type_id", "INTEGER")],
}


def migrate(conn):
    """Новые поля в уже существующих базах."""
    for table, columns in NEW_COLUMNS.items():
        cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
        for name, ddl in columns:
            if name not in cols:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    for table, titles in (("lost_reasons", DEFAULT_REASONS), ("vehicle_types", None),
                          ("expense_categories", DEFAULT_EXPENSE_CATEGORIES)):
        if conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0:
            if table == "vehicle_types":
                conn.executemany("INSERT INTO vehicle_types(name, sort) VALUES (?, ?)",
                                 [(t, i) for i, t in enumerate(DEFAULT_TYPES, 1)])
            else:
                conn.executemany(f"INSERT INTO {table}(title, sort) VALUES (?, ?)",
                                 [(t, i) for i, t in enumerate(titles, 1)])


def assign_types(conn):
    """Старые данные: проставить вид техники машинам, услугам и отказам."""
    types = {r["name"].lower(): r["id"] for r in conn.execute("SELECT id, name FROM vehicle_types")}
    tow = next((i for n, i in types.items() if "эвакуат" in n), None)
    cargo = next((i for n, i in types.items() if "груз" in n), None)
    for v in conn.execute("SELECT id, name FROM vehicles WHERE type_id IS NULL").fetchall():
        conn.execute("UPDATE vehicles SET type_id = ? WHERE id = ?",
                     (tow if "эвакуат" in v["name"].lower() else cargo, v["id"]))
    conn.execute("UPDATE services SET type_id = (SELECT type_id FROM vehicles WHERE vehicles.id = services.vehicle_id), "
                 "vehicle_id = NULL WHERE type_id IS NULL AND vehicle_id IS NOT NULL")
    conn.execute("UPDATE lost_orders SET type_id = (SELECT type_id FROM vehicles WHERE vehicles.id = lost_orders.vehicle_id) "
                 "WHERE type_id IS NULL AND vehicle_id IS NOT NULL")


def init_db():
    conn = get_connection()
    conn.executescript(SCHEMA)
    migrate(conn)
    for key, value in DEFAULT_SETTINGS.items():
        conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (key, value))

    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        # Первый вход: пользователь «Админ», пин 1111 — сменить в Настройках
        conn.execute("INSERT INTO users(name, pin_hash, is_admin) VALUES (?, ?, 1)", ("Админ", hash_pin("1111")))

    if conn.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0] == 0:  # первый запуск: пример парка
        conn.execute("INSERT INTO drivers(id, name, phone) VALUES (1, 'Алексей', '+7 999 111-22-33')")
        conn.execute("INSERT INTO drivers(id, name, phone) VALUES (2, 'Сергей', '+7 999 444-55-66')")
        conn.execute(
            "INSERT INTO vehicles(id, name, color, default_driver_id, sort) VALUES "
            "(1, 'Эвакуатор', '#dc2626', 1, 1), (2, 'Грузовая', '#2563eb', 2, 2)"
        )
        conn.executemany(
            "INSERT INTO services(vehicle_id, title, price, unit) VALUES (?, ?, ?, ?)",
            [
                (1, "Эвакуация по городу", 3500, "шт"),
                (1, "Эвакуация за город (за км)", 50, "км"),
                (1, "Заблокированные колёса", 1000, "шт"),
                (1, "Внедорожник / микроавтобус", 1000, "шт"),
                (1, "Ожидание (за час)", 500, "ч"),
                (2, "Грузоперевозка по городу (за час)", 1400, "ч"),
                (2, "Грузчик (за час)", 600, "ч"),
                (2, "Межгород (за км)", 40, "км"),
                (None, "Ночной тариф", 1000, "шт"),
            ],
        )
    assign_types(conn)
    conn.execute("UPDATE lost_reasons SET title = 'Все машины заняты' WHERE title = 'Машина занята'")
    conn.commit()
    conn.close()
