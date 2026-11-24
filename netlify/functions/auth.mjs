import { getStore } from '@netlify/blobs';
import { reply, environmentIsReady, sameOrigin, safeEqual, cookieFor, clearCookie, userFromRequest, limitedJSON, clientHash } from '../lib/shared.mjs';

export default async (request) => {
  if (!environmentIsReady()) return reply({ error: 'Acesso temporariamente indisponível. Tente novamente em instantes.' }, 503);

  if (request.method === 'GET') {
    return reply({ authenticated: Boolean(userFromRequest(request)), role: userFromRequest(request)?.role || null });
  }
  if (!sameOrigin(request)) return reply({ error: 'Origem não autorizada' }, 403);
  if (request.method === 'DELETE') return reply({ ok: true }, 200, { 'Set-Cookie': clearCookie(request) });
  if (request.method !== 'POST') return reply({ error: 'Método não permitido' }, 405, { Allow: 'GET, POST, DELETE' });

  try {
    const data = await limitedJSON(request, 2048);
    const { role, password } = data;
    if (!['admin', 'viewer'].includes(role) || typeof password !== 'string' || password.length > 256) return reply({ error: 'Credenciais inválidas' }, 401);
    const store = getStore({ name: 'europa2029-login-limits', consistency: 'strong' });
    const key = `tries-${clientHash(request)}`;
    const now = Date.now();
    let count = await store.get(key, { type: 'json', consistency: 'strong' }) || { attempts: 0, until: 0 };
    if (count.until > now && count.attempts >= 5) return reply({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);
    if (count.until <= now) count = { attempts: 0, until: now + 15 * 60 * 1000 };
    const target = role === 'admin' ? process.env.APP_ADMIN_PASSWORD : process.env.APP_VIEWER_PASSWORD;
    if (!safeEqual(password, target)) {
      await store.setJSON(key, { attempts: count.attempts + 1, until: count.until });
      return reply({ error: 'Senha incorreta' }, 401);
    }
    await store.setJSON(key, { attempts: 0, until: 0 });
    return reply({ ok: true, role }, 200, { 'Set-Cookie': cookieFor(request, role) });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: 'Solicitação inválida' }, 400);
    console.error('auth storage error', error?.message);
    return reply({ error: 'Não foi possível entrar agora. Tente novamente em instantes.' }, 500);
  }
};
