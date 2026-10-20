"""Демо-данные для показа: клиенты и заказы за последние 2 недели + сегодня/завтра.

Запуск: python demo_data.py   (только на пустой базе заказов)
"""
import random
from datetime import date, timedelta

from app.database import get_connection, init_db, normalize_phone

CLIENTS = [
    ("person", "Андрей", "+7 (960) 777-22-11", ""),
    ("person", "Сергей", "+7 (922) 777-28-19", ""),
    ("person", "Марина", "+7 (903) 123-45-67", ""),
    ("person", "Игорь Петрович", "+7 (927) 555-10-20", ""),
    ("org", "ООО «СтройМаркет»", "+7 (8452) 39-40-50", "6450012345"),
    ("org", "Автосервис «Форсаж»", "+7 (917) 300-20-10", "6452098765"),
    ("person", "Ольга", "+7 (937) 222-33-44", ""),
]
ADDR = ["пр. Строителей, 14", "ул. Чернышевского, 90", "Московское шоссе, 3", "ул. Рахова, 187", "2-я Поперечная, 5",
        "ТЦ Триумф Молл", "ул. Блинова, 50", "Энгельс, пр. Строителей, 1"]
NOTES = ["Renault Duster, пробито 2 колеса", "Не заводится", "ДТП, не на ходу", "Переезд, 2-комн. квартира",
         "Стройматериалы, 1,5 т", "Kia Rio, заблокировано колесо", ""]


def main():
    init_db()
    conn = get_connection()
    if conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]:
        print("Заказы уже есть — демо-данные не добавляю.")
        return
    for kind, name, phone, inn in CLIENTS:
        conn.execute("INSERT INTO clients(kind, name, phone, phone_norm, inn) VALUES (?, ?, ?, ?, ?)",
                     (kind, name, phone, normalize_phone(phone), inn))
    services = {r["id"]: dict(r) for r in conn.execute("SELECT * FROM services")}
    by_vehicle = {1: [s for s in services.values() if s["vehicle_id"] in (1, None)],
                  2: [s for s in services.values() if s["vehicle_id"] in (2, None)]}
    rnd = random.Random(7)
    today = date.today()
    for offset in range(-14, 2):
        day = today + timedelta(days=offset)
        for veh in (1, 2):
            hour = 8
            for _ in range(rnd.randint(0, 3)):
                hour += rnd.randint(0, 3)
                dur = rnd.choice([1, 1.5, 2, 3])
                if hour + dur > 22:
                    break
                start = f"{hour:02d}:{'30' if rnd.random() < .3 else '00'}"
                end_min = int(hour * 60 + dur * 60) + (30 if start.endswith("30") else 0)
                end = f"{end_min // 60:02d}:{end_min % 60:02d}"
                main_srv = by_vehicle[veh][0] if veh == 1 else by_vehicle[veh][0]
                lines = [(main_srv, dur if main_srv["unit"] == "ч" else 1)]
                extra = rnd.choice(by_vehicle[veh][1:])
                if rnd.random() < .5 and extra["id"] != main_srv["id"]:
                    lines.append((extra, 1 if extra["unit"] != "км" else rnd.choice([20, 35, 60])))
                plan = sum(s["price"] * q for s, q in lines)
                if offset < 0:
                    status = "cancel" if rnd.random() < .07 else "done"
                    paid = plan if rnd.random() < .85 else round(plan * .5, -2)
                elif offset == 0:
                    status = "done" if hour < 12 else "new"
                    paid = plan if status == "done" else 0
                else:
                    status, paid = "new", 0
                driver = veh if rnd.random() < .8 else (2 if veh == 1 else 1)
                client_id = rnd.randint(1, len(CLIENTS))
                oid = conn.execute(
                    "INSERT INTO orders(vehicle_id, driver_id, client_id, date, start_time, end_time, address_from, "
                    "address_to, note, status, plan_amount, paid_amount, payment_method, created_by) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
                    (veh, driver, client_id, day.isoformat(), start, end, rnd.choice(ADDR),
                     rnd.choice(ADDR) if rnd.random() < .6 else "", rnd.choice(NOTES), status, plan, paid,
                     rnd.choice(["cash", "cash", "card", "invoice"]))).lastrowid
                conn.executemany("INSERT INTO order_lines(order_id, service_id, title, qty, price) VALUES (?, ?, ?, ?, ?)",
                                 [(oid, s["id"], s["title"], q, s["price"]) for s, q in lines])
                hour = end_min // 60 + 1
    conn.commit()
    print("Демо-данные добавлены.")


if __name__ == "__main__":
    main()
