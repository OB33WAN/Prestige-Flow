import fs from 'node:fs/promises';

const suppliedOrigin = String(process.argv[2] || 'https://prestige-flow-old-site-payments-api.fvbnid.easypanel.host').trim();
let apiOrigin;
try {
  const parsed = new URL(suppliedOrigin);
  if (parsed.protocol !== 'https:' || parsed.origin !== suppliedOrigin.replace(/\/+$/, '')) throw new Error();
  apiOrigin = parsed.origin;
} catch {
  throw new Error('OLD_SITE_API_ORIGIN must be an HTTPS origin without a path.');
}

const file = '.public-site/assets/site-config.js';
const source = await fs.readFile(file, 'utf8');
const prefix = 'window.PrestigeFlowConfig = ';
if (!source.startsWith(prefix)) throw new Error('Could not find the public site configuration object.');
const config = JSON.parse(source.slice(prefix.length).trim().replace(/;\s*$/, ''));
config.oldSitePayments = { ...(config.oldSitePayments || {}), apiBaseUrl: apiOrigin };
config.crm = { ...(config.crm || {}), apiBaseUrl: '' };
config.web3forms = { ...(config.web3forms || {}), accessKey: '' };
await fs.writeFile(file, `${prefix}${JSON.stringify(config, null, 2)};\n`);
console.log(`Configured old-site forms and bookings to use ${apiOrigin}; CRM and Web3Forms fallbacks are disabled.`);
