"""Уведомления в Telegram: новый заказ, изменение, отмена.

Бот создаётся у @BotFather, токен вводится в Настройках. Водитель и диспетчер
пишут боту /start, затем в Настройках «Найти чаты» показывает их chat_id.
"""
import json
import threading
import urllib.parse
import urllib.request

API = "https://api.telegram.org/bot{token}/{method}"

STATUS_TEXT = {"new": "Новый", "work": "В работе", "done": "Выполнен", "cancel": "Отменён"}
PAY_TEXT = {"cash": "наличные", "card": "перевод", "invoice": "безнал по счёту"}


def _call(token: str, method: str, params: dict | None = None, timeout: int = 10) -> dict:
    url = API.format(token=token, method=method)
    data = urllib.parse.urlencode(params or {}).encode()
    with urllib.request.urlopen(url, data=data, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def send(token: str, chat_ids: list[str], text: str) -> None:
    """Отправка в фоне, чтобы сохранение заказа не ждало Telegram."""
    chat_ids = [c for c in dict.fromkeys(chat_ids) if c]
    if not token or not chat_ids:
        return

    def worker():
        for chat_id in chat_ids:
            try:
                _call(token, "sendMessage", {"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                                             "disable_web_page_preview": "true"})
            except Exception as exc:  # уведомление не должно ронять приложение
                print(f"[telegram] не отправлено в {chat_id}: {exc}")

    threading.Thread(target=worker, daemon=True).start()


def discover_chats(token: str) -> list[dict]:
    """Кто писал боту в последнее время: chat_id + имя."""
    result = _call(token, "getUpdates", {"limit": 100})
    chats = {}
    for upd in result.get("result", []):
        msg = upd.get("message") or upd.get("my_chat_member") or {}
        chat = msg.get("chat") or {}
        if chat.get("id") is None:
            continue
        title = chat.get("title") or " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")]))
        if chat.get("username"):
            title += f" (@{chat['username']})"
        chats[str(chat["id"])] = {"chat_id": str(chat["id"]), "title": title.strip() or str(chat["id"])}
    return list(chats.values())


def esc(text) -> str:
    return str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def money(value) -> str:
    return f"{value:,.0f}".replace(",", " ") + " ₽"


def order_text(order: dict, header: str) -> str:
    d = order["date"]
    date_ru = f"{d[8:10]}.{d[5:7]}.{d[0:4]}"
    lines = [
        f"<b>{esc(header)}</b> #{order['id']}",
        f"{esc(order['vehicle_name'])} — {date_ru}, {order['start_time']}–{order['end_time']}",
    ]
    if order.get("driver_name"):
        lines.append(f"Водитель: {esc(order['driver_name'])}")
    client = order.get("client_name") or "без имени"
    lines.append(f"Клиент: {esc(client)} {esc(order.get('client_phone') or '')}".strip())
    if order.get("address_from"):
        lines.append(f"Откуда: {esc(order['address_from'])}")
    if order.get("address_to"):
        lines.append(f"Куда: {esc(order['address_to'])}")
    if order.get("lines"):
        lines.append("Услуги: " + "; ".join(esc(l["title"]) + (f" × {l['qty']:g}" if l["qty"] != 1 else "")
                                            for l in order["lines"]))
    lines.append(f"Сумма: {money(order['plan_amount'])}, оплата: {PAY_TEXT.get(order['payment_method'], '')}")
    if order.get("note"):
        lines.append(f"Комментарий: {esc(order['note'])}")
    lines.append(f"Статус: {STATUS_TEXT.get(order['status'], order['status'])}")
    return "\n".join(lines)
