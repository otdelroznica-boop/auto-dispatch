#!/bin/sh
# Ежедневный бэкап базы, хранится 30 дней. В cron: 0 3 * * * /opt/dispatch/deploy/backup.sh
mkdir -p /opt/dispatch/backups
sqlite3 /opt/dispatch/data/dispatch.db ".backup /opt/dispatch/backups/dispatch-$(date +%F).db"
find /opt/dispatch/backups -name 'dispatch-*.db' -mtime +30 -delete
