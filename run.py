import os
import sys

# Ensure UTF-8 output on Windows consoles to prevent UnicodeEncodeError
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import socket
import webbrowser
import threading
import time
import uvicorn

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def find_available_port(start_port=8080, max_port=8150) -> int:
    for p in range(start_port, max_port):
        if not is_port_in_use(p):
            return p
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def open_browser(port: int):
    time.sleep(1.2)
    webbrowser.open(f"http://127.0.0.1:{port}")

if __name__ == "__main__":
    # Custom port argument check (e.g. python run.py 8085)
    selected_port = None
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        custom_port = int(sys.argv[1])
        if not is_port_in_use(custom_port):
            selected_port = custom_port
        else:
            print(f"[!] Порт {custom_port} занят! Подбираем свободный порт...")

    if not selected_port:
        # Start looking from 8080 upwards, avoiding 8000
        selected_port = find_available_port(start_port=8080)

    local_ip = get_local_ip()

    print("=" * 65)
    print("  ДИСПЕТЧЕРСКАЯ: ЭВАКУАТОР & ГРУЗОВАЯ")
    print("=" * 65)
    print(f"  [+] Доступ на этом ПК:           http://127.0.0.1:{selected_port}")
    print(f"  [+] Доступ с телефона (Wi-Fi):   http://{local_ip}:{selected_port}")
    print("=" * 65)
    print(f"  Порт 8000 был пропущен, программа запущена на порту {selected_port}")
    print("  Браузер откроется автоматически через 1 секунду...")
    print("  Для завершения работы нажмите Ctrl+C")
    print("=" * 65)

    # Automatically open browser
    threading.Thread(target=open_browser, args=(selected_port,), daemon=True).start()

    # Run uvicorn on 0.0.0.0
    uvicorn.run("app.main:app", host="0.0.0.0", port=selected_port, reload=False)
