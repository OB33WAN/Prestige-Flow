import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('pf_cookie_consent', 'rejected'); localStorage.setItem('pf_region','london'); localStorage.setItem('pf_region_source','manual'); });
  let submission, checkout;
  await page.route('https://api.web3forms.com/submit', async route => {
    submission = route.request().postDataJSON();
    await route.fulfill({ json: { success: true } });
  });
  // Keep the normal booking suite isolated from the developer's live local CRM database.
  await page.route('http://127.0.0.1:4174/**', async route => {
    const cors = {'Access-Control-Allow-Origin':'http://localhost:4173','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Accept'};
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204,headers:cors});
    if (route.request().url().endsWith('/api/public/rates')) return route.fulfill({headers:{...cors,'Content-Type':'application/json'},json:{rates:{london:{DRAIN:{daytime:14000,evening:16000,weekend:16000},EMER:{daytime:14000,evening:16000,weekend:16000},PLUM:{daytime:10500,evening:11500,weekend:11500},CCTV:{fixed:17500}},regional:{DRAIN:{daytime:14000,evening:16000,weekend:16000},EMER:{daytime:14000,evening:16000,weekend:16000},PLUM:{daytime:9500,evening:11000,weekend:11000},CCTV:{fixed:17500}}},checkoutEnabled:false}});
    return route.fulfill({headers:{...cors,'Content-Type':'application/json'},json:{accepted:true,clientId:'test-client',bookingId:'test-booking',checkoutUrl:null}});
  });
  await page.route('https://buy.stripe.com/**', async route => {
    checkout = new URL(route.request().url());
    await route.fulfill({ contentType: 'text/html', body: '<h1>Intercepted Stripe checkout: no payment taken</h1>' });
  });
  for (const [region, drain, plumbing] of [['london', [140,160,160], [105,115,115]], ['regional', [140,160,160], [95,110,110]]]) {
    await page.goto('http://localhost:4173/booking/');
    await page.locator(`[data-region-choice="${region}"]`).click();
    await page.getByTestId('button-step1-next').click();
    const appointments = [['daytime','2027-10-25','09:00'],['evening','2027-10-25','19:00'],['weekend','2027-10-30','12:00']];
    for (const [index, [period, date, time]] of appointments.entries()) {
      await page.locator('#pf-visit-date').fill(date);
      await page.locator('#pf-visit-time').fill(time);
      for (const [service, rate] of [['drainage',drain[index]],['emergency-drainage',drain[index]],['plumbing',plumbing[index]],['cctv-survey',175]]) {
        assert.match(await page.getByTestId(`radio-service-${service}`).innerText(), new RegExp('£' + rate + '(?:/hr| \\+)'));
      }
    }
  }
  for (const route of ['/', '/areas/', '/areas/reading/', '/services/plumbing/', '/about/']) {
    await page.goto('http://localhost:4173' + route);
    const rateState = await page.evaluate(() => ({
      region: document.documentElement.dataset.pfRateRegion,
      period: document.documentElement.dataset.pfRatePeriod,
      bannerPresent: Boolean(document.querySelector('[data-pf-current-rates]'))
    }));
    assert.equal(rateState.region, 'regional', `Live rate region missing on ${route}`);
    assert.equal(rateState.bannerPresent, false, `Unwanted top price banner on ${route}`);
    const currentPeriod = rateState.period;
    assert.match(currentPeriod, /^(daytime|evening|weekend)$/);
    if (route === '/services/plumbing/') {
      const pageText = await page.locator('main').innerText();
      assert.match(pageText, /Monday-Friday 8am-6pm: £95\/hour \+ VAT/);
      assert.match(pageText, /Monday-Friday 6pm-8am: £110\/hour \+ VAT/);
      assert.match(pageText, /Weekends \(Sat & Sun\): £110\/hour \+ VAT/);
    }
  }
  const areaRates = {
    london: { daytime: { DRAIN: 140, EMER: 140, PLUM: 105, CCTV: 175 }, evening: { DRAIN: 160, EMER: 160, PLUM: 115, CCTV: 175 }, weekend: { DRAIN: 160, EMER: 160, PLUM: 115, CCTV: 175 } },
    regional: { daytime: { DRAIN: 140, EMER: 140, PLUM: 95, CCTV: 175 }, evening: { DRAIN: 160, EMER: 160, PLUM: 110, CCTV: 175 }, weekend: { DRAIN: 160, EMER: 160, PLUM: 110, CCTV: 175 } }
  };
  const periods = [
    { name: 'daytime', date: '2027-10-25', time: '09:00', code: 'DAY' },
    { name: 'evening', date: '2027-10-25', time: '19:00', code: 'EVE' },
    { name: 'weekend', date: '2027-10-30', time: '12:00', code: 'WKD' }
  ];
  const services = [['drainage','DRAIN'],['emergency-drainage','EMER'],['plumbing','PLUM'],['cctv-survey','CCTV']];
  for (const region of ['london','regional']) for (const period of periods) for (const [service,token] of services) {
    submission = undefined;
    await page.goto('http://localhost:4173/booking/');
    await page.locator(`[data-region-choice="${region}"]`).click();
    await page.getByTestId('button-step1-next').click();
    await page.locator('#pf-visit-date').fill(period.date);
    await page.locator('#pf-visit-time').fill(period.time);
    await page.getByTestId(`radio-service-${service}`).click();
    const basePounds = areaRates[region][period.name][token];
    const firstHourPence = Math.round(basePounds * 120);
    const depositPence = Math.round(firstHourPence / 10);
    const money = pence => `£${(pence / 100).toFixed(2)}`;
    assert.match(await page.getByTestId(`radio-service-${service}`).innerText(), new RegExp(`£${basePounds}(?:/hr| \\+)`));
    await page.getByTestId('button-step2-next').click();
    if (!submission && region === 'london' && period.name === 'daytime' && service === 'drainage') {
      await page.getByTestId('button-step3-next').click();
      assert.equal(await page.locator('#pf-name').count(), 1, 'Missing details must block advancement');
    }
    for (const [key,value] of Object.entries({name:'QA Test',phone:'07700900000',email:'qa@example.com',address:'1 Test Street',postcode:region==='london'?'SW1A 1AA':'RG1 1AA',notes:'Automated test; network intercepted.'})) await page.locator('#pf-'+key).fill(value);
    if (region === 'regional' && period.name === 'daytime' && service === 'plumbing') {
      await page.getByTestId('button-step3-back').click();
      assert.equal(await page.locator('#pf-visit-date').inputValue(), period.date);
      assert.equal(await page.locator('#pf-visit-time').inputValue(), period.time);
      await page.getByTestId('button-step2-next').click();
      assert.equal(await page.locator('#pf-address').inputValue(), '1 Test Street');
    }
    await page.getByTestId('button-step3-next').click();
    const summary = await page.locator('.pf-booking').innerText();
    assert.ok(summary.includes(money(firstHourPence)), `${region} ${period.name} ${service}: incorrect VAT-inclusive total`);
    assert.ok(summary.includes(money(depositPence)), `${region} ${period.name} ${service}: incorrect 10% deposit`);
    assert.match(summary, /Remaining balance[\s\S]*Due on site after the work/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile overflow');
    await page.getByTestId('button-step4-pay').click();
    await page.getByText('Request Received').waitFor();
    const periodCode = service === 'cctv-survey' ? 'FIX' : period.code;
    assert.equal(submission.sku, `${region==='london'?'LON':'REG'}-${token}-${periodCode}`);
    assert.equal(submission.address, '1 Test Street');
    assert.equal(submission.first_hour_including_vat, money(firstHourPence));
    assert.equal(submission.deposit_amount, money(depositPence));
    assert.equal(submission.deposit_percentage, 10);
    assert.match(submission.remaining_balance_due, /On site/);
    assert.equal(checkout, undefined, 'A full-price Stripe link must not be used for a 10% deposit.');
  }
  let liveIntake;
  await page.route('**/assets/site-config.js', route => route.fulfill({contentType:'text/javascript',body:'window.PrestigeFlowConfig={web3forms:{accessKey:""},crm:{apiBaseUrl:"https://crm.test"}};'}));
  const changedRates = {london:{DRAIN:{daytime:14900,evening:16900,weekend:16900},EMER:{daytime:14900,evening:16900,weekend:16900},PLUM:{daytime:11900,evening:12900,weekend:12900},CCTV:{fixed:19900}},regional:{DRAIN:{daytime:14900,evening:16900,weekend:16900},EMER:{daytime:14900,evening:16900,weekend:16900},PLUM:{daytime:10900,evening:11900,weekend:11900},CCTV:{fixed:19900}}};
  await page.route('https://crm.test/**', async route => {
    const cors = {'Access-Control-Allow-Origin':'http://localhost:4173','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Accept'};
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204,headers:cors});
    if (route.request().url().endsWith('/api/public/intake')) liveIntake = route.request().postDataJSON();
    return route.fulfill({headers:{...cors,'Content-Type':'application/json'},json:{rates:changedRates,accepted:true}});
  });
  await page.goto('http://localhost:4173/booking/');
  await page.locator('[data-region-choice="regional"]').click();
  await page.getByTestId('button-step1-next').click();
  await page.locator('#pf-visit-date').fill('2027-10-25');
  await page.locator('#pf-visit-time').fill('09:00');
  await page.getByTestId('radio-service-plumbing').getByText('£109/hr + VAT').waitFor();
  await page.getByTestId('radio-service-plumbing').click();
  await page.getByTestId('button-step2-next').click();
  for (const [key,value] of Object.entries({name:'Live Rate QA',phone:'07700900000',email:'qa@example.com',address:'1 Test Street',postcode:'RG1 1AA'})) await page.locator('#pf-'+key).fill(value);
  await page.getByTestId('button-step3-next').click();
  assert.match(await page.locator('.pf-booking').innerText(),/£130\.80/);
  assert.match(await page.locator('.pf-booking').innerText(),/£13\.08/);
  await page.getByTestId('button-step4-pay').click();
  await page.getByText('Request Received').waitFor();
  assert.equal(liveIntake.sku,'REG-PLUM-DAY');
  assert.equal(liveIntake.date,'2027-10-25');
  assert.deepEqual(errors, []);
  console.log('PASS: full booking flow for 24 service/area/time combinations plus live CRM rate propagation, required fields, back navigation, VAT-inclusive totals, 10% deposits, on-site balances, mobile width, exact booking submissions and no full-price checkout.');
} finally { await browser.close(); }
