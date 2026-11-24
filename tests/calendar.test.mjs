import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../public/plano.json', import.meta.url), 'utf8'));
const DAY = 86400000;
const from = Date.parse(`${config.inicio}T00:00:00Z`);
const to = Date.parse(`${config.fim}T00:00:00Z`);
test('o calendário tem 1012 dias e 145 semanas, sendo a última de 4 dias',()=>{
  assert.equal((to-from)/DAY+1,1012);
  assert.equal(Math.ceil(1012/7),145);
  assert.equal(1012%7,4);
});
test('vinte trocas de sete semanas, mais 32 dias no fechamento',()=>{
  assert.equal(20*49+32,1012);
  assert.equal(new Date(from+48*DAY).toISOString().slice(0,10),'2027-01-11');
  assert.equal(new Date(from+979*DAY).toISOString().slice(0,10),'2029-07-30');
});
test('metas batem com o PDF',()=>{
  assert.equal(config.metaDiariaPorPessoaBRL*config.dias*2,60720);
  assert.equal(config.destinoDiarioEurosBRL*49,1127);
  assert.equal(config.metaTotalEuropaPorPessoaEUR,3219.20);
  assert.equal(config.metaTotalCasalBRL,58068.80);
});
