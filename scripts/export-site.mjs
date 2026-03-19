import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const siteOrigin = 'https://prestigeflow.co.uk';
const sitemapUrl = `${siteOrigin}/sitemap.xml`;
const outputDir = path.resolve(process.cwd(), 'dist');
const additionalRoutes = [
  `${siteOrigin}/industries`
];

const binaryAssetExtensions = new Set([
  '.avif',
  '.css',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.map',
  '.png',
  '.svg',
  '.txt',
  '.webmanifest',
  '.webp',
  '.woff',
  '.woff2',
  '.xml'
]);

const downloadedAssets = new Set();

function toSiteUrl(rawUrl) {
  try {
    return new URL(rawUrl, siteOrigin);
  } catch {
    return null;
  }
}

function isSameOrigin(url) {
  return url && url.origin === siteOrigin;
}

function toOutputPath(url, forceHtml = false) {
  let pathname = decodeURIComponent(url.pathname);

  if (forceHtml || !path.extname(pathname)) {
    pathname = pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}/index.html`;
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  return path.join(outputDir, pathname.replace(/^\//, ''));
}

async function writeFile(targetPath, content) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function extractRoutes() {
  const xml = await fetchText(sitemapUrl);
  const matches = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
  return [...new Set([...matches, ...additionalRoutes])];
}

async function scrollPage(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let current = 0;
      const step = Math.max(400, window.innerHeight * 0.75);
      const timer = window.setInterval(() => {
        current += step;
        window.scrollTo({ top: current, behavior: 'instant' });
        if (current >= document.body.scrollHeight) {
          window.clearInterval(timer);
          resolve();
        }
      }, 80);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}

async function saveAsset(urlString, bodyBuffer) {
  const url = toSiteUrl(urlString);
  if (!isSameOrigin(url)) {
    return;
  }

  const extension = path.extname(url.pathname).toLowerCase();
  if (!binaryAssetExtensions.has(extension)) {
    return;
  }

  const outputPath = toOutputPath(url, false);
  if (downloadedAssets.has(outputPath)) {
    return;
  }

  downloadedAssets.add(outputPath);
  await writeFile(outputPath, bodyBuffer);
}

function collectSiteAssetUrls(html) {
  const matches = new Set();
  const patterns = [
    /(href|src)=\"([^\"]+)\"/g,
    /(href|src)=\'([^\']+)\'/g,
    /url\(([^)]+)\)/g,
    /srcset=\"([^\"]+)\"/g,
    /srcset=\'([^\']+)\'/g
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = match[2] ?? match[1];
      if (!value) {
        continue;
      }

      for (const part of value.split(',')) {
        const candidate = part.trim().split(/\s+/)[0].replace(/^['\"]|['\"]$/g, '');
        const url = toSiteUrl(candidate);
        if (isSameOrigin(url)) {
          matches.add(url.toString());
        }
      }
    }
  }

  return [...matches];
}

async function downloadReferencedAssets(page, html) {
  const assetUrls = collectSiteAssetUrls(html);

  await Promise.all(
    assetUrls.map(async (assetUrl) => {
      const url = new URL(assetUrl);
      const extension = path.extname(url.pathname).toLowerCase();
      if (!binaryAssetExtensions.has(extension)) {
        return;
      }

      try {
        const response = await page.request.get(assetUrl);
        if (!response.ok()) {
          return;
        }

        const buffer = await response.body();
        await saveAsset(assetUrl, buffer);
      } catch {
        // Ignore missing optional assets and continue exporting remaining pages.
      }
    })
  );
}

async function exportRoute(browser, routeUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });

  page.on('response', async (response) => {
    try {
      const request = response.request();
      if (request.resourceType() === 'document') {
        return;
      }

      const url = toSiteUrl(response.url());
      if (!isSameOrigin(url)) {
        return;
      }

      const extension = path.extname(url.pathname).toLowerCase();
      if (!binaryAssetExtensions.has(extension)) {
        return;
      }

      const body = await response.body();
      await saveAsset(response.url(), body);
    } catch {
      // Ignore transient asset capture failures during export.
    }
  });

  try {
    // Check if browser is still connected
    if (!browser.isConnected()) {
      throw new Error('Browser disconnected');
    }

    await page.goto(routeUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await scrollPage(page);
    await page.waitForTimeout(750);

    const html = await page.content();
    const outputPath = toOutputPath(new URL(routeUrl), true);
    await writeFile(outputPath, html);
    await downloadReferencedAssets(page, html);

    console.log(`Exported ${routeUrl}`);
  } catch (err) {
    console.error(`Failed to export ${routeUrl}: ${err.message}`);
    throw err;
  } finally {
    try {
      await page.close().catch(() => {});
    } catch {
      // Ignore close errors
    }
  }
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  const routes = await extractRoutes();
  const browser = await chromium.launch({ headless: true });

  try {
    await writeFile(path.join(outputDir, 'CNAME'), 'prestigeflow.co.uk\n');

    for (const route of routes) {
      try {
        await exportRoute(browser, route);
        // Small delay between exports to prevent browser overwhelm
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`Error exporting route: ${err.message}`);
        // Try to reconnect browser if it crashed
        if (!browser.isConnected()) {
          console.log('Browser disconnected, attempting reconnect...');
          try {
            await browser.close().catch(() => {});
          } catch {
            // Ignore
          }
          browser = await chromium.launch({ headless: true });
        }
      }
    }

    for (const staticUrl of [
      `${siteOrigin}/robots.txt`,
      `${siteOrigin}/sitemap.xml`,
      `${siteOrigin}/manifest.json`,
      `${siteOrigin}/favicon.jpg`,
      `${siteOrigin}/logo.jpg`,
      `${siteOrigin}/share-image.jpg`
    ]) {
      try {
        const response = await fetch(staticUrl);
        if (!response.ok) {
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        await saveAsset(staticUrl, buffer);
      } catch {
        // Ignore optional root assets.
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});