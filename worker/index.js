/**
 * Intermediário da Groq para o EasyProfessor.
 *
 * O site é estático e público: a chave da Groq não pode ficar nele.
 * Este Worker guarda a chave, confere se quem pediu está de fato
 * logado no Firebase e aplica uma cota diária por pessoa.
 *
 * Variáveis (painel do Cloudflare → Settings → Variables):
 *   GROQ_API_KEY   segredo — a chave da sua conta Groq
 *   PROJETO_FIREBASE   easyprofessor-c9a61
 *   ORIGENS_LIBERADAS  https://easyprofessor.com.br,https://www.easyprofessor.com.br
 *
 * Ligação KV (Settings → Bindings), usada para a cota:
 *   COTAS
 */

const LIMITE_DIARIO = 40;          // pedidos por usuário por dia
const MODELOS_ACEITOS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]);

export default {
  async fetch(pedido, env) {
    const origem = pedido.headers.get('Origin') || '';
    const liberadas = (env.ORIGENS_LIBERADAS || '').split(',').map(s => s.trim());
    const cabecalhos = cabecalhosCors(origem, liberadas);

    if (pedido.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cabecalhos });
    }
    if (pedido.method !== 'POST') {
      return erro(405, 'Método não permitido', cabecalhos);
    }
    if (!liberadas.includes(origem)) {
      return erro(403, 'Origem não autorizada', cabecalhos);
    }

    // ── Quem está pedindo? ──────────────────────────────────────
    const auth = pedido.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return erro(401, 'Faça login para usar as sugestões', cabecalhos);

    let usuario;
    try {
      usuario = await verificarTokenFirebase(token, env.PROJETO_FIREBASE);
    } catch (e) {
      return erro(401, 'Sessão inválida ou expirada', cabecalhos);
    }

    // ── Cota diária ─────────────────────────────────────────────
    const hoje = new Date().toISOString().slice(0, 10);
    const chave = `cota:${hoje}:${usuario.uid}`;
    const usados = parseInt(await env.COTAS.get(chave) || '0', 10);
    if (usados >= LIMITE_DIARIO) {
      return erro(429,
        `Você atingiu o limite de ${LIMITE_DIARIO} sugestões por dia. ` +
        `O contador zera amanhã.`, cabecalhos);
    }

    // ── Repassa para a Groq ─────────────────────────────────────
    let corpo;
    try {
      corpo = await pedido.json();
    } catch {
      return erro(400, 'Pedido malformado', cabecalhos);
    }

    if (!MODELOS_ACEITOS.has(corpo.model)) {
      return erro(400, 'Modelo não permitido', cabecalhos);
    }
    // Teto de tamanho, para um pedido gigante não consumir a conta.
    corpo.max_tokens = Math.min(corpo.max_tokens || 1024, 2048);
    corpo.stream = false;

    const resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
    });

    // Só consome cota quando a Groq de fato respondeu.
    if (resposta.ok) {
      await env.COTAS.put(chave, String(usados + 1), { expirationTtl: 60 * 60 * 48 });
    }

    const texto = await resposta.text();
    return new Response(texto, {
      status: resposta.status,
      headers: { ...cabecalhos, 'Content-Type': 'application/json' },
    });
  },
};

/* ── Verificação do token do Firebase ──────────────────────────
   Confere a assinatura RS256 contra as chaves públicas do Google,
   além de emissor, público-alvo e validade. Sem isso qualquer um
   chamaria o Worker e gastaria a sua conta da Groq.             */
async function verificarTokenFirebase(token, projeto) {
  const [cabecalhoB64, cargaB64, assinaturaB64] = token.split('.');
  if (!cabecalhoB64 || !cargaB64 || !assinaturaB64) throw new Error('formato inválido');

  const cabecalho = JSON.parse(textoDeBase64Url(cabecalhoB64));
  const carga = JSON.parse(textoDeBase64Url(cargaB64));

  const agora = Math.floor(Date.now() / 1000);
  if (carga.aud !== projeto) throw new Error('público-alvo incorreto');
  if (carga.iss !== `https://securetoken.google.com/${projeto}`) throw new Error('emissor incorreto');
  if (carga.exp <= agora) throw new Error('token expirado');
  if (!carga.sub) throw new Error('sem identificador');

  // Formato JWK: o navegador importa direto, sem precisar decifrar
  // a estrutura DER do certificado X.509.
  const jwks = await (await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    { cf: { cacheTtl: 3600, cacheEverything: true } }
  )).json();

  const jwk = (jwks.keys || []).find(k => k.kid === cabecalho.kid);
  if (!jwk) throw new Error('chave desconhecida');

  const chave = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );

  const valida = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', chave,
    bytesDeBase64Url(assinaturaB64),
    new TextEncoder().encode(`${cabecalhoB64}.${cargaB64}`)
  );
  if (!valida) throw new Error('assinatura inválida');

  return { uid: carga.sub, email: carga.email };
}

/* ── Utilidades ─────────────────────────────────────────────── */

function cabecalhosCors(origem, liberadas) {
  return {
    'Access-Control-Allow-Origin': liberadas.includes(origem) ? origem : liberadas[0] || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function erro(status, mensagem, cabecalhos) {
  return new Response(JSON.stringify({ error: { message: mensagem } }), {
    status,
    headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  });
}

function bytesDeBase64Url(txt) {
  const b64 = txt.replace(/-/g, '+').replace(/_/g, '/')
                 .padEnd(txt.length + (4 - txt.length % 4) % 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function textoDeBase64Url(txt) {
  return new TextDecoder().decode(bytesDeBase64Url(txt));
}
