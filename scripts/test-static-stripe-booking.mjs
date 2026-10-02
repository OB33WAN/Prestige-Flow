import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.env.OLD_WEB_TEST_ROOT || '.public-site');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.xml': 'application/xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    let file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) throw new Error('invalid path');
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(await fs.readFile(file));
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/London' });
  const errors = [];
  let emailCalls = 0;
  let stripeCalls = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('pf_cookie_consent', 'accepted'));
  await page.route('https://api.web3forms.com/submit', async route => { emailCalls++; await route.fulfill({ json: { success: true } }); });
  await page.route('https://buy.stripe.com/**', async route => { stripeCalls++; await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Unexpected Stripe call</title>' }); });

  const sitemap = await fs.readFile(path.join(root, 'sitemap.xml'), 'utf8');
  const routes = [...sitemap.matchAll(/<loc>https:\/\/prestigeflow\.co\.uk(\/.*?)<\/loc>/gu)].map(([, route]) => route);
  assert.ok(routes.length >= 40, 'Expected the expanded public sitemap, including all detailed industry pages');
  let pricingTables = 0;
  for (const route of routes) {
    const response = await page.goto(`${base}${route}`);
    assert.equal(response?.status(), 200, `${route}: route should load`);
    const copy = await page.locator('main').first().innerText();
    assert.equal(await page.locator('[data-testid^="button-region-selector"]').count(), 0, `${route}: pricing area must not be a dropdown`);
    assert.doesNotMatch(copy, /£160(?:\/hr|\/hour)|£95(?:\/hr|\/hour)|£110(?:\/hr|\/hour)|£192\.00|London plumbing is .*other regions|From £140\/hr \+ VAT/i, `${route}: no obsolete rates or location-dependent prices`);
    assert.doesNotMatch(copy, /card-on-file payments|10% first-hour deposit|10% first-hour charge|captured only after we approve|Book Now - 10% Deposit|arrange the 10% deposit|This legacy Payment Link charges immediately|send a booking request|request a visit online|rates vary by service area|Clear rates by area and time|request a visit so we can confirm/i, `${route}: no stale payment, request-only or area-specific-rate copy`);
    if (route === '/about/') {
      for (const expected of ['8am-6pm', '£120/hr + VAT', '6pm-8am', '£140/hr + VAT', 'Weekends']) {
        assert.ok(copy.includes(expected), `About page should show the correct drainage periods and rates: ${expected}`);
      }
    }
    const table = page.locator('section[data-pricing-table]');
    if (await table.count()) {
      pricingTables++;
      const text = await table.innerText();
      assert.match(copy, /London & South East Region/i, `${route}: show the unified pricing region`);
      if (await table.locator('.pf-home-pricing__grid').count()) {
        for (const expected of ['£120/hr', '£140/hr', '£105/hr', '£115/hr', '£175 + VAT']) {
          assert.ok(text.includes(expected), `${route}: homepage pricing cards should include ${expected} before VAT`);
        }
      } else {
        for (const expected of ['£144.00 (£120 + VAT)/hr', '£168.00 (£140 + VAT)/hr', '£126.00 (£105 + VAT)/hr', '£138.00 (£115 + VAT)/hr', '£210 (£175 + VAT), fixed price']) {
          assert.ok(text.includes(expected), `${route}: unified VAT-inclusive price table should include ${expected}`);
        }
      }
      assert.match(text, /Beyond the London M25, a £75 call-out fee covers travel up to 100 miles outside the M25/i, `${route}: M25 call-out terms should be visible`);
      assert.match(text, /contact us to confirm/i, `${route}: unlisted areas should be directed to contact Prestige Flow`);
      assert.match(text, /bank holidays, Christmas and New Year weeks, and periods of national lockdown or pandemic-related restrictions/i, `${route}: all rate-exception periods should be shown`);
    }
  }
  assert.ok(pricingTables >= 10, 'Pricing table should be present on core page groups');

  const periods = [
    { code: 'DAY', date: '2027-10-25', time: '09:00', drainage: 120, plumbing: 105 },
    { code: 'EVE', date: '2027-10-25', time: '19:00', drainage: 140, plumbing: 115 },
    { code: 'WKD', date: '2027-10-30', time: '12:00', drainage: 140, plumbing: 115 }
  ];
  const services = [
    ['drainage', 'Drainage Service'], ['emergency-drainage', 'Emergency Drainage (24/7)'],
    ['plumbing', 'Plumbing Service'], ['cctv-survey', 'CCTV Drain Survey']
  ];
  let tested = 0;
  for (const postcode of ['SW1A 1AA', 'RG1 1AA', 'SL1 1AA']) for (const period of periods) for (const [service] of services) {
    await page.goto(`${base}/booking/`);
    assert.equal(await page.locator('[data-region-choice]').count(), 0, 'Booking must not ask for a pricing area');
    await page.getByText('Select Your Service', { exact: true }).waitFor();
    await page.locator('#pf-visit-date').fill(period.date);
    await page.locator('#pf-visit-time').fill(period.time);
    const option = page.getByTestId(`radio-service-${service}`);
    await option.click();
    const baseRate = service === 'cctv-survey' ? 175 : service === 'plumbing' ? period.plumbing : period.drainage;
    assert.match(await option.innerText(), new RegExp(`£${baseRate}(?:/hr| \\+ VAT)`), `${postcode}/${service}/${period.code}: booking card uses current unified rate`);
    await page.getByTestId('button-step2-next').click();
    for (const [key, value] of Object.entries({ name: 'QA Booking', phone: '07700900000', email: 'qa@example.com', address: '1 Test Street', postcode })) await page.locator(`#pf-${key}`).fill(value);
    await page.getByTestId('button-step3-next').click();
    await page.getByTestId('button-step4-pay').waitFor({ state: 'visible', timeout: 5000 });
    const summary = page.locator('.pf-booking');
    assert.match(await summary.innerText(), /Secure checkout is being connected/i);
    assert.match(await summary.innerText(), /London & South East Region/);
    assert.match(await summary.innerText(), new RegExp(`£${baseRate}(?:/hr| \\+ VAT)`));
    const action = page.getByTestId('button-step4-pay');
    assert.equal(await action.isDisabled(), true, `${postcode}/${service}/${period.code}: do not offer checkout until Stripe is connected`);
    assert.match(await action.innerText(), /Secure Checkout Not Connected/i);
    assert.equal(await page.locator('.pf-booking a[href="tel:+447743565339"]').count(), 1, 'Call option should be available');
    tested++;
  }
  // Exercise the dedicated old-site payment service independently of the CRM.
  // The API is mocked here: this verifies the static UI request contract and
  // redirect without creating a real Stripe session or charge.
  const siteConfig = await fs.readFile(path.join(root, 'assets/site-config.js'), 'utf8');
  await page.route('**/assets/site-config*.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `${siteConfig}\nwindow.PrestigeFlowConfig.oldSitePayments={apiBaseUrl:'https://old-site-payments.test'};`
  }));
  let apiPayload = null;
  await page.route('https://old-site-payments.test/api/public/rates', route => route.fulfill({
    contentType: 'application/json',
    json: { rates: { london: { DRAIN: { daytime:12000, evening:14000, weekend:14000 }, EMER:{ daytime:12000, evening:14000, weekend:14000 }, PLUM:{ daytime:10500, evening:11500, weekend:11500 }, CCTV:{ fixed:17500 } }, regional: { DRAIN:{ daytime:12000, evening:14000, weekend:14000 }, EMER:{ daytime:12000, evening:14000, weekend:14000 }, PLUM:{ daytime:10500, evening:11500, weekend:11500 }, CCTV:{ fixed:17500 } } }, checkoutEnabled:true }
  }));
  await page.route('https://old-site-payments.test/api/public/bookings', async route => {
    apiPayload = route.request().postDataJSON();
    await route.fulfill({ contentType:'application/json', status:201, json:{accepted:true,emailQueued:true,bookingReference:'PF-TEST-12345678',checkoutUrl:'https://checkout.stripe.test/session',depositPence:1440} });
  });
  await page.route('https://checkout.stripe.test/session', route => route.fulfill({ status:200,contentType:'text/html',body:'<title>Mock Stripe Checkout</title><h1>Stripe checkout mock</h1>' }));
  await page.goto(`${base}/booking/`);
  await page.locator('#pf-visit-date').fill('2027-10-25');
  await page.locator('#pf-visit-time').fill('09:00');
  await page.getByTestId('radio-service-drainage').click();
  await page.getByTestId('button-step2-next').click();
  for (const [key, value] of Object.entries({ name:'QA Booking',phone:'07700900000',email:'qa@example.com',address:'1 Test Street',postcode:'SW1A 1AA' })) await page.locator(`#pf-${key}`).fill(value);
  await page.getByTestId('button-step3-next').click();
  await page.locator('#pf-card-charge-consent').waitFor({state:'visible'});
  assert.equal(await page.locator('#pf-card-charge-consent').isChecked(), false, 'saved-card permission must remain an explicit optional opt-in');
  assert.match(await page.locator('.pf-booking').innerText(), /£14\.40/,'booking checkout shows 10% of the VAT-inclusive £144 first hour');
  assert.match(await page.locator('.pf-booking').innerText(), /charged immediately at checkout/i,'the deposit is charged immediately');
  assert.match(await page.locator('.pf-booking').innerText(), /staff will arrange a refund manually/i,'the customer is told refunds are handled manually without CRM approval');
  assert.match(await page.getByTestId('button-step4-pay').innerText(), /Pay 10% deposit securely/i);
  await Promise.all([page.waitForURL('https://checkout.stripe.test/session'),page.getByTestId('button-step4-pay').click()]);
  assert.equal(apiPayload?.service,'Drainage Service');
  assert.match(apiPayload?.sku,/^(?:LON|REG)-DRAIN-DAY$/);
  assert.equal(apiPayload?.card_charge_consent,false);
  assert.equal(emailCalls,0,'old-site booking notification must go through backend SMTP, not Web3Forms');
  assert.equal(stripeCalls, 0, 'Old Stripe links must not be used with the new rates');
  assert.deepEqual(errors, []);
  console.log(`PASS: ${routes.length} sitemap pages and ${pricingTables} unified rate tables checked; ${tested} offline booking cases stay disabled without Stripe; the connected-flow mock verifies a 10% VAT-inclusive deposit, optional saved-card opt-in, SMTP notification through the old-site API, no Web3Forms call, and Stripe Checkout redirect.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
