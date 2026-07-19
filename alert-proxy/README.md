# alert-proxy

Мінімальний Cloudflare Worker, що ховає токен alerts.in.ua від клієнтського застосунку.
Клієнт звертається до цього воркера з заголовком `X-Client-Key`, воркер підставляє
реальний `ALERTS_TOKEN` і проксіює запит до `https://api.alerts.in.ua/v1/alerts/active.json`.

## Розгортання (один раз)

Виконувати в цій теці (`alert-proxy/`):

```
npm install
npx wrangler login
npx wrangler secret put ALERTS_TOKEN
npx wrangler secret put CLIENT_KEY
npx wrangler deploy
```

- `wrangler login` відкриє браузер для входу в акаунт Cloudflare.
- `ALERTS_TOKEN` — ваш токен з https://alerts.in.ua/api-request (без `Bearer`, тільки сам токен).
- `CLIENT_KEY` — будь-який довгий випадковий рядок, який ви самі придумаєте
  (наприклад, згенерований через `openssl rand -hex 32`); цей самий рядок
  вкажете в застосунку в заголовку `X-Client-Key`.
- `wrangler deploy` виведе URL воркера виду `https://alert-proxy.<ваш-субдомен>.workers.dev`.

## Виклик з клієнта

```js
const res = await fetch('https://alert-proxy.<ваш-субдомен>.workers.dev', {
    headers: { 'X-Client-Key': '<той самий CLIENT_KEY>' },
});
const data = await res.json();
```

## Оновлення секретів

Повторний запуск `npx wrangler secret put ALERTS_TOKEN` перезаписує значення
(наприклад, якщо токен буде відкликано і видано новий).
