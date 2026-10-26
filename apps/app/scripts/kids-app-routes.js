// App BibleAlpha Kids: cria em src/kids-app/kids uma "ponte" para cada tela de src/app/kids.
// Assim o app Kids usa exatamente as mesmas telas do site /kids, sem cópia de código.
// Rodar depois de criar ou apagar uma tela do Kids:  node scripts/kids-app-routes.js
// Conferir sem mudar nada (usado na publicação automática):  node scripts/kids-app-routes.js --check

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const FROM = path.join(ROOT, 'app', 'kids');
const TO = path.join(ROOT, 'kids-app', 'kids');
const HEADER = '// Gerado por scripts/kids-app-routes.js (não editar): a tela é a mesma do site /kids.\n';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const wanted = new Map();
for (const file of walk(FROM)) {
  const rel = path.relative(FROM, file);
  const target = `@/app/kids/${rel.replace(/\\/g, '/').replace(/\.tsx?$/, '')}`;
  wanted.set(path.join(TO, rel), `${HEADER}export { default } from '${target}';\n`);
}
const existing = fs.existsSync(TO) ? walk(TO) : [];

const check = process.argv.includes('--check');
const problems = [];
for (const [file, content] of wanted) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (now === content) continue;
  problems.push(`${now === null ? 'falta' : 'diferente'}: ${path.relative(ROOT, file)}`);
  if (!check) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}
for (const file of existing) {
  if (wanted.has(file)) continue;
  problems.push(`sobrando: ${path.relative(ROOT, file)}`);
  if (!check) fs.unlinkSync(file);
}

if (check && problems.length) {
  console.error(`As telas do app Kids estão desatualizadas. Rode: node scripts/kids-app-routes.js\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(problems.length ? `Atualizadas: ${problems.length}` : 'Telas do app Kids em dia.');
