import { getStore } from '@netlify/blobs';
import { reply, environmentIsReady, sameOrigin, userFromRequest, emptyData, sanitizeData, limitedJSON } from '../lib/shared.mjs';

export default async (request) => {
  if (!environmentIsReady()) return reply({ error: 'Configure as três variáveis de segurança na Netlify antes de usar o site.' }, 503);
  const user = userFromRequest(request);
  if (!user) return reply({ error: 'Faça login para visualizar o progresso.' }, 401);
  if (!['GET', 'PUT'].includes(request.method)) return reply({ error: 'Método não permitido' }, 405, { Allow: 'GET, PUT' });
  if (request.method === 'PUT' && (user.role !== 'admin' || !sameOrigin(request))) return reply({ error: 'Apenas o administrador pode alterar o plano.' }, 403);
  try {
    const store = getStore({ name: 'europa2029-progress', consistency: 'strong' });
    const entry = await store.getWithMetadata('savings', { type: 'json', consistency: 'strong' });
    if (request.method === 'GET') return reply({ data: entry?.data || emptyData(), etag: entry?.etag || null, role: user.role });

    const input = await limitedJSON(request);
    if (!input || !('etag' in input) || !input.data) return reply({ error: 'Envie o JSON do plano e a versão de sincronização.' }, 400);
    if (input.etag !== (entry?.etag || null)) return reply({ error: 'O plano mudou em outro dispositivo. Atualize a página antes de salvar.' }, 409);
    const clean = sanitizeData(input.data);
    clean.updatedAt = new Date().toISOString();
    const result = await store.setJSON('savings', clean, entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (!result.modified) return reply({ error: 'Conflito de sincronização; alguém salvou outra versão.' }, 409);
    return reply({ ok: true, data: clean, etag: result.etag });
  } catch (error) {
    if (error instanceof SyntaxError || error?.message?.includes('inválid') || error?.message?.includes('incompatível') || error?.message?.includes('demais') || error?.message?.includes('grande') || error?.message?.includes('mais dias')) return reply({ error: error.message || 'JSON inválido' }, 400);
    console.error('progress storage error', error?.message);
    return reply({ error: 'Falha ao acessar o banco de dados. Consulte as Functions da Netlify.' }, 500);
  }
};
