# Установка на VPS (рядом с Amnezia VPN)

Итог: приложение доступно по адресу `https://<адрес>` с любого телефона, база хранится на сервере, каждую ночь делается бэкап.

## 0. Проверить, свободны ли порты 80 и 443

Amnezia с протоколом XRay (Reality) часто занимает 443. Проверка на сервере:

```
sudo ss -tulpn | grep -E ':80 |:443 '
```

- Пусто: ставим по инструкции ниже.
- 443 занят XRay: вариант А — домен и порт 8443 (в Caddyfile указать `https://DISPATCH_HOST:8443`), сертификат Caddy
  получит через порт 80. Вариант Б — отдельный дешёвый VPS под приложение.

## 1. Адрес

Если своего домена нет, подойдёт бесплатный `<IP>.sslip.io` (например `203.0.113.10.sslip.io`). Он без настройки
указывает на IP сервера.

## 2. Приложение

```
sudo apt update && sudo apt install -y python3-venv sqlite3
sudo useradd -r -m -d /opt/dispatch dispatch
sudo -u dispatch git clone <репозиторий> /opt/dispatch     # или скопировать папку через scp
cd /opt/dispatch
sudo -u dispatch python3 -m venv .venv
sudo -u dispatch .venv/bin/pip install -r requirements.txt
sudo -u dispatch .venv/bin/python demo_data.py              # только для демо, на рабочей базе не запускать
sudo cp deploy/dispatch.service /etc/systemd/system/
sudo systemctl enable --now dispatch
curl -s localhost:8090/api/login-users                      # должен вернуть [{"id":1,"name":"Админ"}]
```

## 3. Caddy (HTTPS)

```
sudo apt install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/DISPATCH_HOST/203.0.113.10.sslip.io/' /etc/caddy/Caddyfile   # свой адрес
sudo systemctl reload caddy
```

Если на сервере включён firewall: `sudo ufw allow 80,443/tcp`.

## 4. Бэкап

```
sudo chmod +x /opt/dispatch/deploy/backup.sh
echo "0 3 * * * dispatch /opt/dispatch/deploy/backup.sh" | sudo tee /etc/cron.d/dispatch-backup
```

## 5. Первый вход

Открыть адрес, войти: Админ, пин 1111. Сразу сменить пин (Настройки, Пользователи) и завести пользователей.

## Обновление

```
cd /opt/dispatch && sudo -u dispatch git pull && sudo systemctl restart dispatch
```
