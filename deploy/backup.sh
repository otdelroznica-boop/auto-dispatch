#!/bin/sh
# Ежедневный бэкап базы и документов автопарка, хранится 30 дней. В cron: 0 3 * * * /opt/dispatch/deploy/backup.sh
mkdir -p /opt/dispatch/backups
sqlite3 /opt/dispatch/data/dispatch.db ".backup /opt/dispatch/backups/dispatch-$(date +%F).db"
[ -d /opt/dispatch/data/uploads ] && tar -czf /opt/dispatch/backups/uploads-$(date +%F).tar.gz -C /opt/dispatch/data uploads
find /opt/dispatch/backups -name 'dispatch-*.db' -mtime +30 -delete
find /opt/dispatch/backups -name 'uploads-*.tar.gz' -mtime +30 -delete
