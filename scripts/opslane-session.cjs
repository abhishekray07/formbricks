// Opslane auth recipe: mint a Formbricks session without driving the login UI.
// Runs inside the booted sandbox. The verifier passes credentials/base URL in
// env and reads the Playwright storageState JSON from OPSLANE_SESSION_OUT.
//
// Formbricks uses NextAuth credentials, so the flow mirrors Documenso's:
//   GET  /api/auth/csrf                     -> csrfToken + next-auth.csrf-token cookie
//   POST /api/auth/callback/credentials     -> next-auth.session-token cookie
//
// Eventual home: abhishekray07/formbricks  scripts/opslane-session.cjs
//   opslane.yml:  auth: { session_command: node scripts/opslane-session.cjs }

const fs = require('fs');

const BASE = process.env.OPSLANE_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.OPSLANE_AUTH_EMAIL;
const PASSWORD = process.env.OPSLANE_AUTH_PASSWORD;
const OUT = process.env.OPSLANE_SESSION_OUT || '/home/user/opslane-storage-state.json';

if (!EMAIL || !PASSWORD) {
  console.error('MINT_FAIL: missing OPSLANE_AUTH_EMAIL or OPSLANE_AUTH_PASSWORD');
  process.exit(1);
}

const jar = {};
function store(setCookies) {
  for (const cookie of setCookies || []) {
    const [pair] = cookie.split(';');
    const sep = pair.indexOf('=');
    if (sep > 0) jar[pair.slice(0, sep).trim()] = pair.slice(sep + 1).trim();
  }
}
function cookieHeader() {
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join('; ');
}

async function main() {
  // 1. CSRF token (NextAuth requires it on the credentials callback).
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader() } });
  store(csrfRes.headers.getSetCookie());
  const csrfToken = await csrfRes.json().then((j) => j.csrfToken).catch(() => null);
  if (!csrfToken) {
    console.error('MINT_FAIL: no csrfToken from /api/auth/csrf');
    process.exit(1);
  }

  // 2. Credentials sign-in. NextAuth's callback expects form-urlencoded with
  //    json=true (so it returns JSON instead of a redirect) and sets the
  //    session cookie in Set-Cookie.
  const form = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    callbackUrl: BASE,
    json: 'true',
  });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
    body: form.toString(),
    redirect: 'manual',
  });
  store(loginRes.headers.getSetCookie());

  // NextAuth returns 200 (json=true) or 302; a wrong password redirects back to
  // /api/auth/error or sets no session-token. Validate by cookie presence.
  if (!jar['next-auth.session-token'] && !jar['__Secure-next-auth.session-token']) {
    console.error('MINT_FAIL: no session-token after login', loginRes.status, (await loginRes.text().catch(() => '')).slice(0, 200));
    process.exit(1);
  }

  const cookies = Object.entries(jar).map(([name, value]) => ({
    name, value, domain: 'localhost', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax',
  }));
  fs.writeFileSync(OUT, JSON.stringify({ cookies, origins: [] }));
  console.log(`MINT_OK cookies=${cookies.length}`);
}

main().catch((error) => {
  console.error('MINT_ERROR:', error && error.message ? error.message : error);
  process.exit(1);
});
