// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { PROXY_URL, fetchWithTimeout } = require('../src/main/services/proxyConfig');
const { getInstallId, isValidInstallId } = require('../src/main/services/installId');

const calls = [];
global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {};
};

async function run() {
    await fetchWithTimeout(`${PROXY_URL}/forecast/31`, { headers: { 'X-Client-Key': 'k' } });
    const proxied = calls[0].options.headers;
    assert.strictEqual(proxied['X-Client-Key'], 'k');
    assert.ok(isValidInstallId(proxied['X-Client-Id']));
    assert.strictEqual(proxied['X-Client-Id'], getInstallId());
    console.log('ok - requests to the proxy carry the install id next to the existing headers');

    await fetchWithTimeout(`${PROXY_URL}/map/occupied`);
    assert.ok(isValidInstallId(calls[1].options.headers['X-Client-Id']));
    console.log('ok - requests without headers get the id too');

    await fetchWithTimeout(`${PROXY_URL}/x`, { headers: new Headers({ 'X-Client-Key': 'k' }) });
    const fromHeaders = calls[2].options.headers;
    assert.strictEqual(fromHeaders.get('X-Client-Key'), 'k');
    assert.strictEqual(fromHeaders.get('X-Client-Id'), getInstallId());
    console.log('ok - a Headers object is extended without losing its entries');

    await fetchWithTimeout('https://neptun.in.ua/api/v1/alerts', { headers: { Accept: 'application/json' } });
    assert.strictEqual(calls[3].options.headers['X-Client-Id'], undefined);
    await fetchWithTimeout('https://github.com/sergeiown/Alert_Server/releases');
    assert.strictEqual(calls[4].options.headers, undefined);
    console.log('ok - third-party servers never receive the id');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
