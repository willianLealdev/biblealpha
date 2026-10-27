// Depois do `expo export`: cria dist/kids.html, a mesma página do site, mas com o manifesto
// e o ícone do BibleAlpha Kids. O nginx entrega essa página em /kids, e é por ela que o
// PWABuilder monta o app Kids da Microsoft Store.

const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const swaps = [
  ['href="/manifest.json"', 'href="/kids-manifest.json"'],
  ['<link rel="apple-touch-icon" href="/apple-touch-icon.png" />', '<link rel="apple-touch-icon" href="/kids-apple-touch-icon.png" /><link rel="icon" type="image/png" href="/kids-favicon.png" />'],
  ['content="BibleAlpha"', 'content="BibleAlpha Kids"'],
  ['content="#0A0806"', 'content="#FFF7E8"'],
];
let kids = html;
for (const [from, to] of swaps) {
  if (!kids.includes(from)) throw new Error(`kids-web: não achei ${from} no index.html`);
  kids = kids.replace(from, to);
}
fs.writeFileSync(path.join(dist, 'kids.html'), kids);
console.log('dist/kids.html criado.');
