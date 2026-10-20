// Нужен, чтобы телефон предлагал «установить как приложение».
// Данные всегда берутся из сети: офлайн-режима нет, чтобы не показывать устаревшие заказы.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
