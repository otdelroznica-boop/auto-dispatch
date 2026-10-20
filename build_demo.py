"""Собирает демо-версию для GitHub Pages в папку docs/.

Демо работает без сервера: demo-api.js подменяет запросы к API и хранит данные в браузере.
Запуск после любых правок интерфейса: python build_demo.py
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "app" / "static"
OUT = ROOT / "docs"

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "static").mkdir(parents=True)

for f in SRC.iterdir():
    if f.name in ("index.html", "sw.js", "manifest.webmanifest"):
        continue
    shutil.copy2(f, OUT / "static" / f.name)
shutil.copy2(SRC / "sw.js", OUT / "sw.js")
shutil.copy2(SRC / "manifest.webmanifest", OUT / "manifest.webmanifest")

html = (SRC / "index.html").read_text(encoding="utf-8")
marker = '<script src="static/app.js'
assert marker in html, "в index.html не найден подключаемый app.js"
html = html.replace(marker, '<script src="static/demo-api.js"></script>\n' + marker, 1)
(OUT / "index.html").write_text(html, encoding="utf-8")
(OUT / ".nojekyll").write_text("", encoding="utf-8")
print(f"Демо собрано в {OUT}")
