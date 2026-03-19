import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import Stripe from 'stripe';

const REQUIRED_COLUMNS = [
  'sku',
  'title',
  'description',
  'amount_gbp',
  'currency',
  'tax_behavior'
];

const DEFAULT_VAT_PERCENT = 20;
const UK_VAT_DISPLAY_NAME = 'VAT';
const UK_VAT_JURISDICTION = 'GB';
const UK_COUNTRY = 'GB';

const parseBoolean = (value) => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return undefined;
};

const parseVatPercent = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    file: 'data/stripe-products.csv',
    dryRun: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--file') {
      parsed.file = args[i + 1] || parsed.file;
      i += 1;
      continue;
    }
  }

  return parsed;
};

const parseCsvLine = (line) => {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  out.push(current.trim());
  return out;
};

const parseCsv = (raw) => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (!lines.length) throw new Error('CSV file is empty.');

  const headers = parseCsvLine(lines[0]);
  for (const col of REQUIRED_COLUMNS) {
    if (!headers.includes(col)) {
      throw new Error(`Missing required CSV column: ${col}`);
    }
  }

  const rows = lines.slice(1).map((line, idx) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || '').trim();
    });

    if (!row.sku) {
      throw new Error(`Row ${idx + 2}: sku is required`);
    }
    if (!row.title) {
      throw new Error(`Row ${idx + 2}: title is required`);
    }
    if (!row.amount_gbp || Number.isNaN(Number(row.amount_gbp))) {
      throw new Error(`Row ${idx + 2}: amount_gbp must be numeric`);
    }

    row.amount_pence = Math.round(Number(row.amount_gbp) * 100);
    row.currency = (row.currency || 'GBP').toLowerCase();
    row.tax_behavior = (row.tax_behavior || 'exclusive').toLowerCase();

    return row;
  });

  return rows;
};

const getAllProductsBySku = async (stripe) => {
  const map = new Map();
  let hasMore = true;
  let startingAfter;

  while (hasMore) {
    const page = await stripe.products.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    });

    for (const product of page.data) {
      const sku = product.metadata?.sku;
      if (sku) map.set(sku, product);
    }

    hasMore = page.has_more;
    startingAfter = page.data.at(-1)?.id;
  }

  return map;
};

const getAllPaymentLinksBySku = async (stripe) => {
  const map = new Map();

  const collect = async (active) => {
    let hasMore = true;
    let startingAfter;

    while (hasMore) {
      const page = await stripe.paymentLinks.list({
        active,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {})
      });

      for (const link of page.data) {
        const sku = link.metadata?.sku;
        if (!sku || map.has(sku)) continue;
        map.set(sku, link);
      }

      hasMore = page.has_more;
      startingAfter = page.data.at(-1)?.id;
    }
  };

  await collect(true);
  await collect(false);

  return map;
};

const buildMetadata = ({ row, taxRateId, vatPercent }) => {
  const metadata = {
    sku: row.sku,
    stripe_tax_rate_id: taxRateId,
    vat_percent: String(vatPercent)
  };

  const passthrough = [
    'buy_button_label',
    'checkout_service_label',
    'region',
    'period'
  ];

  for (const key of passthrough) {
    if (row[key]) metadata[key] = row[key];
  }

  return metadata;
};

const buildProductPayload = ({ row, taxRateId, vatPercent }) => {
  const metadata = buildMetadata({ row, taxRateId, vatPercent });
  const active = parseBoolean(row.active);

  const payload = {
    name: row.title,
    description: row.description,
    metadata
  };

  if (typeof active === 'boolean') payload.active = active;
  if (row.tax_code) payload.tax_code = row.tax_code;

  return payload;
};

const ensureProduct = async ({ stripe, row, existingBySku, dryRun, taxRateId, vatPercent }) => {
  const existing = existingBySku.get(row.sku);
  const payload = buildProductPayload({ row, taxRateId, vatPercent });

  if (!existing) {
    if (dryRun) {
      return {
        id: `dry_product_${row.sku}`,
        created: true,
        updated: false,
        dryRun: true
      };
    }

    const created = await stripe.products.create({
      ...(row.product_id ? { id: row.product_id } : {}),
      ...payload
    });

    existingBySku.set(row.sku, created);

    return {
      id: created.id,
      created: true,
      updated: false
    };
  }

  const needsUpdate =
    existing.name !== row.title ||
    (existing.description || '') !== row.description ||
    (row.tax_code && (existing.tax_code || '') !== row.tax_code) ||
    (typeof payload.active === 'boolean' && existing.active !== payload.active) ||
    Object.entries(payload.metadata || {}).some(([k, v]) => (existing.metadata?.[k] || '') !== v);

  if (!needsUpdate) {
    return {
      id: existing.id,
      created: false,
      updated: false
    };
  }

  if (dryRun) {
    return {
      id: existing.id,
      created: false,
      updated: true,
      dryRun: true
    };
  }

  const updated = await stripe.products.update(existing.id, {
    ...payload
  });

  existingBySku.set(row.sku, updated);

  return {
    id: updated.id,
    created: false,
    updated: true
  };
};

const ensureUkVatTaxRate = async ({ stripe, dryRun, vatPercent }) => {
  if (dryRun) {
    return {
      id: `dry_tax_rate_uk_vat_${String(vatPercent).replace('.', '_')}`,
      created: true,
      dryRun: true
    };
  }

  const rates = await stripe.taxRates.list({
    active: true,
    limit: 100
  });

  const matched = rates.data.find((rate) => {
    const sameDisplay = (rate.display_name || '').toUpperCase() === UK_VAT_DISPLAY_NAME;
    const sameCountry = (rate.country || '').toUpperCase() === UK_COUNTRY;
    const sameJurisdiction = (rate.jurisdiction || '').toUpperCase() === UK_VAT_JURISDICTION;
    const sameInclusive = rate.inclusive === false;
    const samePercent = Number(rate.percentage) === Number(vatPercent);
    return sameDisplay && sameCountry && sameJurisdiction && sameInclusive && samePercent;
  });

  if (matched) {
    return {
      id: matched.id,
      created: false
    };
  }

  const created = await stripe.taxRates.create({
    display_name: UK_VAT_DISPLAY_NAME,
    description: `UK VAT ${vatPercent}%`,
    percentage: vatPercent,
    inclusive: false,
    country: UK_COUNTRY,
    jurisdiction: UK_VAT_JURISDICTION
  });

  return {
    id: created.id,
    created: true
  };
};

const ensurePrice = async ({ stripe, row, productId, dryRun, taxRateId, vatPercent }) => {
  const targetMetadata = {
    stripe_tax_rate_id: taxRateId,
    vat_percent: String(vatPercent)
  };

  if (dryRun) {
    return {
      id: `dry_price_${row.sku}`,
      created: true,
      dryRun: true
    };
  }

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100
  });

  const matched = prices.data.find((p) => {
    const sameAmount = p.unit_amount === row.amount_pence;
    const sameCurrency = p.currency === row.currency;
    const sameTax = (p.tax_behavior || 'unspecified') === row.tax_behavior;
    const oneTime = !p.recurring;
    return sameAmount && sameCurrency && sameTax && oneTime;
  });

  if (matched) {
    const metadataNeedsUpdate = Object.entries(targetMetadata).some(([key, value]) => {
      return (matched.metadata?.[key] || '') !== value;
    });

    if (metadataNeedsUpdate) {
      await stripe.prices.update(matched.id, {
        metadata: {
          ...(matched.metadata || {}),
          ...targetMetadata
        }
      });

      return {
        id: matched.id,
        created: false,
        updated: true
      };
    }

    return {
      id: matched.id,
      created: false
    };
  }

  const created = await stripe.prices.create({
    product: productId,
    unit_amount: row.amount_pence,
    currency: row.currency,
    tax_behavior: row.tax_behavior,
    metadata: targetMetadata
  });

  return {
    id: created.id,
    created: true,
    updated: false
  };
};

const normalizePriceId = (priceField) => {
  if (!priceField) return '';
  if (typeof priceField === 'string') return priceField;
  if (typeof priceField === 'object' && typeof priceField.id === 'string') return priceField.id;
  return '';
};

const buildPaymentLinkMetadata = ({ row, productId, priceId, taxRateId, vatPercent }) => {
  const metadata = {
    sku: row.sku,
    product_id: productId,
    price_id: priceId,
    stripe_tax_rate_id: taxRateId,
    vat_percent: String(vatPercent)
  };

  const passthrough = [
    'buy_button_label',
    'checkout_service_label',
    'region',
    'period'
  ];

  for (const key of passthrough) {
    if (row[key]) metadata[key] = row[key];
  }

  return metadata;
};

const createPaymentLinkPayload = ({ row, productId, priceId, taxRateId, vatPercent }) => {
  return {
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    automatic_tax: {
      enabled: true
    },
    tax_id_collection: {
      enabled: true
    },
    metadata: buildPaymentLinkMetadata({
      row,
      productId,
      priceId,
      taxRateId,
      vatPercent
    })
  };
};

const ensurePaymentLink = async ({
  stripe,
  row,
  productId,
  priceId,
  taxRateId,
  vatPercent,
  dryRun,
  existingPaymentLinksBySku
}) => {
  const existing = existingPaymentLinksBySku.get(row.sku);
  const payload = createPaymentLinkPayload({
    row,
    productId,
    priceId,
    taxRateId,
    vatPercent
  });

  if (!existing) {
    if (dryRun) {
      const id = `dry_plink_${row.sku}`;
      return {
        id,
        url: `https://buy.stripe.com/${id}`,
        created: true,
        updated: false,
        archived: false,
        dryRun: true
      };
    }

    const created = await stripe.paymentLinks.create(payload);
    existingPaymentLinksBySku.set(row.sku, created);
    return {
      id: created.id,
      url: created.url,
      created: true,
      updated: false,
      archived: false
    };
  }

  if (dryRun) {
    return {
      id: existing.id,
      url: existing.url || `https://buy.stripe.com/${existing.id}`,
      created: false,
      updated: true,
      archived: false,
      dryRun: true
    };
  }

  const existingLineItems = await stripe.paymentLinks.listLineItems(existing.id, {
    limit: 1
  });
  const existingPriceId = normalizePriceId(existingLineItems.data?.[0]?.price);
  const currentAutoTax = existing.automatic_tax?.enabled === true;
  const currentTaxIdCollection = existing.tax_id_collection?.enabled === true;
  const metadataNeedsUpdate = Object.entries(payload.metadata).some(([k, v]) => (existing.metadata?.[k] || '') !== v);
  const needsRecreate = existingPriceId && existingPriceId !== priceId;
  const needsUpdate = !needsRecreate && (!currentAutoTax || !currentTaxIdCollection || metadataNeedsUpdate);

  if (needsRecreate) {
    if (existing.active) {
      await stripe.paymentLinks.update(existing.id, {
        active: false
      });
    }

    const created = await stripe.paymentLinks.create(payload);
    existingPaymentLinksBySku.set(row.sku, created);
    return {
      id: created.id,
      url: created.url,
      created: true,
      updated: false,
      archived: true
    };
  }

  if (!needsUpdate) {
    return {
      id: existing.id,
      url: existing.url,
      created: false,
      updated: false,
      archived: false
    };
  }

  const updated = await stripe.paymentLinks.update(existing.id, {
    automatic_tax: {
      enabled: true
    },
    tax_id_collection: {
      enabled: true
    },
    metadata: payload.metadata,
    active: true
  });

  existingPaymentLinksBySku.set(row.sku, updated);
  return {
    id: updated.id,
    url: updated.url,
    created: false,
    updated: true,
    archived: false
  };
};

const main = async () => {
  const { file, dryRun } = parseArgs();
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!dryRun && !secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.');
  }

  const absPath = path.resolve(process.cwd(), file);
  const raw = await fs.readFile(absPath, 'utf8');
  const rows = parseCsv(raw);

  const stripe = dryRun ? null : new Stripe(secretKey);
  const existingBySku = dryRun ? new Map() : await getAllProductsBySku(stripe);
  const existingPaymentLinksBySku = dryRun ? new Map() : await getAllPaymentLinksBySku(stripe);
  const vatPercent =
    parseVatPercent(rows[0]?.vat_percent) ||
    DEFAULT_VAT_PERCENT;

  const taxRate = await ensureUkVatTaxRate({
    stripe,
    dryRun,
    vatPercent
  });

  const summary = {
    taxRatesCreated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    pricesCreated: 0,
    pricesUpdated: 0,
    paymentLinksCreated: 0,
    paymentLinksUpdated: 0,
    paymentLinksArchived: 0,
    rowsProcessed: 0
  };

  if (taxRate.created) summary.taxRatesCreated += 1;

  const mapping = [];
  const paymentLinkMapping = [];

  for (const row of rows) {
    const product = await ensureProduct({
      stripe,
      row,
      existingBySku,
      dryRun,
      taxRateId: taxRate.id,
      vatPercent
    });

    if (product.created) summary.productsCreated += 1;
    if (product.updated) summary.productsUpdated += 1;

    const price = await ensurePrice({
      stripe,
      row,
      productId: product.id,
      dryRun,
      taxRateId: taxRate.id,
      vatPercent
    });

    if (price.created) summary.pricesCreated += 1;
    if (price.updated) summary.pricesUpdated += 1;

    const paymentLink = await ensurePaymentLink({
      stripe,
      row,
      productId: product.id,
      priceId: price.id,
      taxRateId: taxRate.id,
      vatPercent,
      dryRun,
      existingPaymentLinksBySku
    });

    if (paymentLink.created) summary.paymentLinksCreated += 1;
    if (paymentLink.updated) summary.paymentLinksUpdated += 1;
    if (paymentLink.archived) summary.paymentLinksArchived += 1;

    mapping.push({
      sku: row.sku,
      title: row.title,
      product_id: product.id,
      price_id: price.id,
      payment_link_id: paymentLink.id,
      payment_link_url: paymentLink.url,
      tax_rate_id: taxRate.id,
      amount_pence: row.amount_pence,
      currency: row.currency,
      tax_behavior: row.tax_behavior
    });

    paymentLinkMapping.push({
      sku: row.sku,
      title: row.title,
      payment_link_id: paymentLink.id,
      payment_link_url: paymentLink.url,
      price_id: price.id,
      product_id: product.id,
      automatic_tax_enabled: true,
      tax_id_collection_enabled: true,
      tax_rate_reference_id: taxRate.id,
      vat_percent: vatPercent
    });

    summary.rowsProcessed += 1;
  }

  const outPath = path.resolve(process.cwd(), 'data/stripe-product-map.json');
  const paymentLinksOutPath = path.resolve(process.cwd(), 'data/stripe-payment-link-map.json');
  const taxOutPath = path.resolve(process.cwd(), 'data/stripe-tax-rate.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ generated_at: new Date().toISOString(), dry_run: dryRun, mapping }, null, 2));
  await fs.writeFile(
    paymentLinksOutPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        dry_run: dryRun,
        payment_links: paymentLinkMapping
      },
      null,
      2
    )
  );
  await fs.writeFile(
    taxOutPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        dry_run: dryRun,
        country: UK_COUNTRY,
        jurisdiction: UK_VAT_JURISDICTION,
        vat_percent: vatPercent,
        tax_rate_id: taxRate.id
      },
      null,
      2
    )
  );

  console.log('Stripe import completed.');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`UK VAT tax rate: ${taxRate.id}`);
  console.log(`Mapping written to: ${outPath}`);
  console.log(`Payment link mapping written to: ${paymentLinksOutPath}`);
  console.log(`Tax config written to: ${taxOutPath}`);
};

main().catch((err) => {
  console.error('Stripe import failed.');
  console.error(err.message || err);
  process.exitCode = 1;
});
