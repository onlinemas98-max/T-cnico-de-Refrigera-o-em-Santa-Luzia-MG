import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ADMIN_SHA256 = '425d61997bf9249a378f324165669789330dc80ea3215486b0f02b1ed1750796';
const SESSION_COOKIE_NAME = 'rsl_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const DATA_DIR = path.resolve(__dirname, 'private-data');
const DATA_FILE = path.resolve(DATA_DIR, 'leads-store.json');
const SITE_ROOT = path.resolve(__dirname, '..', 'tecnico-de-refrigeracao-santa-luzia-mg');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { leads: [], events: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return { leads: [], events: [] };
  }
}

function saveStore(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  return crypto.createHash('sha256').update(`rsl-${__dirname}-${DEFAULT_ADMIN_SHA256}`).digest('hex');
}

function verifyAdminPassword(candidate) {
  const configured = process.env.ADMIN_PASSWORD;
  if (configured && configured.length > 0) {
    const a = crypto.createHash('sha256').update(candidate, 'utf8').digest();
    const b = crypto.createHash('sha256').update(configured, 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
  }
  const candidateDigest = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = Buffer.from(DEFAULT_ADMIN_SHA256, 'hex');
  return candidateDigest.length === expectedDigest.length && crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

function createSessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_TTL_MS, nonce: crypto.randomBytes(12).toString('hex') })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return cookies;
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const cookies = parseCookies(req.headers.cookie);
  const token = bearerToken || cookies[SESSION_COOKIE_NAME];
  if (!verifySessionToken(token)) {
    res.status(401).json({ error: 'Sessão administrativa ausente ou expirada.' });
    return;
  }
  next();
}

function sanitizeText(value, maxLen = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLen) : '';
}

function normalizePagePath(value) {
  const raw = sanitizeText(value, 300);
  if (!raw) return '/';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function filterLeads(leads, query) {
  const dateFrom = typeof query.dateFrom === 'string' ? query.dateFrom.trim() : '';
  const dateTo = typeof query.dateTo === 'string' ? query.dateTo.trim() : '';
  const neighborhood = typeof query.neighborhood === 'string' ? query.neighborhood.trim() : '';
  const service = typeof query.service === 'string' ? query.service.trim() : '';
  return leads
    .filter((lead) => {
      const day = lead.createdAt.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (neighborhood && lead.neighborhood !== neighborhood) return false;
      if (service && lead.service !== service) return false;
      return true;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function escapeCsvCell(val) {
  return `"${String(val || '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
}

const app = express();
const port = Number(process.env.PORT || 3000);
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

const allowedOrigin = process.env.ALLOWED_ORIGIN?.trim();
if (allowedOrigin) {
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
}

app.post('/api/leads', (req, res) => {
  const body = req.body || {};
  if (sanitizeText(body.website, 100)) {
    res.status(200).json({ ok: true });
    return;
  }
  const name = sanitizeText(body.name, 120);
  const phone = sanitizeText(body.phone, 40);
  const neighborhood = sanitizeText(body.neighborhood, 120);
  const equipment = sanitizeText(body.equipment, 120);
  const service = sanitizeText(body.service, 140);
  const message = sanitizeText(body.message, 1500);
  const consent = body.consent === true;
  const pagePath = normalizePagePath(body.pagePath);
  const pageTitle = sanitizeText(body.pageTitle, 200);
  const digits = phone.replace(/\D/g, '');

  if (name.length < 2 || digits.length < 10 || digits.length > 13 || !neighborhood || !equipment || !service || message.length < 8 || !consent) {
    res.status(400).json({ error: 'Verifique os campos obrigatórios do formulário.' });
    return;
  }

  const store = ensureStore();
  const now = new Date().toISOString();
  const lead = { id: crypto.randomUUID(), createdAt: now, name, phone, neighborhood, equipment, service, message, pagePath, pageTitle };
  store.leads.push(lead);
  store.events.push({
    id: crypto.randomUUID(),
    createdAt: now,
    eventType: 'form_submit',
    pagePath,
    pageTitle,
    placement: 'formulario_orcamento',
    contextLabel: service,
  });
  saveStore(store);
  res.status(201).json({ ok: true, id: lead.id });
});

app.post('/api/track', (req, res) => {
  const body = req.body || {};
  if (body.eventType !== 'whatsapp_click' && body.eventType !== 'form_start') {
    res.status(400).json({ error: 'Evento inválido.' });
    return;
  }
  const store = ensureStore();
  store.events.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    eventType: body.eventType,
    pagePath: normalizePagePath(body.pagePath),
    pageTitle: sanitizeText(body.pageTitle, 200),
    placement: sanitizeText(body.placement, 80),
    contextLabel: sanitizeText(body.contextLabel, 160),
  });
  saveStore(store);
  res.status(201).json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  const body = req.body || {};
  const password = typeof body.password === 'string' ? body.password.trim() : '';
  if (!password || !verifyAdminPassword(password)) {
    res.status(401).json({ error: 'Senha incorreta.' });
    return;
  }
  const token = createSessionToken();
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
  res.json({ ok: true, token });
});

app.post('/api/admin/logout', (req, res) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/', sameSite: isHttps ? 'none' : 'lax', secure: isHttps });
  res.json({ ok: true });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const store = ensureStore();
  const filteredLeads = filterLeads(store.leads, req.query);
  let whatsappClicks = 0;
  let formStarts = 0;
  let formSubmits = 0;
  const pageMap = new Map();

  for (const ev of store.events) {
    const key = ev.pagePath || '/';
    if (!pageMap.has(key)) pageMap.set(key, { pagePath: key, whatsappClicks: 0, formStarts: 0, formSubmits: 0 });
    const entry = pageMap.get(key);
    if (ev.eventType === 'whatsapp_click') { whatsappClicks += 1; entry.whatsappClicks += 1; }
    else if (ev.eventType === 'form_start') { formStarts += 1; entry.formStarts += 1; }
    else if (ev.eventType === 'form_submit') { formSubmits += 1; entry.formSubmits += 1; }
  }

  res.json({
    totals: { totalLeads: store.leads.length, whatsappClicks, formStarts, formSubmits },
    facets: {
      neighborhoods: Array.from(new Set(store.leads.map((l) => l.neighborhood))).sort(),
      services: Array.from(new Set(store.leads.map((l) => l.service))).sort(),
    },
    leads: filteredLeads,
    byPage: Array.from(pageMap.values()).sort(
      (a, b) => b.whatsappClicks + b.formSubmits + b.formStarts - (a.whatsappClicks + a.formSubmits + a.formStarts)
    ),
  });
});

app.delete('/api/admin/leads/:id', requireAdmin, (req, res) => {
  const store = ensureStore();
  const before = store.leads.length;
  store.leads = store.leads.filter((item) => item.id !== req.params.id);
  if (store.leads.length === before) {
    res.status(404).json({ error: 'Registro não encontrado.' });
    return;
  }
  saveStore(store);
  res.json({ ok: true });
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const store = ensureStore();
  const filteredLeads = filterLeads(store.leads, req.query);
  const header = ['ID', 'Data e Hora', 'Nome', 'Telefone', 'Bairro', 'Equipamento', 'Servico', 'Mensagem', 'Pagina de Origem'].map(escapeCsvCell).join(';');
  const rows = filteredLeads.map((l) =>
    [l.id, l.createdAt, l.name, l.phone, l.neighborhood, l.equipment, l.service, l.message, l.pagePath].map(escapeCsvCell).join(';')
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-santa-luzia.csv"');
  res.send('\uFEFF' + [header, ...rows].join('\r\n'));
});

app.get(['/admin-leads.htm', '/admin'], (_req, res) => {
  res.redirect(302, '/ADMINISTRA%C3%87%C3%83O/admin-leads.htm');
});

app.use('/private-data', (_req, res) => res.status(403).send('Acesso proibido.'));

if (fs.existsSync(SITE_ROOT)) {
  app.use(express.static(SITE_ROOT, { extensions: ['html', 'htm'] }));
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor ativo em http://localhost:${port}`);
});
