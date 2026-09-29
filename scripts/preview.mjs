import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = path.resolve(process.cwd(), '.public-site');
const port = Number(process.env.PORT || 4173);
const crmApiBaseUrl = String(process.env.CRM_API_BASE_URL || '').trim().replace(/\/+$/, '');
if (crmApiBaseUrl) {
  const apiUrl = new URL(crmApiBaseUrl);
  if (apiUrl.protocol !== 'https:' && !(apiUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(apiUrl.hostname))) {
    throw new Error('CRM_API_BASE_URL must use HTTPS (HTTP is allowed only for localhost development).');
  }
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
};

function resolveFilePath(urlPath) {
  const candidate = path.resolve(rootDir, '.' + decodeURIComponent(urlPath));
  const relative = path.relative(rootDir, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid path');

  if (path.extname(candidate)) {
    return candidate;
  }

  return path.join(candidate, 'index.html');
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  try {
    if (url.pathname === '/assets/site-config.js' && crmApiBaseUrl) {
      const configPath = path.join(rootDir, 'assets', 'site-config.js');
      const source = await fs.readFile(configPath, 'utf8');
      const override = `\nwindow.PrestigeFlowConfig = window.PrestigeFlowConfig || {};\nwindow.PrestigeFlowConfig.crm = { ...(window.PrestigeFlowConfig.crm || {}), apiBaseUrl: ${JSON.stringify(crmApiBaseUrl)} };\n`;
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(source + override);
      return;
    }
    const filePath = resolveFilePath(url.pathname);
    const data = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Preview server running at http://localhost:${port}`);
});
