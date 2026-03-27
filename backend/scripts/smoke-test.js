const { spawn } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFetchTimeoutMs() {
  return Number(process.env.SMOKE_FETCH_TIMEOUT_MS) || 20000;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = getFetchTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(baseUrl) {
  const attempts = Number(process.env.SMOKE_WAIT_ATTEMPTS) || 120;
  const intervalMs = Number(process.env.SMOKE_WAIT_INTERVAL_MS) || 500;
  for (let i = 0; i < attempts; i++) {
    try {
      const ready = await fetchWithTimeout(`${baseUrl}/api/health/ready`);
      if (ready.ok) return true;
      const health = await fetchWithTimeout(`${baseUrl}/api/health`);
      if (health.ok) return true;
    } catch (e) {}
    await sleep(intervalMs);
  }
  return false;
}

async function requestJson(url, options = {}) {
  let res;
  try {
    res = await fetchWithTimeout(url, options);
  } catch (err) {
    throw new Error(`Fetch failed ${url}: ${err.message || err}`);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} ${JSON.stringify(data)}`);
  }
  return data;
}

async function requestJsonWithResponse(url, options = {}) {
  let res;
  try {
    res = await fetchWithTimeout(url, options);
  } catch (err) {
    throw new Error(`Fetch failed ${url}: ${err.message || err}`);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} ${JSON.stringify(data)}`);
  }
  return { data, res };
}

async function main() {
  const port = Number(process.env.SMOKE_PORT) || 3100;
  const uid = Date.now();
  const phone = `+2267${String(uid).slice(-7)}`;
  const email = `smoke+${uid}@example.com`;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@whabiz.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const debug = String(process.env.SMOKE_DEBUG || '').toLowerCase() === '1';
  let childExited = null;

  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT: String(port) },
    stdio: debug ? 'inherit' : ['ignore', 'pipe', 'pipe']
  });
  if (!debug) {
    server.stdout.on('data', (chunk) => process.stdout.write(String(chunk || '')));
    server.stderr.on('data', (chunk) => process.stderr.write(String(chunk || '')));
  }
  server.on('exit', (code, signal) => {
    childExited = { code, signal };
  });
  server.on('error', (err) => {
    childExited = { code: 1, signal: 'error', message: err.message };
  });

  try {
    const base = `http://127.0.0.1:${port}`;
    const up = await waitForServer(base);
    if (!up) {
      const extra = childExited ? ` (child exit: ${JSON.stringify(childExited)})` : '';
      throw new Error(`Server not reachable for smoke test${extra}`);
    }

    const health = await requestJson(`${base}/api/health`);
    if (health.status !== 'ok') {
      throw new Error('Health endpoint invalid');
    }

    const created = await requestJson(`${base}/api/vendeurs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nom: 'Smoke Test',
        boutique: 'Smoke Boutique',
        tel: phone,
        email,
        plan: 'starter',
        produits: 'test'
      })
    });

    const vendeurId = created.vendeur.id;
    const login = await requestJson(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tel: phone, password: '123456' })
    });

    if (!login.token) {
      throw new Error('Login token missing');
    }

    await requestJson(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendeurId,
        clientNom: 'Smoke Client',
        clientTel: '+22671111111',
        items: [{ id: 1, nom: 'Test', prix: 1000, quantity: 1 }],
        total: 1000
      })
    });

    await requestJson(`${base}/api/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'smoke_event', vendeurId })
    });

    const adminLogin = await requestJsonWithResponse(`${base}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword })
    });
    const admin = adminLogin.data;

    const setCookie = String(adminLogin.res.headers.get('set-cookie') || '');
    const cookiePair = setCookie.split(';')[0] || '';
    if (!cookiePair || !cookiePair.includes('=')) {
      throw new Error('Admin cookie session missing');
    }

    await requestJson(`${base}/api/auth/admin/session`, {
      headers: { Cookie: cookiePair }
    });

    const del = await fetch(`${base}/api/vendeurs/${vendeurId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin.token}` }
    });
    if (!del.ok) throw new Error('Failed cleanup vendeur');

    console.log('SMOKE_OK');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
