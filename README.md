# BibleAlpha — AI Bible Study

*Discover the Depth of God's Word.*

Plataforma de estudo bíblico com IA: leitura, estudo com fontes, devocionais, ministrações e modo púlpito, para Android, iOS, PWA e web, com uma única conta.

- Visão, arquitetura e fases: [docs/01-revisao-tecnica.md](docs/01-revisao-tecnica.md)
- Deploy: [docs/02-deploy-easypanel.md](docs/02-deploy-easypanel.md) · checklist da manhã do deploy: [docs/04-checklist-deploy.md](docs/04-checklist-deploy.md)
- Marca e ícones: [assets/brand/README.md](assets/brand/README.md)

## Estado atual — Fases 1 a 7

| Parte | Situação |
|---|---|
| API: cadastro, confirmação de e-mail, login, refresh com rotação e detecção de reuso, logout, sessões revogáveis, recuperação e troca de senha, perfil, preferências, exportação e exclusão de conta (LGPD), papéis (RBAC), auditoria, limite de tentativas | ✅ com 23 testes automatizados em PostgreSQL real |
| App (Expo): tema escuro/claro/sistema, português/inglês, 6 abas, telas de conta e perfil | ✅ testado no navegador; 10 testes unitários |
| PWA: manifesto, ícones, service worker (abre offline) | ✅ build gerado; instalação ainda não testada num celular |
| Docker, Nginx, CI no GitHub Actions | ✅ arquivos prontos; **ainda não executados** (sem Docker nesta máquina e repositório ainda não enviado) |
| Deploy no Easypanel | ⏳ aguardando repositório no GitHub |
| **Fase 2 — Bíblia**: BLIVRE (português) e WEB (inglês) importadas com licença e hash conferidos; leitor com navegação, tamanho de fonte e espaçamento; busca por palavra/frase (sem acentos) e por referência; destaques com categorias configuráveis, favoritos e anotações com etiquetas; biblioteca; leitura offline; sincronização entre aparelhos com resolução de conflitos | ✅ 82 testes no backend, 54 no app; testado no navegador, inclusive sem internet |
| **Fases 3, 3b e 4** — IA com fontes e streaming, cotas, alertas de orçamento e painel de custos (só admin); planos Free/Pro com preços versionados; devocional diário e pessoal, sequência e 11 planos de leitura | ✅ feitas; pagamentos pelo **Stripe** (checkout, portal e webhook); IA real depende da chave da Anthropic, cadastrada no painel |
| **Idiomas, Bíblias e integrações** — app em português, inglês e espanhol; Bíblia padrão por idioma (BLIVRE, WEB, Reina-Valera 1909); painel importa todo o catálogo do eBible.org (≈1.300 Bíblias e Novos Testamentos em mais de mil idiomas, em lote e retomável) e adiciona idiomas traduzidos pela IA, tudo sem atualizar o app; chaves (Anthropic, OpenAI, Resend, Stripe) cadastradas e criptografadas pelo painel | ✅ |
| **Devocional do dia** — 366 passagens em 28 temas: uma por dia, sem repetir no ano, em ordem diferente a cada ano; o admin vê a agenda, troca a passagem, gera com IA (1 ou 3 idiomas) ou escreve e publica para todos; gerar devocional personalizado com IA é só do admin | ✅ |
| **Idiomas do mundo e custos de IA** — cadastro com país e as línguas oficiais dele; 135 idiomas com busca (app traduzido automaticamente na primeira escolha); devocional escrito pelo Claude em português e traduzido pela DeepSeek para o idioma de cada usuário; no painel, cada tarefa escolhe Claude ou DeepSeek | ✅ |
| **Fase 5 — Ministrações**: lista, pastas e lixeira; modelos por tipo; geração com IA; editor em blocos (seção, texto, texto bíblico, nota pessoal) com mover, excluir, desfazer/refazer e detalhes (tema, textos, tipo, objetivo, público, evento, data, duração, pasta, etiquetas); salvamento automático com controle de versão — se a ministração mudou em outro aparelho, as alterações locais viram uma cópia; rascunho no aparelho para editar sem internet; **inserção de versículos citados no texto só quando o usuário toca** ("Inserir texto bíblico? Jo 3:16"); assistente de IA por bloco com prévia (inserir abaixo, substituir, descartar); histórico de versões com restauração; modo púlpito (Completo/Esboço/Memorização/Púlpito, tamanho do texto, cronômetro com tempo restante, navegação por seções, tela acesa, notas rápidas, offline, volta à posição de leitura); exportação PDF e DOCX | ✅ backend com testes; app testado no navegador (inclusive conflito entre aparelhos, edição sem internet e tela de celular). PDF no celular usa o `expo-print` — **ainda não testado num aparelho** |
| **Ofertas (sem fins lucrativos)** — não há plano à venda: o "Ofertante" (código interno `pro`) contribui todo mês pelo Stripe (valor definido e versionado no painel; libera a IA sem limite) e qualquer pessoa pode dar uma **oferta avulsa** de qualquer valor (R$ 5–10.000 / US$ 1–2.000) pela tela "Seja um ofertante"; o painel mostra as ofertas do mês | ✅ com testes (Stripe simulado) e tela testada no navegador; pagamento real depende das chaves do Stripe e do webhook |
| **Catálogo do eBible.org importado (banco de desenvolvimento)** — 1.283 de 1.284 traduções (a única falha, `ropk`, é um arquivo que não existe no próprio eBible.org); ~12 GB. **753 têm licença não comercial (CC BY-NC / BY-NC-ND)** e estão ativas: decisão pendente se ficam ativas num app que recebe ofertas | ⚠️ decisão do responsável |
| Estudo visual do capítulo ([docs/03-estudo-visual.md](docs/03-estudo-visual.md)) | ⏳ especificado; ainda não implementado |
| **Fase 6 — Estudo avançado**: hebraico/aramaico e grego palavra por palavra (447 mil palavras, STEPBible/Tyndale House, CC BY 4.0) com o significado no idioma do usuário; léxico Strong (22,7 mil verbetes) traduzido sob demanda; 341 mil referências cruzadas (OpenBible.info); comparador de até 8 traduções | ✅ |
| **Fase 7 — Avançados**: estudo visual do capítulo (Claude + ilustrações gpt-image-2, mapa com 1.309 lugares do OpenBible.info, linha do tempo, personagens, ligações com o AT e profecias, tudo com fontes; cota Free/Pro, cache para todos); ouvir o capítulo (voz do aparelho); ministração por voz (ditado); professor com IA (perguntas de compreensão); slides da ministração (modo Apresentar e PowerPoint) | ✅ fotos reais de sítios arqueológicos e pôster para exportar ficaram para depois |
| Login com Google/Apple, 2FA | Previsto; ainda não implementado |
| Termos de Uso e Política de Privacidade | Páginas com aviso de rascunho; **texto definitivo depende de revisão jurídica** |

## Estrutura

```
apps/app/          App Expo (Android, iOS, PWA/web) — Expo Router, TypeScript
services/api/      API FastAPI + SQLAlchemy + Alembic (o worker Celery usa o mesmo código)
assets/brand/      Logo original e ícones gerados
tools/brand/       Gerador dos ícones a partir do logo
docs/              Revisão técnica e guia de deploy
docker-compose.yml Ambiente completo local (Postgres+pgvector, Redis, MinIO, API, worker, web)
```

## Rodar localmente

### Importar as Bíblias

```bash
cd services/api
.venv/Scripts/python -m app.bible.importer blivre web
```

Os textos ficam em `services/api/data/bible/<código>/` com `manifest.json` (origem, edição, licença, hash). A importação recusa arquivos alterados ou com contagem de livros/capítulos diferente. No Docker a importação roda sozinha ao subir a API.

### API (sem Docker, com PostgreSQL embutido)

```bash
cd services/api
py -m venv .venv
.venv/Scripts/pip install -e ".[dev]"
.venv/Scripts/python -m pytest            # sobe um PostgreSQL temporário e roda os testes
```

Para usar a API no dia a dia, aponte `BA_DATABASE_URL` para um PostgreSQL (o do `docker compose` ou outro), rode `alembic upgrade head` e:

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Em desenvolvimento os e-mails não são enviados: o link de confirmação aparece no log da API.

### App

```bash
cd apps/app
npm install
cp .env.example .env.development.local    # aponta para a API em localhost:8000
npx expo start --web                       # navegador
npx expo start                             # celular com Expo Go / development build
npm run typecheck && npm run lint && npm test
```

### Tudo com Docker

```bash
cp .env.example .env
docker compose up --build
```

App em http://localhost:8080, API em http://localhost:8000/api/docs.
