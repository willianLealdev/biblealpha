# BibleAlpha (app oficial) — mapa para consulta

Consultar ESTE arquivo ao revisar ou mudar qualquer coisa do app oficial (adultos), em vez de reler o projeto. O Kids tem o seu próprio arquivo: `docs/mapa-kids.md`. **Atualizar este arquivo sempre que criar ou mudar algo importante.** Atualizado em 2026-10-25.

## 1. Visão geral
App de estudo bíblico sem fins lucrativos. Repo `C:\Users\Owner\Desktop\Biblia Inteligente` (GitHub `willianLealdev/biblealpha`, branch `main`). Produção https://biblealpha.com (Easypanel).
- **API** `services/api`: FastAPI + SQLAlchemy async + Alembic (migrações até `0019`; `0016` a `0019` são do Kids). Testes `pytest` (~190, ~10 min com pgserver).
- **App** `apps/app`: Expo SDK 58, Expo Router (`src/app`), React Compiler. Web (PWA), Android, iOS e Windows (PWABuilder, Microsoft Store).
- i18n pt-BR / en / es em `src/i18n/*.ts` (3 arquivos, mesmas chaves; `TranslationKey` tipado, chave errada quebra o `tsc`).

## 2. Telas do app (`apps/app/src/app`)
- **Público:** `welcome` (página inicial, botões das lojas no array `STORES`), `sign-in`, `sign-up`, `verify-email`, `forgot-password`, `reset-password`, `legal/[doc]`, `pro`, `pair` e `screen` (tela do telão).
- **Logado, abas `(app)`:** `home` (plano em andamento, cartão "Comece sua jornada", seção Aprender, atalhos), `study`, `library`, `devotional`, `sermons` (filtro por tipo), `profile` (`password`, `sessions`, `delete-account`).
- **Bíblia `bible/`:** `books` (com o atalho da Harpa no topo), `verse`, `search`, `translations`, `note`, `quiz`, `visual` (estudo visual: ilustrações, **mapa mental** e **mapa real** dos lugares), `word/[strong]`, `info/[code]`, `learn` (**Aprender estilo Netflix**: progresso, sequência da semana, fileiras de pôsteres de planos e livros; aberto pelo cartão "Comece sua jornada" do início), `hymns` + `hymns/[n]` (**Harpa Cristã**, 640 hinos), `share-image` (**imagem do versículo** para feed/story; botão "Imagem" ao selecionar versículos no leitor).
- **Devocionais `devotionals/`:** `plans` (agrupado por categoria), `plan/[code]` (capa, progresso, "Continuar: Dia N", roteiro; "Começar" inscreve e abre o Dia 1), `read` (**leitura guiada do dia**: texto dentro do plano, ouvir, próxima leitura, "Concluir o dia" e comemoração), `done` (**parabéns** com confete e sugestões de próximos planos — `lib/journey.ts`), `new`, `history`.
- **Ministrações `sermon/`:** `[id]/index` (abre em leitura; lápis libera edição), `[id]/pulpit` (controle do telão), `[id]/present`, `[id]/versions`, `generate`.
- **Agenda `agenda/`:** lista e `[id]`. `share-screen`: compartilhar o telão.
- **Admin `admin/`:** `index` (custos de IA), `accounts/` (usuários e acessos), `offers` (preços BRL/USD), `limits` (cotas), `settings` (IA), `bibles`, `languages`, `devotionals`, `integrations`, `users/[id]` (custo de IA por usuário), `covers` (gerar as capas do Aprender com a IA de imagem; link no fim da página Aprender), `kids/` (histórias do Kids — detalhes em `docs/mapa-kids.md`).
- **Kids `kids/`:** área pública das crianças, sem login (ver `docs/mapa-kids.md`).
- Guardas de rota: `src/app/_layout.tsx` (`Stack.Protected`: web não logado → `/welcome`; app nativo → `/sign-in`; sem `redirectTo` o app caía em `/screen`).
- Outras pastas: `src/components` (`ui.tsx` é a biblioteca de botões/cartões; `account-bits.tsx`, `update-reload.*`, `tile-map.tsx` mapa de satélite/relevo/ruas por tiles da Esri sem módulo nativo, `mind-map.tsx` mapa mental em SVG, `poster.tsx` pôster estilo streaming, `gradient-bg.tsx` com id único por degradê), `src/learn/catalog.ts` (grupos de livros, frases de cada livro, cores), `src/lib` (`api.ts` cliente HTTP com timeout, `admin.ts`, `session.tsx`, `screens.ts`, `sermons.ts`, `devotional.ts`…), `src/bible` (`read-aloud.ts`, `voice-picker.tsx`), `src/sermon` (`background-library.tsx`), `src/theme`.

## 3. API (`services/api/app`)
Rotas em `api/routes/` (todas em `/api/v1`): `auth`, `me`, `bible`, `study`, `ai`, `devotional`, `sermons`, `visual`, `screens`, `agenda`, `billing`, `integrations`, `languages`, `system`, e de admin: `admin` (IA, custos, limites, preços, configurações, cortesia Pro), `admin_users` (`/admin/accounts`), `admin_bible`, `admin_devotional`; novas: `share` (`/share/verse-image` monta JPEG com Pillow em `app/share/render.py`, fontes OFL em `app/share/fonts`), `hymns` (`/hymns`, dados em `app/hymns/data/harpa_crista.json`, busca sem acento), `learn` (`/learn/covers` público; `/admin/learn/covers` gera uma capa por vez). Kids: `kids` (público) e `admin_kids` (ver `docs/mapa-kids.md`).
- Modelos em `models/` (`user`, `bible`, `study`, `ai`, `billing`, `devotional`, `sermon`, `screen`). Serviços em `services/` (`auth`, `audit`, `email`, `plans`, `settings`, `secrets`, `bible`, `sync`).
- Telão: `screens/service.py` + `routes/screens.py` (slide `{text, reference, title?}`; título sozinho = text vazio). Biblioteca de fundos: máx. 10 por pessoa (`LIBRARY_MAX`); a cota mensal conta pelo `AIUsage` (`slide_design`), não pelas linhas.
- Planos de leitura: catálogo em `devotional/catalog.py` (30, abertos a todos).
- Capas do Aprender: **geradas sozinhas** em produção/homologação (`learn/service.py::ensure_auto_covers`, disparado por `GET /learn/covers` quando falta capa; uma por vez, trava `pg_try_advisory_lock`, pausa 30 min se der erro; nunca no computador local nem nos testes). Plano novo no catálogo ganha capa automaticamente. Qualidade `high`, 1024x1536; planos pedem "uma única cena" (sem mosaico). Cenas por livro em `learn/catalog.py`; guardadas na tabela `visual_images` com `book = "LRN"` e a chave no começo do prompt (`[book:GEN] ...`) — sem tabela nova, para não disputar número de migração com o Kids. Custo vai para `AIUsage` (`learn_cover`).
- Mapa mental: campo `mind_map` no conteúdo do estudo visual (`visual/service.py`, `MIND_MAP_SCHEMA`); estudos antigos ganham o mapa por `POST /visual/{book}/{chapter}/mind-map` (uma vez por idioma; `AIUsage` `mind_map`).
- Sequência de dias (`devotional/service.py::streak`): conta devocionais concluídos **e** dias de plano concluídos (`PlanDayDone.done_at`). `progress` da inscrição vem em **porcentagem (0–100)**.
- Harpa Cristã: fonte GitHub `DanielLiberato/Harpa-Crista-JSON-640-Hinos-Completa` (sem licença declarada; o dono considera domínio público).
- Preços: `PlanPrice` por moeda; Brasil paga BRL, resto USD.
- **Imagens geradas por IA: sempre qualidade média** (decisão do dono, 2026-10-25): fixo no código em `visual/service.py`, `screens/service.py` e `learn/service.py` (custa 1/4 da alta e no app fica igual). Toda imagem nova do sistema segue isso.
- Regras de produto: IA que escreve conteúdo é só admin; usuário comum só pergunta. Admin sem limites. Ofertante (Stripe) tem limites maiores, não infinitos.

## 4. Login, sessões e segurança
- `services/auth.py`: web = cookie de sessão + 24 h deslizantes (`web_session_hours`); app com "confiar neste dispositivo" = 365 dias deslizantes (`AuthSession.trusted`, `device_name`).
- Limite de tentativas em `core/ratelimit.py` (Redis ou memória): login 10 por e-mail / 30 por IP em 15 min (`peek`/`clear` usados pelo admin).
- Bloqueio de conta: `User.blocked_at` barra login, refresh e token. "Online" = `AuthSession.last_used_at` dentro de 5 min (atualizado em `api/deps.py::_touch`, 1x/min).
- Painel de usuários: `/admin/accounts` (resumo, lista com filtros, relatório, bloquear/desbloquear, liberar tentativas, senha por e-mail ou temporária, encerrar sessões).

## 5. Rodar e testar localmente
- `.claude/launch.json`: `api` (porta 8000, Postgres pgserver em `127.0.0.1:50606`, dados em `%LOCALAPPDATA%\Temp\claude\ba-pgdev`) e `app-web` (porta 8081). Reiniciar a API após mudar código Python (sem reload). Se o Postgres local não estiver de pé: `services/api/.venv/Lib/site-packages/pgserver/pginstall/bin/postgres.exe -D <dados> -h 127.0.0.1 -p 50606` (apagar `postmaster.pid` velho).
- Conta de teste: `.claude/dev-test-account.txt` (não imprimir a senha). Promover a admin só no banco local.
- Migrações locais: `BA_DATABASE_URL=postgresql+asyncpg://postgres:@127.0.0.1:50606/postgres BA_REDIS_URL= .venv/Scripts/python -m alembic upgrade head`.
- Checagens: API `ruff check app tests alembic`, `ruff format --check app tests alembic` (usar `.venv/Scripts/python -m ruff`), `alembic check`, `pytest`. App `npx tsc --noEmit`, `npx expo lint` (2 avisos antigos são normais).
- Duas conversas na mesma pasta: usar `api-estudos` (porta 8010) e `app-web-estudos` (porta 8082) do `launch.json` para não derrubar os servidores da outra. O banco de testes (`biblealpha-pgtest`) é um só: para não colidir, rodar com `BA_TEST_DATABASE_URL=postgresql+asyncpg://postgres:@127.0.0.1:61992/biblealpha_test_estudos` (banco próprio no mesmo servidor de testes).
- Capturas: scripts puppeteer em `scratchpad/shots` com o Chrome local. **Testar também no WebKit** (Playwright, `devices['iPad Pro 11']`): a Apple abre o site no Safari.

## 6. Publicar
- **Site e API (Easypanel):** o dono clica Implantar, **api primeiro, web depois**. A api roda `alembic upgrade head` ao subir. Cada implantação derruba o site por alguns minutos. Não mexer no token global do GitHub do Easypanel.
- **Atualização automática dos apps (sozinha, desde 25/10/2026):** `.github/workflows/ota.yml` roda de 10 em 10 minutos. Compara a impressão digital do código (`node scripts/build-id.js`) com `https://biblealpha.com/version.json` (gravado no build do site). Quando o site no ar já tem o código do GitHub e ele ainda não foi mandado, publica o EAS Update nos **dois apps** (BibleAlpha e BibleAlpha Kids). Ou seja: implantou o site no Easypanel, em até ~10 min os apps recebem. Precisa do segredo `EXPO_TOKEN` no GitHub. Mudança nativa (módulo novo) continua exigindo build de loja e versão nova.
- Dois apps no mesmo código: `app.config.js` (`APP_VARIANT=kids` = BibleAlpha Kids; ver `docs/mapa-kids.md` Etapa 7). Sem a variável, o app oficial fica exatamente como o `app.json`.
- **Atualização manual (se precisar)**, em `apps/app` (para o Kids, com `APP_VARIANT=kids` na frente):
  `EXPO_PUBLIC_API_URL=https://biblealpha.com EXPO_PUBLIC_APP_URL=https://biblealpha.com npx eas-cli@latest update --channel production --environment production --message "..." --non-interactive`
  (`--environment` é obrigatório; sem as variáveis o bundle pode apontar para localhost). Só alcança builds com a mesma versão (runtimeVersion = versão do app; hoje **1.0.1**). Mudança nativa ou versão nova exige build de loja.
- **Pendente de build de loja:** `expo-image-picker` (foto própria na imagem do versículo) foi adicionado; nos apps 1.0.1 a tela avisa para atualizar e usa só os fundos prontos. Próximo build: subir para 1.0.2.
- **Build de loja:** `eas build -p ios --profile production --non-interactive --no-wait --auto-submit` e `-p android` (gera AAB). Subir `version` no `app.json` quando mudar algo nativo. AABs em `C:\Users\Owner\Desktop\BibleAlpha-lojas\3-Android`.
- **Lojas (liberadas):** Apple app id `6824735409` (bundle `com.biblealpha.app`, versão 1.0.1 build 4); Google Play `com.biblealpha.app` (conta NEWCERT HOLDING LLC); Microsoft Store `9N2MHL1R6ZQP`. Contato: `contato@biblealpha.com`.
  Links: App Store `https://apps.apple.com/app/id6824735409` · Play `https://play.google.com/store/apps/details?id=com.biblealpha.app` · Microsoft `https://apps.microsoft.com/detail/9N2MHL1R6ZQP`.
- CI do GitHub: job `api` (ruff, alembic check, pytest) e `app` (tsc, testes, build web). Corrigir antes de seguir se ficar vermelho.
- Docs de apoio: `docs/02-deploy-easypanel.md`, `docs/04-checklist-deploy.md`, `docs/05-lojas.md`.

## 7. Regras de trabalho com o dono
- Responder em português do Brasil, palavras simples, um passo de cada vez; ele odeia demora e repetição. Não programa; testa no iPhone, Android e iPad.
- **Commit e push só com o OK dele.** Não criar contas em produção, não digitar senha por ele, não aceitar termos por ele. `chaves.txt` nunca vai ao git. API sem domínio público (Cloudflare nuvem cinza).

## 8. Armadilhas já vividas
- Heredoc do shell estraga barras e aspas: para scripts com regex, escrever o `.py` com a ferramenta Write e rodar.
- Chaves de i18n inseridas por busca de texto podem cair em bloco aninhado de mesmo nome: procurar `\n  bloco: {\n` (2 espaços).
- Expo web dev leva minutos para subir; capturas falham enquanto o servidor ainda está "starting". O painel do navegador do Claude pode ficar preto: usar o puppeteer.
- Rotas tipadas do Expo (`router.push('/admin/...')`) só aceitam rotas novas depois que o servidor `app-web` rodou e regenerou os tipos.
- App nativo caía na tela do telão sem `redirectTo` no `Stack.Protected`; site travava no Safari por causa de `useFonts` (hoje tem timer de 4 s e `timeoutMs` no `api.send`).
- `eas update` sem `--environment` falha; publicar OTA com a árvore suja marca o commit com `*`.
