import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, sanitizeData, safeEqual, environmentIsReady, cookieFor, userFromRequest } from '../netlify/lib/shared.mjs';

test('o backup vazio é válido e pode ser salvo', () => {
  assert.deepEqual(sanitizeData(emptyData()), emptyData());
});
test('marcações e câmbio são validados', () => {
  const input = emptyData();
  input.daily['2026-11-24'] = { p1: 30, p2: 65 };
  input.exchanges['1'] = {p1:{done:true,brl:1127,eur:156},p2:{done:false,brl:0,eur:0}};
  assert.deepEqual(sanitizeData(input).daily['2026-11-24'], {p1:30,p2:65});
});
test('datas fora do plano são recusadas', () => {
  const v = emptyData(); v.daily['2029-09-01']={p1:30,p2:0};
  assert.throws(()=>sanitizeData(v));
});
test('quantias negativas não são aceitas', () => {
  const v = emptyData(); v.daily['2027-01-01']={p1:-30,p2:0};
  assert.throws(()=>sanitizeData(v));
});
test('credenciais e cookie HTTP-only assinado', () => {
  process.env.APP_ADMIN_PASSWORD='long-admin-123456';
  process.env.APP_VIEWER_PASSWORD='long-viewer-123456';
  process.env.APP_SESSION_SECRET='a'.repeat(64);
  assert.equal(environmentIsReady(), true);
  assert.equal(safeEqual('a', 'a'), true);
  assert.equal(safeEqual('a', 'b'), false);
  const request=new Request('https://exemplo.netlify.app/.netlify/functions/auth');
  const cookie=cookieFor(request,'viewer');
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/Secure/);
  const withCookie=new Request(request.url,{headers:{cookie:cookie.split(';')[0]}});
  assert.equal(userFromRequest(withCookie)?.role,'viewer');
  const forged=new Request(request.url,{headers:{cookie:cookie.split(';')[0]+'x'}});
  assert.equal(userFromRequest(forged),null);
});
