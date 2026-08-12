// Checagem rápida do app.html antes de publicar.
const fs = require('fs');

const html = fs.readFileSync('app.html', 'utf8');
let falhas = 0;

// 1) todo bloco <script> inline precisa compilar
const re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
let m, i = 0;
while ((m = re.exec(html))) {
  i++;
  try {
    new Function(m[1]);
  } catch (e) {
    falhas++;
    console.log(`ERRO de sintaxe no script #${i}: ${e.message}`);
  }
}
console.log(`blocos JS compilados: ${i}`);

// 2) invariantes que já quebraram antes
const conta = (padrao) => (html.match(padrao) || []).length;

const checagens = [
  ['chamadas de IA pelo helper',      conta(/fetch\(enderecoIA\(\)/g), (n) => n === 4],
  ['referência direta à Groq',        conta(/api\.groq\.com\/openai/g), (n) => n === 1],
  ['variável apiKey órfã',            conta(/Bearer \$\{apiKey\}/g),    (n) => n === 0],
  ['planilha fixa de um usuário',     conta(/1d7hKonJa52AeImRCGnbfQ/g), (n) => n === 0],
  ['ids duplicados (planilha-url)',   conta(/id="planilha-url"/g),      (n) => n === 1],
  ['ids duplicados (gs-url)',         conta(/id="gs-url"/g),            (n) => n === 1],
];

for (const [nome, valor, ok] of checagens) {
  const passou = ok(valor);
  if (!passou) falhas++;
  console.log(`${passou ? 'ok  ' : 'FALHA'} ${nome}: ${valor}`);
}

process.exit(falhas ? 1 : 0);
