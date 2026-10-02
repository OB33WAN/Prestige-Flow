interface Env {
	GITHUB_OAUTH_ID: string;
	GITHUB_OAUTH_SECRET: string;
	GITHUB_REPO_PRIVATE?: string;
}

const allowedCmsOrigins = new Set([
	'https://prestigeflow.co.uk',
	'https://www.prestigeflow.co.uk',
	'https://test.prestigeflow.co.uk',
	'https://staging.prestigeflow.co.uk',
]);

const cookieName = 'pf_decap_oauth_state';
const cookieMaxAgeSeconds = 600;

function secureHeaders(contentType: string): Headers {
	return new Headers({
		'Content-Type': contentType,
		'Cache-Control': 'no-store, max-age=0',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'no-referrer',
		'X-Frame-Options': 'DENY',
	});
}

function response(message: string, status: number): Response {
	const headers = secureHeaders('text/plain; charset=utf-8');
	return new Response(message, { status, headers });
}

function randomHex(byteLength: number): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function readCookie(request: Request, name: string): string | null {
	const cookieHeader = request.headers.get('Cookie') ?? '';
	for (const part of cookieHeader.split(';')) {
		const separator = part.indexOf('=');
		if (separator < 0) continue;
		if (part.slice(0, separator).trim() === name) {
			try {
				return decodeURIComponent(part.slice(separator + 1).trim());
			} catch {
				return null;
			}
		}
	}
	return null;
}

function cookie(value: string, maxAge: number): string {
	return `${cookieName}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/callback; Max-Age=${maxAge}`;
}

async function handleAuth(url: URL, env: Env): Promise<Response> {
	if (url.searchParams.get('provider') !== 'github') {
		return response('Unsupported authentication provider.', 400);
	}
	if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
		return response('GitHub OAuth is not configured on this Worker yet.', 503);
	}

	const state = randomHex(32);
	const redirectUri = `https://${url.hostname}/callback`;
	const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
	authorizationUrl.search = new URLSearchParams({
		client_id: env.GITHUB_OAUTH_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: env.GITHUB_REPO_PRIVATE === '1' ? 'repo,user' : 'public_repo,user',
		state,
	}).toString();

	const headers = new Headers({
		Location: authorizationUrl.toString(),
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'no-referrer',
	});
	headers.append('Set-Cookie', cookie(state, cookieMaxAgeSeconds));
	return new Response(null, { status: 302, headers });
}

function escapeForInlineScript(value: string): string {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

function callbackPage(status: 'success' | 'error', token = ''): Response {
	const nonce = randomHex(16);
	const safeToken = escapeForInlineScript(token);
	const origins = JSON.stringify([...allowedCmsOrigins]);
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Prestige Flow CMS sign-in</title></head>
<body><p id="status">Completing sign-in…</p><script nonce="${nonce}">
(() => {
  const message = 'authorization:github:${status}:' + JSON.stringify({ token: ${safeToken} });
  const allowedOrigins = ${origins};
  if (window.opener) {
    for (const origin of allowedOrigins) {
      window.opener.postMessage('authorizing:github', origin);
      window.opener.postMessage(message, origin);
    }
  }
  document.getElementById('status').textContent = '${status === 'success' ? 'Sign-in complete. You can close this window.' : 'Sign-in failed. Close this window and try again.'}';
  window.close();
})();
</script></body></html>`;
	const headers = secureHeaders('text/html; charset=utf-8');
	headers.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
	return new Response(html, { status: 200, headers });
}

async function handleCallback(request: Request, url: URL, env: Env): Promise<Response> {
	const clearStateCookie = cookie('', 0);
	const state = url.searchParams.get('state');
	const stateCookie = readCookie(request, cookieName);
	if (!state || !stateCookie || state !== stateCookie) {
		const result = callbackPage('error');
		result.headers.append('Set-Cookie', clearStateCookie);
		return result;
	}

	const code = url.searchParams.get('code');
	if (!code || !env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
		const result = callbackPage('error');
		result.headers.append('Set-Cookie', clearStateCookie);
		return result;
	}

	try {
		const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'User-Agent': 'Prestige-Flow-Decap-CMS',
			},
			body: JSON.stringify({
				client_id: env.GITHUB_OAUTH_ID,
				client_secret: env.GITHUB_OAUTH_SECRET,
				code,
				redirect_uri: `https://${url.hostname}/callback`,
			}),
		});
		if (!tokenResponse.ok) throw new Error('GitHub token exchange failed.');
		const tokenBody = await tokenResponse.json() as { access_token?: unknown; error?: unknown };
		if (typeof tokenBody.access_token !== 'string' || tokenBody.access_token.length < 20) {
			throw new Error('GitHub did not return an access token.');
		}
		const result = callbackPage('success', tokenBody.access_token);
		result.headers.append('Set-Cookie', clearStateCookie);
		return result;
	} catch {
		const result = callbackPage('error');
		result.headers.append('Set-Cookie', clearStateCookie);
		return result;
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'GET') return response('Method not allowed.', 405);
		const url = new URL(request.url);
		if (url.pathname === '/auth') return handleAuth(url, env);
		if (url.pathname === '/callback') return handleCallback(request, url, env);
		if (url.pathname === '/') {
			return new Response('Prestige Flow CMS authentication service is online.', {
				status: 200,
				headers: secureHeaders('text/plain; charset=utf-8'),
			});
		}
		return response('Not found.', 404);
	},
};
