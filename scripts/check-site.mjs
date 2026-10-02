import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { load } from 'cheerio';
import { pageFiles } from './site-files.mjs';

const titles = new Set();
const descriptions = new Set();
let content = 0, redirects = 0;
const sitemap = await fs.readFile('sitemap.xml', 'utf8');
const redirectConfig = await fs.readFile('deploy/easypanel/legacy-redirects.conf', 'utf8');
const serverRedirects = new Map([...redirectConfig.matchAll(/^location = (\S+) \{ return 301 (\S+); \}$/gmu)].map(([, source, target]) => [source, target]));
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/gu)].map(([, url]) => url));
const businessData = JSON.parse(await fs.readFile('data/business.json', 'utf8'));
const businessSchema = JSON.parse(await fs.readFile('local-business-schema.jsonld', 'utf8'));
assert.deepEqual(businessSchema.sameAs, businessData.sameAs, 'Business profile links must match verified source data.');
assert.deepEqual(businessSchema.areaServed, businessData.areaServed, 'Business coverage must match verified source data.');
assert.equal(businessSchema.openingHoursSpecification[0].opens, '08:00', 'Schema must show published office hours, not emergency availability.');
assert.equal(businessSchema.openingHoursSpecification[0].closes, '18:00');
assert.ok(!('aggregateRating' in businessSchema) && !('review' in businessSchema), 'Do not publish unverified review markup.');
for (const file of await pageFiles()) {
  const $ = load(await fs.readFile(file, 'utf8'));
  const canonical = $('link[rel="canonical"]').attr('href');
  assert.equal($('link[rel="canonical"]').length, 1, file);
  assert.ok(canonical.startsWith('https://prestigeflow.co.uk/'), file);
  if ($('meta[http-equiv="refresh"]').length) {
    redirects++;
    assert.match($('meta[name="robots"]').attr('content') || '', /noindex/i, `Legacy redirect must be noindex: ${file}`);
    const relative = path.relative(process.cwd(), file).split(path.sep).join('/');
    const route = `/${relative.replace(/(?:^|\/)index\.html$/u, '')}/`;
    const target = new URL(canonical).pathname;
    assert.ok(sitemapUrls.has(canonical), `Redirect destination must be indexable and in sitemap: ${file}`);
    assert.equal(serverRedirects.get(route), target, `Server-side permanent redirect: ${file}`);
    assert.equal(serverRedirects.get(route.slice(0, -1)), target, `Slashless server-side permanent redirect: ${file}`);
    continue;
  }
  content++;
  assert.equal($('html').attr('lang'), 'en-GB', `Language declaration: ${file}`);
  assert.equal($('meta[name="viewport"]').length, 1, `Mobile viewport: ${file}`);
  assert.equal($('h1').length, 1, `One visible H1: ${file}`);
  assert.ok(!$('meta[name="geo.region"], meta[name="geo.placename"]').length, `Do not rely on obsolete/misleading geo meta tags: ${file}`);
  assert.ok($('main').text().replace(/\s+/gu, ' ').trim().length >= 300, `Indexable page needs useful server-rendered content: ${file}`);
  $('a[href^="tel:"]').each((_, element) => {
    const link = $(element);
    const accessibleName = [link.text().trim(), link.attr('aria-label'), link.attr('title'), link.find('img[alt]').attr('alt'), link.find('svg[aria-label]').attr('aria-label')].filter(Boolean).join(' ').trim();
    assert.ok(accessibleName, `Telephone links need an accessible name: ${file}`);
  });
  assert.ok(!titles.has($('title').text()), `Duplicate title: ${file}`);
  titles.add($('title').text());
  assert.ok($('title').text().trim().length > 0 && $('title').text().length <= 60, `Concise, useful title length: ${file}`);
  const description = $('meta[name="description"]').attr('content') || '';
  assert.ok(description.length >= 70 && description.length <= 180, `Description length: ${file}`);
  assert.ok(!descriptions.has(description), `Duplicate description: ${file}`);
  descriptions.add(description);
  assert.equal($('meta[property="og:url"]').attr('content'), canonical, `Open Graph URL must match canonical: ${file}`);
  assert.equal($('meta[property="og:title"]').attr('content'), $('title').text(), `Open Graph title must match page title: ${file}`);
  assert.equal($('meta[property="og:description"]').attr('content'), description, `Open Graph description must match page description: ${file}`);
  assert.equal($('meta[name="twitter:title"]').attr('content'), $('title').text(), `Twitter title must match page title: ${file}`);
  assert.equal($('meta[name="twitter:description"]').attr('content'), description, `Twitter description must match page description: ${file}`);
  assert.equal($('meta[name="twitter:card"]').attr('content'), 'summary_large_image', `Twitter card type: ${file}`);
  assert.match($('meta[property="og:image"]').attr('content') || '', /^https:\/\//, `Absolute share image URL: ${file}`);
  $('img').each((_, image) => assert.ok($(image).is('[alt]'), `Every image needs useful or decorative alt text: ${file}`));
  assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `Sitemap: ${file}`);
  assert.equal($('#seo-fallback').length, 0, file);
  let hasBusiness = false;
  $('script[type="application/ld+json"]').each((_, e) => {
    const schema = JSON.parse($(e).text());
    for (const entity of (schema['@graph'] || [schema])) {
      if (entity['@id'] === 'https://prestigeflow.co.uk/#business') {
        hasBusiness = true;
        assert.deepEqual(entity.sameAs, businessData.sameAs, `Business profiles must match verified source data: ${file}`);
        assert.deepEqual(entity.areaServed, businessData.areaServed, `Business coverage must match verified source data: ${file}`);
        assert.equal(entity.openingHoursSpecification[0].opens, '08:00', `Office hours must be accurate: ${file}`);
        assert.equal(entity.openingHoursSpecification[0].closes, '18:00', `Office hours must be accurate: ${file}`);
        assert.ok(!('aggregateRating' in entity) && !('review' in entity), `Unverified review markup: ${file}`);
      }
      if (entity['@type'] === 'Service') {
        assert.ok(entity.areaServed?.includes('Maidenhead'), `Service coverage must include Maidenhead: ${file}`);
        assert.equal(entity.provider?.['@id'], 'https://prestigeflow.co.uk/#business', `Service provider entity: ${file}`);
      }
      if (entity['@type'] === 'BlogPosting') {
        assert.ok(entity.author?.name, `Blog articles need an accountable author: ${file}`);
        assert.match(entity.datePublished || '', /^\d{4}-\d{2}-\d{2}$/, `Blog publication date: ${file}`);
        assert.ok($('main').text().includes('By Prestige Flow LTD'), `Visible blog byline must match article schema: ${file}`);
      }
    }
  });
  assert.ok(hasBusiness, `Business entity: ${file}`);
  const graph = $('script[type="application/ld+json"]').toArray().flatMap(script => {
    const data = JSON.parse($(script).text());
    return data['@graph'] || [data];
  });
  for (const faq of graph.filter(entity => entity['@type'] === 'FAQPage')) {
    for (const question of faq.mainEntity || []) {
      assert.ok(question.name && question.acceptedAnswer?.text, `FAQ schema needs a complete visible question and answer: ${file}`);
      const visibleQuestion = $('[data-testid^="button-faq-"]').filter((_, el) => $(el).text().replace(/\s+/gu, ' ').trim() === question.name);
      assert.ok(visibleQuestion.length, `FAQ schema question must be visible: ${file} — ${question.name}`);
      const answerId = visibleQuestion.first().attr('aria-controls');
      const visibleAnswer = $('[id]').filter((_, el) => $(el).attr('id') === answerId).text().replace(/\s+/gu, ' ').trim();
      assert.equal(question.acceptedAnswer.text, visibleAnswer, `FAQ schema answer must match visible copy: ${file} — ${question.name}`);
    }
  }
}
assert.equal((sitemap.match(/<loc>/g) || []).length, content);
for (const url of sitemapUrls) assert.match(url, /^https:\/\/prestigeflow\.co\.uk\//u, `Absolute HTTPS sitemap URL: ${url}`);
for (const [from, to] of serverRedirects) assert.ok(sitemapUrls.has(`https://prestigeflow.co.uk${to}`), `Permanent redirects go directly to indexable sitemap pages: ${from}`);
const homepage = load(await fs.readFile('index.html', 'utf8'));
const homeText = homepage('main').text().replace(/\s+/gu, ' ').trim();
for (const phrase of ['Reading', 'Maidenhead', 'London', 'emergency reactive drainage', 'CCTV drain surveys', 'commercial maintenance', '1–4 hour response', '20+ years', 'transparent pricing']) {
  assert.ok(homeText.toLowerCase().includes(phrase.toLowerCase()), `Homepage must preserve requested SEO topic/USP: ${phrase}`);
}
const emergency = load(await fs.readFile('services/emergency-drainage/index.html', 'utf8'));
const emergencyText = emergency('main').text().replace(/\s+/gu, ' ').toLowerCase();
assert.ok(emergency('a[href^="tel:"]').length > 0 && emergency('a[href="/booking/"]').length > 0, 'Emergency landing page needs phone and booking CTAs.');
for (const phrase of ['emergency', 'drainage', 'London', 'Reading', 'Maidenhead']) assert.ok(emergencyText.includes(phrase.toLowerCase()), `Emergency page must serve core query/coverage: ${phrase}`);
const areas = load(await fs.readFile('areas/index.html', 'utf8'));
assert.equal(areas('details').length, 12, 'Areas index must show collapsible regional postcode cards.');
assert.ok(areas('main').text().includes('Winchester') && areas('main').text().includes('Portsmouth'), 'Area cards must include added Hampshire locations.');
const about = load(await fs.readFile('about/index.html', 'utf8'));
const aboutAreas = about('main h2').filter((_, el) => about(el).text().trim() === 'Service Areas').first().closest('section');
assert.equal(aboutAreas.find('details').length, 12, 'About page must list postcode districts in expandable regional groups.');
assert.ok(aboutAreas.text().includes('Winchester') && aboutAreas.text().includes('Portsmouth'), 'About postcode groups must include Winchester and Portsmouth.');
assert.ok(about('img[data-testid="img-ssip-member-scheme-about"]').length && about('img[data-testid="img-safeworkforce-logo-about"]').length, 'About accreditation panel must include SSIP and SafeWorkforce.');

for (const zone of ['london', 'central-london', 'east-london', 'north-london', 'northwest-london', 'southeast-london', 'southwest-london', 'west-london']) {
  assert.ok(!sitemapUrls.has('https://prestigeflow.co.uk/areas/' + zone + '/'), 'Retired area URL must not remain indexable: ' + zone);
  assert.equal(serverRedirects.get('/areas/' + zone + '/'), '/areas/', 'Area URL redirects to consolidated coverage page: ' + zone);
}
const keywordRows = (await fs.readFile('data/seo-keywords.csv', 'utf8')).split(/\r?\n/u).slice(1).filter(Boolean);
for (const row of keywordRows) {
  const match = row.match(/https:\/\/prestigeflow\.co\.uk\/[^",]+/u);
  if (match) assert.ok(sitemapUrls.has(match[0]) || serverRedirects.has(new URL(match[0]).pathname), `Keyword map must target a canonical page or direct redirect: ${match[0]}`);
}
const products = JSON.parse(await fs.readFile('data/stripe-product-map.json', 'utf8')).mapping;
const links = JSON.parse(await fs.readFile('data/stripe-payment-link-map.json', 'utf8')).payment_links;
for (const product of products) {
  assert.equal(product.checkout_ready, false, `Only verified 10% deposit checkout links may be enabled: ${product.sku}`);
  // These disabled mappings retain historical Stripe prices, not current booking rates.
  const [region, service, period] = product.sku.split('-');
  const historicalAmount = service === 'CCTV' ? 17500 : service === 'PLUM'
    ? region === 'LON' ? period === 'DAY' ? 10500 : 11500 : period === 'DAY' ? 9500 : 11000
    : period === 'DAY' ? 14000 : 16000;
  assert.equal(product.amount_pence, historicalAmount, `Historical Stripe price for ${product.sku}`);
  const link = links.find(x => x.sku === product.sku);
  assert.ok(link, product.sku);
  assert.equal(link.checkout_ready ?? false, false, `Historical payment link must stay disabled until verified: ${product.sku}`);
  assert.equal(link.price_id, product.price_id, product.sku);
  assert.equal(link.payment_link_url, product.payment_link_url, product.sku);
  assert.match(link.payment_link_url, /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/);
}
console.log(`PASS: ${content} content pages, ${redirects} redirects, ${products.length} Stripe mappings; metadata, sitemap, headings and JSON-LD.`);
