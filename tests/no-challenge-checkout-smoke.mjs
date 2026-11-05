import assert from 'node:assert/strict';
import fs from 'node:fs';
const files=['live.js','api/orders.js','api/config.js','lib/server.js'];
for(const path of files){const text=fs.readFileSync(path,'utf8');assert.doesNotMatch(text,/turnstile|verifyBot|gdsbCheckoutToken|challenges\.cloudflare\.com/i,path+' contains a challenge dependency')}
const order=fs.readFileSync('api/orders.js','utf8');
assert.match(order,/if\(typeof d\.website==='string'&&d\.website\.trim\(\)\)/);
assert.match(order,/quote\(d\)/);
assert.match(order,/decodeImage\(d\.receipt\)/);
assert.match(order,/sendAdminMail\(/);
assert.match(order,/Pending verification/);
const live=fs.readFileSync('live.js','utf8');
assert.match(live,/receipt:receiptData,website:/);
assert.match(live,/location\.href='success\.html'/);
assert.match(fs.readFileSync('site.js','utf8'),/name="website" tabindex="-1"/);
const config=fs.readFileSync('api/config.js','utf8');
assert.doesNotMatch(config,/TURNSTILE/);
assert.match(config,/checkoutReady/);
console.log('PASS | No Cloudflare in checkout | Server price and receipt checks retained | Hidden spam trap | Resend retained');
