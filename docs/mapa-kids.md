# BibleAlpha Kids — mapa e plano (consultar ESTE arquivo ao mexer no Kids)

Decisões do dono do projeto (24/10/2026). Este arquivo é a fonte da verdade do Kids: ler antes de começar e **atualizar a cada etapa concluída** (seção "Estado atual" e "Onde fica cada coisa").
O app oficial (adultos) tem o seu próprio arquivo: `docs/mapa-app-oficial.md`. Não misturar os dois.

## Estado atual
- **Etapas 1, 3 e 4 construídas e testadas localmente (24/10/2026)**, ainda **sem commit e sem publicar** (esperando o OK do dono). Funcionam: Histórias (com voz), Quiz, Jogo da memória, Versículos (com jogo de completar), Bíblia para os Grandes, estrelas e área dos pais.
- Conteúdo pronto: 15 histórias clássicas escritas pela IA, com quiz (`services/api/app/kids/starter_stories.json`), e 30 versículos sugeridos (`app/kids/catalog.py`). No site de verdade o dono importa tudo pelo painel (botões "Importar histórias prontas" e "Adicionar os 30 versículos sugeridos"), revisa e publica.
- **Jogos e Jornada Bíblica (25/10/2026):** aba Jogos (`/kids/games`) com 13 jogos: Criação (7 dias), Arca de Noé, 10 Mandamentos, Davi e Golias (mira + perguntas para ganhar pedras), Daniel na cova, Jornada de Jonas (ordenar), Encontre a Ovelhinha (pistas), Quem Sou Eu (15 personagens), Monte o Versículo (usa os versículos publicados), Caça-palavras (4 temas), Quebra-cabeça (ilustrações da Ovelhinha em `assets/kids/puzzle-*.webp`), Colorindo a Bíblia (4 desenhos em SVG, salvos no aparelho) e o Jogo da Memória. Todo jogo termina com o ensinamento e a passagem, tem botão Ouvir e muda de dificuldade em Pequenos/Grandes. **Jornada Bíblica:** pontos (XP), nível (a cada 100 pontos), estrelas e 6 conquistas, tudo só no aparelho; a área dos pais mostra o que a criança fez. Textos dos jogos em `kids/game-content.ts` (pt/en/es), entram no dicionário do Kids e são traduzidos para os outros idiomas como o resto.
- **Vídeos enviados pelo dono (25/10/2026):** painel `/admin/kids/videos` (só no navegador do computador): escolher MP4 (até 600 MB) e capa opcional, título, descrição, idioma da narração e nível; o envio vai em **pedaços de 4 MB** (o nginx do site aceita 10 MB e a API 8 MB por envio; não foi preciso mexer no Easypanel), com 3 tentativas por pedaço e renovação do login no meio. Entra como rascunho; Publicar libera em `/kids/videos`. Guardado no banco (`kids_videos` + `kids_video_chunks`, migração `0019`); a API entrega por partes (`Range`/206, exigido pelo Safari do iPhone) em `GET /kids/videos/{id}/file`, capa em `/poster`. Outro idioma sem vídeos próprios mostra os em português. Nos apps nativos o player chega na Etapa 7 (hoje mostra aviso). **Atenção:** vídeos ocupam espaço no banco e nos backups do servidor.
- Vídeo de exemplo gerado localmente (25/10/2026): "A Ovelhinha Perdida", 5 ilustrações gpt-image-2 (estilo livro infantil), zoom suave, legenda e voz "Maria" do Windows (o dono achou a voz ruim; melhorar depois). Gerar vídeos automaticamente no servidor (Etapa 5) continua para depois.
- Faltam: **ilustrações** nas páginas das histórias (Etapa 2) e geração automática de vídeo (Etapa 5).
- A voz é a do próprio aparelho (`expo-speech`), de graça e sem internet.
- **Idiomas (igual ao BibleAlpha principal):** todos os idiomas do mundo do app. O Kids segue o primeiro idioma do aparelho; a pessoa troca pelo botão 🌐 no topo do início (`app/kids/language.tsx`, componente `kids/language-picker.tsx`: Português, English e Español em destaque, os outros idiomas com busca; também na área dos pais). pt-BR/en/es vêm prontos no app; nos outros, os textos do Kids vão no bloco `kidsUi` do dicionário do app (enviado pelo `syncSourceTexts` quando o admin abre o app) e a DeepSeek traduz uma vez por idioma (`ui.dict.{code}`), salvo para todos. Histórias e quiz: escritos em português e traduzidos pela DeepSeek uma vez por idioma (tabela `kids_story_translations`, migração `0018`); a primeira abertura num idioma traduz na hora, a lista traduz o resto em segundo plano (`preparing`). Publicar ou corrigir uma história apaga as traduções e refaz para os idiomas em uso. **Versículos e Bíblia nunca passam pela IA**: o texto vem da Bíblia daquele idioma (sem Bíblia nele, a em inglês). Um idioma novo pode ser pedido sem login em `POST /kids/languages/{code}/prepare` (limite por IP).
- **Modelos de IA (regra do BibleAlpha principal, decisão do dono 25/10/2026):** escrever história = **Claude Sonnet** (`kids_story`, não usar Opus, por custo); traduzir = **DeepSeek** (`kids_translate`); imagens (Etapa 2) = mesma configuração do Estudo Visual (`visual.images`, gpt-image-2).
- Testado: testes da API (`test_kids.py`), `tsc`, `expo lint`, telas no Chrome e no WebKit (iPhone 13 e iPad Pro 11).

## Onde fica cada coisa
- Telas públicas: `apps/app/src/app/kids/` — `_layout.tsx` (tema e progresso), `index.tsx` (início, estrelas), `stories/index.tsx` e `stories/[slug].tsx` (leitor com voz e botão do quiz no fim), `quiz/index.tsx` e `quiz/[slug].tsx`, `memory.tsx` (6/8/12 cartas), `verses.tsx` (versículo do dia, ouvir, completar palavras), `bible/index.tsx` (tradução + livros) e `bible/[book].tsx` (capítulos, um versículo por cartão, voz), `parents.tsx` (trava + área dos pais).
- Componentes e lógica: `apps/app/src/kids/` — `api.ts` (GET público sem token, `kidsFetch`, `bookName`), `progress.tsx` (nível, histórias vistas, estrelas e idioma escolhido, só no aparelho: chave `bakids.progress`), `strings.tsx` (textos pt/en/es + `KidsTextProvider` que baixa os outros idiomas; cópia em `bakids.ui.{code}`; nomes das cartas = chaves `card_*`), `theme.ts`, `ui.tsx` (KidsScreen, Mascot, BigTile, PillButton, BackButton), `speak.ts` (voz), `quiz-game.tsx`, `memory-cards.ts` (16 cartas com emoji e passagem), `celebrate.tsx`. Nada aqui importa telas ou estado dos adultos.
- Rota pública liberada sem login em `src/app/_layout.tsx` (`<Stack.Screen name="kids" />` fora do `Stack.Protected`); menu de baixo dos adultos escondido em `components/navigation.tsx`.
- Jogos: tela `app/kids/games/index.tsx` (jornada + lista) e um arquivo por jogo em `app/kids/games/*.tsx`; peças comuns em `kids/game-ui.tsx` (GameShell, GameEnd, AnswerButton), lista/níveis/conquistas em `kids/journey.ts`, desenhos para colorir em `kids/drawings.ts`. No site, o colorir usa o SVG do próprio navegador (o toque do react-native-svg não chega no navegador); nos apps usa o react-native-svg.
- Vídeos: telas `app/kids/videos/index.tsx` (lista com capa) e `app/kids/videos/[id].tsx` (player do navegador, sem baixar); painel `app/admin/kids/videos.tsx`; cliente `kidsVideosApi` em `src/lib/admin-kids.ts`; API `app/kids/videos.py` + rotas em `kids.py`/`admin_kids.py`.
- Painel admin: `apps/app/src/app/admin/kids/index.tsx` (gerar com IA, importar histórias prontas, lista com filtro), `[id].tsx` (revisão: texto bíblico ao lado, páginas, quiz editável, enviar para revisão, publicar, despublicar, apagar com dois toques), `verses.tsx` (sugeridos, adicionar por referência, publicar um ou todos). Botão no `admin/index.tsx`. Cliente: `src/lib/admin-kids.ts`. Textos: bloco `adminKids` nos 3 arquivos de `src/i18n`.
- API pública (`routes/kids.py`, sem login): `GET /kids/stories?language=&level=small|big` (com nº de páginas e de perguntas), `GET /kids/stories/{slug}` (páginas, lição, pergunta, quiz), `GET /kids/verses?language=&level=`, `GET /kids/bibles?language=` (Bíblias do idioma, a padrão primeiro). O texto bíblico vem das rotas públicas `/bible/books` e `/bible/{code}/chapters/{book}/{chapter}`. Nada devolve criador, IA ou custo.
- API admin (`routes/admin_kids.py`): histórias `GET /admin/kids/stories`, `GET/PUT/DELETE /admin/kids/stories/{id}`, `POST .../generate` (sempre rascunho), `POST .../import` (histórias prontas, sem repetir: `ai_meta.seed`), `POST .../{id}/status`; versículos `GET/POST /admin/kids/verses`, `POST .../suggested`, `POST .../publish-all`, `PATCH/DELETE .../{id}`. Ações de histórias no `audit_logs` (`kids.story_*`).
- IA: `services/api/app/kids/ai.py` (regras da seção 7; JSON com páginas, `image_prompt`, personagens e 4 perguntas de quiz; `clean_quiz` embaralha as alternativas). Modelo `kids_story` no painel (padrão Claude Sonnet 5.5, mais barato; tradução `kids_translate` = DeepSeek; imagens seguirão `visual.images`); custo no `AIUsage`. Versículos nunca passam pela IA.
- Conteúdo inicial: `services/api/app/kids/catalog.py` (versículos sugeridos e leitura do `starter_stories.json`).
- Modelos: `services/api/app/models/kids.py` (`KidsStory` com `quiz` JSONB, `KidsStoryPage`, `KidsVerse`) · Migrações `0016` (histórias) e `0017` (quiz e `kids_verses`).
- Testes: `services/api/tests/test_kids.py` (tabelas no TRUNCATE do `conftest.py`); `/api/v1/kids/` está na lista de rotas públicas de `test_security.py`.

## 1. O que é
Um espaço só para crianças dentro de https://biblealpha.com/kids. Ensina a Palavra de Deus de forma divertida: histórias ilustradas, jogos, quiz, versículos para decorar, Bíblia para quem já lê (7 anos ou mais) e vídeos educativos. Substitui "as porcarias de outros jogos e do YouTube".

Ordem de trabalho: **primeiro tudo no site (/kids), revisado e funcionando perfeitamente; só depois criar os apps das lojas** (Apple "Crianças", Google "Famílias").

## 2. Regras que não mudam
- **A criança nunca faz pergunta à IA** e nunca digita texto livre que vá para a IA. A IA só trabalha por trás, no painel do administrador.
- **Nunca anúncios. Nunca compras. Nunca links para fora** do app.
- **Sem conta e sem login para a criança.** O progresso (estrelas, figurinhas, o que já viu) fica só no aparelho (localStorage). Nada de nome, foto ou e-mail da criança. Sem rastreadores nem análise de terceiros.
- **Todo conteúdo gerado por IA começa como rascunho.** Só aparece para as crianças depois que o administrador revisa e clica **Publicar**. Pode despublicar.
- O conteúdo mostrado às crianças vem só de rotas públicas **somente leitura** (GET) de conteúdo publicado.
- História recontada sempre mostra a **passagem bíblica de origem** (referência), para o responsável conferir. Texto bíblico de verdade nunca é "inventado" pela IA.
- Português primeiro. Estrutura já pronta para en e es (campo de idioma por conteúdo; tradução pela IA, também revisada antes de publicar).

## 3. Decisões confirmadas pelo dono (24/10/2026)
1. **Idades:** todas. Dois níveis dentro do app: **Pequenos (4 a 6)** e **Grandes (7 a 12)**. A Bíblia só aparece para "Grandes".
2. **Nome:** **BibleAlpha Kids**.
3. **Bíblia:** todas as traduções do app oficial, do mesmo jeito (as cadastradas em `/admin/bibles`). O que precisa de tradução automática é traduzido pelo **DeepSeek** (como já é feito no app oficial) e passa pela revisão do dono antes de publicar. Na Etapa 4, conferir se alguma tradução tem restrição de licença para uso infantil (mesma situação do app oficial).
4. **Doutrina:** **pentecostal e somente bíblica.** Não ensinamos doutrinas humanas, só o que está na Bíblia (ver seção 7).

## 4. Onde encaixa no projeto (decisão técnica)
- **Etapa web:** rotas novas **dentro do app Expo atual**, em `apps/app/src/app/kids/*` (grupo próprio, layout próprio, tema próprio, sem importar telas dos adultos). Componentes e lógica ficam em `apps/app/src/kids/*`. Assim sai no mesmo domínio sem mexer na infraestrutura (Easypanel).
- A guarda de rotas em `src/app/_layout.tsx` (`Stack.Protected`) hoje manda quem não está logado para `/welcome` no site. **`/kids` precisa ser pública**, sem exigir login.
- **Etapa apps:** extrair para `apps/kids` (outro app Expo, outro bundle id, outro ícone) copiando `src/kids` e `src/app/kids`. Por isso nada de `kids` deve depender de telas ou estado dos adultos.
- **API:** mesmo `services/api`. Rotas públicas em `/api/v1/kids/...` (leitura) e rotas de admin em `/api/v1/admin/kids/...` (papel `admin`, como em `admin_users.py`). Painel admin em `apps/app/src/app/admin/kids/*`, com botão no `admin/index.tsx`.
- **IA:** usar o serviço de IA existente (modelos configuráveis no painel; administrador não tem limites; custo vai para `AIUsage`). Novas "features" de IA, por exemplo `kids_story`, `kids_quiz`, `kids_image`, `kids_translate` (ver a lista `Feature` em `admin.py` e as configurações de modelo).
- **Imagens:** o projeto já gera imagens (`app/api/routes/visual.py`, tabelas `visual_studies`/`visual_images`). Ler como funciona e como as imagens são guardadas antes de criar o armazenamento de mídia do Kids.

## 5. Dados (migração nova, a partir da 0016)
Esboço, ajustar ao ler o código:
- `kids_stories`: id, slug, language, title, summary, reference (ex. "1 Samuel 17"), level (`small`|`big`|`both`), status (`draft`|`review`|`published`), cover_image_id, position, ai_meta (modelo, prompt, custo), created_by, published_at, timestamps.
- `kids_story_pages`: story_id, position, text, image_id, image_prompt, narration_url (opcional).
- `kids_images`: id, kind (`page`|`cover`|`character`|`card`), prompt, storage (arquivo ou bytea, conforme o que já existe), approved (bool).
- `kids_characters`: id, name, description (para manter o mesmo visual nas ilustrações), style_notes, image_id.
- `kids_quizzes` / `kids_quiz_questions`: story_id, pergunta, 3 a 4 respostas, correta, explicação curta.
- `kids_memory_games`: id, title, status, pares (character_id + imagem + nome) — gerado a partir dos personagens de uma ou mais histórias.
- `kids_verses`: referência, texto (do texto bíblico oficial, não da IA), tradução, status, dia/ordem, versão "para decorar" (lacunas).
- `kids_videos`: story_id, status (`draft`|`rendering`|`ready`|`published`), roteiro, arquivo, duração.
- Todas com idioma e status de publicação; consultas públicas filtram `status = 'published'`.

## 6. Etapas (cada uma já utilizável e testada antes da próxima)

### Etapa 1 — Base e painel Kids
- Migração, modelos, rotas públicas (lista e detalhe de histórias publicadas) e rotas de admin (CRUD, mudar status).
- Painel `/admin/kids`: lista com filtro por status, botão **Gerar história com IA** (campos: passagem, nível, tom, tamanho), editor de rascunho (editar texto das páginas), botões **Enviar para revisão**, **Publicar**, **Despublicar**.
- Tela de revisão mostra a **passagem bíblica ao lado** do texto da IA.
- `/kids`: início colorido (mascote, 4 a 6 botões grandes), sem login. Portão dos pais (conta simples) para a área de pais.
- Pronto quando: gero uma história, edito, publico e ela aparece em `/kids` sem login; rascunho não aparece.

### Etapa 2 — Histórias ilustradas com narração
- Geração de ilustrações por página com **estilo fixo** (prompt de estilo único) e **personagens fixos** (`kids_characters`) para manter o mesmo rosto; o administrador aprova ou pede outra imagem.
- Leitor de história: página inteira com desenho, letra grande, virar com toque ou setas, narração.
- Narração: começar com a voz do aparelho (`expo-speech`, como em `src/bible/read-aloud.ts`); avaliar depois áudio pré-gerado por serviço de voz (qualidade e voz infantil/alegre consistente).
- Funciona offline depois da primeira vez (cache do navegador/PWA).

### Etapa 3 — Jogos e quiz (gerados das histórias)
- **Jogo da memória** com personagens bíblicos (pares), níveis 6/8/12 cartas, sons e comemoração.
- **Quiz** com figuras e respostas grandes; acerto = festa, erro = explicação gentil e tentar de novo (sem punição).
- IA gera, administrador revisa e publica junto com a história.
- Mascote, **estrelas**, **figurinhas** de personagens para colecionar e sequência de dias (sem culpa se falhar). Tudo salvo só no aparelho.

### Etapa 4 — Versículo para decorar e Bíblia para 7+
- Versículo do dia curto; modo "completar as palavras que sumiram"; gesto ou música opcional.
- Bíblia (nível "Grandes"): letra grande, um versículo por cartão, voz, livros com ícones, tradução(ões) escolhida(s) no item 3.2. Sem anotações nem IA.

### Etapa 5 — Vídeos educativos
- O sistema monta sozinho um **vídeo narrado**: ilustrações da história com zoom suave, música, legenda e voz. Feito no servidor (ffmpeg em um worker, com fila e tarefa em segundo plano), status `rendering` → `ready`, revisão e **Publicar**.
- Animação de verdade (movimento) fica para depois, só se valer o custo.
- Atenção: o servidor atual precisa de ffmpeg e de espaço em disco para os vídeos; combinar com o dono antes (Easypanel).

### Etapa 6 — Extras (opcional)
Músicas para cantar, colorir, quebra-cabeça da história, medalhas, quadro de progresso para os pais.

### Etapa 7 — Apps das lojas (só depois de tudo revisado no site)
- Criar `apps/kids`; novo bundle id (ex. `com.biblealpha.kids`), ícone, capturas, textos das lojas.
- Apple: categoria **Crianças** (faixa de idade), sem anúncio, sem link externo sem a trava dos pais, política de privacidade para crianças. Google: **Programa Famílias** e declaração de público infantil. Formulário de segurança dos dados: "não coleta dados".
- Mesmo processo de publicação dos apps atuais (EAS Build/Submit; ver `docs/05-lojas.md` e a memória do projeto).

## 7. Regras para a IA de conteúdo (prompts)
- **Doutrina:** linha pentecostal, **somente o que a Bíblia diz**. Nada de tradições, opiniões ou doutrinas humanas, nada de ensinos de outras denominações. Quando a Bíblia não é clara sobre algo, a IA não afirma: fica só no texto. Cada ensino precisa ter versículo de apoio. Sem temas polêmicos ou de adultos nas histórias infantis.
- Fiel ao texto bíblico da passagem informada; nada de inventar fatos nem doutrina; diálogos inventados só quando necessário e curtos.
- Linguagem simples para a idade; frases curtas; tom alegre e carinhoso.
- Sem detalhes assustadores ou violentos (resumir com cuidado histórias duras, como o Dilúvio e Davi e Golias, sem esconder a verdade).
- Terminar cada história com uma lição simples e uma pergunta para conversar em família.
- Saída sempre em JSON validado (páginas, personagens, prompts de imagem, quiz).
- O administrador sempre revisa; a IA nunca publica sozinha.

- **Imagens geradas por IA: sempre qualidade média** (regra do sistema inteiro, decisão do dono em 2026-10-25).

## 8. Design
- Cores vivas, botões enormes, cantos arredondados, mascote que reage (leãozinho ou ovelhinha).
- Sons curtos de acerto e de toque; botão de silenciar.
- Sem textos longos nem menus escondidos; ícones grandes com texto.
- Acessível: contraste, tamanho de letra, voz para quem ainda não lê.
- Testar no **Safari/WebKit** (iPhone e iPad), não só no Chrome — lição da reprovação da Apple.
- **Ilustrações (decisão do dono 25/10/2026):** estilo fixo de livro infantil (aquarela/lápis de cor, cores alegres), mesmos personagens em todas as páginas. **Jesus pode aparecer com rosto, mas sempre como desenho de historinha, nunca realista nem como pessoa real/foto.** (No app oficial as capas não mostram o rosto de Jesus; no Kids, em desenho, pode.)

## 9. Testes e publicação
- API: testes em `services/api/tests/test_kids.py` (rascunho invisível, publicar, despublicar, só admin altera, rotas públicas sem login, nada de dado pessoal).
- App: `npx tsc --noEmit`, `npx expo lint`, capturas no Chrome e no WebKit.
- Publicar o site: o dono clica **Implantar** (api primeiro, depois web). Commit e push **só com o OK do dono**.

## 10. Como retomar numa conversa nova
Dizer: "Leia `docs/mapa-kids.md` e `docs/mapa-app-oficial.md`, depois comece pela Etapa 1 do BibleAlpha Kids." Atualizar este arquivo conforme as etapas forem concluídas.
