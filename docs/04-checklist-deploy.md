# Checklist do deploy (homologação no Easypanel)

Passo a passo curto para a manhã do deploy. Detalhes de cada item: [02-deploy-easypanel.md](02-deploy-easypanel.md).

## 1. GitHub

- [ ] Criar o repositório **privado** `biblealpha` na conta `willianLealdev`.
- [ ] Conferir que `chaves.txt` e `.env` **não** vão para o Git (`git status` antes do primeiro commit; os dois estão no `.gitignore`).
- [ ] Primeiro commit no `main`, criar o branch `develop` a partir dele e enviar os dois (`git push -u origin main develop`).
- [ ] Easypanel → Settings → GitHub → liberar o repositório `biblealpha`.

## 2. Projeto `biblealpha-staging` (branch `develop`)

Criar nesta ordem:

- [ ] **postgres** — tipo Postgres, imagem `pgvector/pgvector:pg16`, banco `biblealpha`. Disco: **pelo menos 20 GB** (o catálogo de Bíblias ocupa ~12 GB).
- [ ] **redis** — tipo Redis, padrão.
- [ ] **api** — App, GitHub `biblealpha`, branch `develop`, Dockerfile `services/api/Dockerfile`, contexto `services/api`, porta `8000`, sem domínio.
- [ ] **worker** — igual à api, com *Command* `celery -A app.worker worker --loglevel=info`, sem porta.
- [ ] **web** — App, Dockerfile `apps/app/Dockerfile`, contexto `apps/app`, porta `80`, variável `API_UPSTREAM=http://<host interno da api>:8000`, com o domínio padrão do Easypanel (HTTPS).
- [ ] Ligar **Auto Deploy** em api, worker e web.

## 3. Variáveis de ambiente (api e worker)

```
BA_ENV=staging
BA_APP_URL=https://<url do serviço web>
BA_DATABASE_URL=postgresql+asyncpg://USUARIO:SENHA@HOST_POSTGRES:5432/biblealpha
BA_REDIS_URL=redis://HOST_REDIS:6379/0
BA_JWT_SECRET=<gerar: py -c "import secrets; print(secrets.token_urlsafe(48))">
BA_EMAIL_BACKEND=resend
BA_EMAIL_FROM=BibleAlpha <onboarding@resend.dev>
```

As chaves (Anthropic, OpenAI, Resend, Stripe) **não** precisam ir aqui: cadastre no painel (passo 5).

- [ ] Deploy de api, worker e web. Conferir `https://<url do web>/api/v1/health` → `{"status":"ok","env":"staging"}`.

## 4. Primeiro admin

- [ ] Abrir a URL do web e criar sua conta.
- [ ] Easypanel → api → Console:
  ```
  python -m app.cli grant-role seu@email.com admin
  python -m app.cli verify-email seu@email.com
  ```
- [ ] Sair e entrar de novo no app: o item **Painel administrativo** aparece no perfil.

## 5. Painel → Integrações e chaves

- [ ] **Anthropic** (IA) → Testar conexão.
- [ ] **DeepSeek** (traduções do app e do devocional em outros idiomas; bem mais barata) → Testar conexão. Sem ela, as traduções usam o Claude Haiku.
- [ ] **OpenAI** (opcional por enquanto) → Testar conexão.
- [ ] **Resend** (e-mails) → Testar conexão. Sem domínio verificado, só envia para o e-mail da sua conta Resend.
- [ ] **Stripe** — chave secreta (comece com a de **teste**, `sk_test_…`) → Testar conexão.
- [ ] Stripe → Developers → Webhooks → novo endpoint com o endereço mostrado no painel (`https://<url do web>/api/v1/billing/stripe/webhook`) e os eventos listados lá → copiar o *signing secret* (`whsec_…`) para o painel.
- [ ] Stripe → Settings → Customer portal → ativar (para "Gerenciar minha contribuição").

## 6. Valores das contribuições

- [ ] Painel → **Configurações da IA** → *Valor da contribuição (novos ofertantes)*: contribuição **mensal em BRL** (Brasil) e **mensal em USD** (resto do mundo). Opcional: anual.
- [ ] As ofertas avulsas não precisam de configuração (qualquer valor entre R$ 5 e R$ 10.000 / US$ 1 e US$ 2.000).

## 7. Bíblias

- [ ] Painel → **Bíblias**: em homologação/produção a importação de todo o catálogo começa sozinha ~30 s depois de a API subir. Se não aparecer andamento, clique em **Importar todo o catálogo**. Leva ~4–5 h; dá para testar o resto enquanto isso (BLIVRE, WEB e RV1909 já vêm prontas).
- [ ] Decidir sobre as traduções com licença **não comercial** (CC BY-NC / BY-NC-ND): ver a observação no README.

## 8. O que testar no PWA (celular)

- [ ] Abrir no Chrome (Android) / Safari (iPhone) → **Adicionar à tela inicial**; abrir pelo ícone (logo original).
- [ ] Cadastro de uma segunda conta (usuário comum) e e-mail de confirmação chegando (Resend).
- [ ] Bíblia: ler, trocar tradução e idioma, buscar, destacar, anotar, favoritar; modo avião → continua lendo o que já abriu.
- [ ] IA (usuário comum): tirar dúvida sobre um versículo, com fontes e "Para se aprofundar"; **não** deve haver opção de gerar ministração ou estudo.
- [ ] IA (admin): gerar ministração; assistente do editor; painel de custos mostra o uso.
- [ ] Ministrações: criar, editar, modo púlpito (tela fica acesa), exportar PDF.
- [ ] Devocional do dia e um plano de leitura.
- [ ] **Seja um ofertante**: contribuição mensal com cartão de teste `4242 4242 4242 4242` → volta com "Obrigado" e o perfil mostra "Ofertante mensal"; **Gerenciar minha contribuição** abre o portal; cancelar no portal → volta ao modo gratuito.
- [ ] Oferta avulsa de teste (ex.: R$ 25) → volta com o agradecimento; Painel → resumo mostra "Ofertas avulsas (mês)".
- [ ] Português, inglês e espanhol; tema claro e escuro.

## 8a. Segurança (conferir antes de abrir ao público)

- **A API não tem domínio público.** Só o serviço `web` (nginx) recebe tráfego; ele encaminha `/api` pela rede interna. Se a API ficasse exposta direto, alguém poderia mandar um IP falso e driblar os limites de tentativas.
- **Redis ligado** (`BA_REDIS_URL`): os limites de tentativas valem para todas as instâncias. Sem Redis a API continua no ar, mas cada processo conta separado (fica registrado no log).
- `BA_JWT_SECRET` aleatório com 32+ caracteres (a API não sobe sem isso em produção).
- HTTPS ativo no domínio (o Easypanel emite o certificado); o cookie de sessão só trafega em HTTPS.
- Em produção a documentação da API (`/api/docs`) fica desligada.
- Já ativos no código: e-mail confirmado para entrar; recuperação de senha por link de uso único (1 h) que encerra todas as sessões; cadastro e "esqueci a senha" não revelam se o e-mail existe; senhas com Argon2id; limites por IP e por e-mail em cadastro, login, reenvio e recuperação; limite geral de 600 requisições/min por IP; corpo de requisição de no máximo 8 MB; cabeçalhos de segurança e CSP restrita no app; cada pessoa só acessa os próprios dados (testado rota por rota em `tests/test_security.py`).

## 8b. Telão da igreja e agenda

- **Telão:** no computador ligado ao projetor, abra `https://biblealpha.com/screen` e clique em "Tela cheia". No celular: ministração → modo púlpito → ícone do telão → escanear o QR code (ou digitar o código). Toque no ícone ao lado de cada parágrafo ou versículo para mostrar; "Limpar tela" deixa só o fundo. A tela mostra só o texto, nunca o título.
- O fundo e as cores dos slides são criados pela IA na primeira conexão de cada ministração (DeepSeek para o design + gpt-image-2 para a imagem; sem chave da OpenAI fica um degradê). Cota: 3 fundos/mês no Free, 30 para ofertantes (`slides.quotas`).
- **Apps das lojas:** já apontam para `https://biblealpha.com` (API e telão). Só defina `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_APP_URL` para testar contra outro servidor.
- **Agenda:** lembrete por e-mail 24 h antes de cada compromisso (rotina a cada 5 min na API; precisa da chave do Resend).

## 9. Depois de aprovado

- [ ] Trocar as chaves do Stripe pelas de produção (e criar o webhook de produção).
- [ ] Textos definitivos de Termos de Uso e Política de Privacidade (revisão jurídica).
- [ ] Repetir tudo no projeto `biblealpha` (branch `main`, `BA_ENV=production`, outro `BA_JWT_SECRET`, outro banco, domínio definitivo).
- [ ] Backups do Postgres com destino externo, e testar uma restauração.
