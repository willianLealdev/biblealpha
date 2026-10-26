// "Impressão digital" do código dos apps: muda quando muda qualquer coisa que vai para o celular.
// - No build do site (Easypanel): grava dist/version.json  ->  node scripts/build-id.js dist/version.json
// - Na publicação automática (GitHub): compara com https://biblealpha.com/version.json para saber
//   se o site no ar já tem este código; só então manda a atualização para os apps.
// Quebras de linha são igualadas, para dar o mesmo resultado no Windows e no Linux.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const PARTS = ['src', 'assets', 'app.json', 'app.config.js', 'package-lock.json'];
const TEXT = /\.(tsx?|jsx?|json|md|txt|svg|css)$/i;

function files(rel) {
  const full = path.join(APP, rel);
  if (!fs.existsSync(full)) return [];
  if (!fs.statSync(full).isDirectory()) return [rel];
  return fs
    .readdirSync(full)
    .flatMap((name) => files(path.join(rel, name)));
}

const hash = crypto.createHash('sha256');
for (const rel of PARTS.flatMap(files).map((f) => f.replace(/\\/g, '/')).sort()) {
  let data = fs.readFileSync(path.join(APP, rel));
  if (TEXT.test(rel)) data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
  hash.update(rel).update('\0').update(data).update('\0');
}
const id = hash.digest('hex').slice(0, 16);

const out = process.argv[2];
if (out) fs.writeFileSync(path.join(APP, out), JSON.stringify({ build: id }) + '\n');
console.log(id);
