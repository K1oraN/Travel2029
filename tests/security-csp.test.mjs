import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { environmentProblems, environmentIsReady } from '../netlify/lib/shared.mjs';
const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
test('HTML publicado não contém estilos embutidos ou scripts inline', () => {
  assert.doesNotMatch(page, /\sstyle\s*=/i);
  assert.doesNotMatch(page, /<(?:style)(?:\s|>)/i);
  assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>/i);
});
test('progresso utiliza classes CSS externas, não style setters', () => {
  assert.doesNotMatch(script, /\.style\./);
  assert.match(stylesheet, /\.progress-100\s*\{/);
  assert.match(script, /classList\.add\(progressClass\)/);
});
test('configuração detecta senha inválida ou segredo ausente sem divulgar conteúdo', () => {
  const backup={};
  for(const key of ['APP_ADMIN_PASSWORD','APP_VIEWER_PASSWORD','APP_SESSION_SECRET']) backup[key]=process.env[key];
  try {
    process.env.APP_ADMIN_PASSWORD='145896';
    process.env.APP_VIEWER_PASSWORD='369741';
    delete process.env.APP_SESSION_SECRET;
    assert.equal(environmentIsReady(),false);
    assert.ok(environmentProblems().some(x=>x.includes('APP_SESSION_SECRET')));
    process.env.APP_SESSION_SECRET='z'.repeat(80);
    assert.equal(environmentIsReady(),true);
    process.env.APP_VIEWER_PASSWORD='145896';
    assert.ok(environmentProblems().some(x=>x.includes('diferentes')));
  } finally {
    for(const [key,value] of Object.entries(backup)) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});
