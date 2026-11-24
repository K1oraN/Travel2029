import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export const baseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Cookie'
};

export function reply(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...baseHeaders, ...headers } });
}

export function environmentIsReady() {
  const { APP_ADMIN_PASSWORD, APP_VIEWER_PASSWORD, APP_SESSION_SECRET } = process.env;
  return [APP_ADMIN_PASSWORD, APP_VIEWER_PASSWORD].every((v) => typeof v === 'string' && /^\d{6}$/.test(v))
    && typeof APP_SESSION_SECRET === 'string' && APP_SESSION_SECRET.length >= 48
    && APP_ADMIN_PASSWORD !== APP_VIEWER_PASSWORD;
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch { return false; }
}

export function safeEqual(a, b) {
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

function signature(token) {
  return createHmac('sha256', process.env.APP_SESSION_SECRET).update(token).digest('base64url');
}

const cookieName = (request) => new URL(request.url).protocol === 'https:' ? '__Host-europa2029' : 'europa2029_local';

export function cookieFor(request, role) {
  const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + SESSION_DURATION_MS, nonce: randomBytes(12).toString('hex') })).toString('base64url');
  const encoded = `${payload}.${signature(payload)}`;
  return `${cookieName(request)}=${encoded}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export function clearCookie(request) {
  return `${cookieName(request)}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export function userFromRequest(request) {
  if (!environmentIsReady()) return null;
  const rawCookies = request.headers.get('cookie') || '';
  const prefix = `${cookieName(request)}=`;
  const raw = rawCookies.split(';').map((s) => s.trim()).find((s) => s.startsWith(prefix));
  if (!raw) return null;
  const session = raw.slice(prefix.length);
  const parts = session.split('.');
  if (parts.length !== 2 || !safeEqual(parts[1], signature(parts[0]))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!['admin', 'viewer'].includes(payload.role) || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    return { role: payload.role };
  } catch { return null; }
}

export const emptyData = () => ({ version: 1, people: ['Pessoa 1', 'Pessoa 2'], daily: {}, exchanges: {}, updatedAt: null });

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const START_MS = Date.UTC(2026, 10, 24);
const END_MS = Date.UTC(2029, 7, 31);
function validDay(day) {
  if (!dayPattern.test(day)) return false;
  const milliseconds = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === day && milliseconds >= START_MS && milliseconds <= END_MS;
}
function validMoney(amount) {
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000 && Math.abs(Math.round(amount * 100) - amount * 100) < 0.000001;
}
function moneyOrZero(value) { return value === undefined ? 0 : value; }

// API rejects foreign JSON fields, invalid dates, forged role changes and giant payloads.
export function sanitizeData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('JSON inválido');
  if (input.version !== 1) throw new Error('Versão de backup incompatível');
  if (!Array.isArray(input.people) || input.people.length !== 2 || input.people.some((s) => typeof s !== 'string' || s.trim().length < 1 || s.length > 32)) throw new Error('Nomes inválidos');
  const result = emptyData();
  result.people = input.people.map((s) => s.trim());
  if (!input.daily || typeof input.daily !== 'object' || Array.isArray(input.daily)) throw new Error('Registros diários inválidos');
  if (Object.keys(input.daily).length > 1012) throw new Error('Há mais dias que o calendário');
  for (const [day, entry] of Object.entries(input.daily)) {
    if (!validDay(day) || !entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Data inválida: ${day}`);
    const p1 = moneyOrZero(entry.p1), p2 = moneyOrZero(entry.p2);
    if (!validMoney(p1) || !validMoney(p2)) throw new Error(`Valor diário inválido: ${day}`);
    if (p1 > 0 || p2 > 0) result.daily[day] = { p1, p2 };
  }
  if (!input.exchanges || typeof input.exchanges !== 'object' || Array.isArray(input.exchanges)) throw new Error('Câmbios inválidos');
  if (Object.keys(input.exchanges).length > 21) throw new Error('Câmbios demais');
  for (const [number, entry] of Object.entries(input.exchanges)) {
    if (!/^(?:[1-9]|1\d|2[01])$/.test(number) || !entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Registro de câmbio inválido');
    const exchange = {};
    for (const index of ['p1', 'p2']) {
      const item = entry[index] || {};
      if (typeof item !== 'object' || Array.isArray(item) || typeof item.done !== 'boolean' || !validMoney(moneyOrZero(item.brl)) || !validMoney(moneyOrZero(item.eur))) throw new Error('Valor de câmbio inválido');
      exchange[index] = { done: item.done, brl: moneyOrZero(item.brl), eur: moneyOrZero(item.eur) };
    }
    result.exchanges[number] = exchange;
  }
  return result;
}

export async function limitedJSON(request, maxBytes = 250_000) {
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new Error('Arquivo muito grande');
  return JSON.parse(text);
}

export function clientHash(request) {
  const ip = request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  return createHmac('sha256', process.env.APP_SESSION_SECRET).update(ip.trim()).digest('hex').slice(0, 40);
}
