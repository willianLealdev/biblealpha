# Deploy no Easypanel

Guia para publicar a homologação (testes no PWA) e, depois, a produção. Cada ambiente é um **projeto** separado no Easypanel, ligado a um branch do GitHub:

| Ambiente | Projeto Easypanel | Branch |
|---|---|---|
| Homologação | `biblealpha-staging` | `develop` |
| Produção | `biblealpha` | `main` |

O app web (PWA) e a API ficam **no mesmo endereço**: o Nginx do serviço `web` serve o app e encaminha `/api` para a API. Por isso só o serviço `web` precisa de domínio.

```
Internet ──HTTPS──> web (Nginx + PWA) ──/api──> api (FastAPI) ──> postgres, redis
                                                worker (Celery) ─┘
```

## 1. Conectar o GitHub

1. Easypanel → **Settings → GitHub** → conectar a conta e liberar o repositório privado `biblealpha`.
2. Criar o projeto `biblealpha-staging`.

## 2. Serviços

Crie na ordem abaixo. O nome do serviço vira o host interno no formato `<projeto>_<serviço>` (ex.: `biblealpha-staging_api`) **[verificar no painel: o Easypanel mostra o "internal host" de cada serviço]**.

### postgres
- Tipo **Postgres**. Em *Advanced*, trocar a imagem para **`pgvector/pgvector:pg16`** (a imagem padrão não tem a extensão de busca vetorial usada a partir da Fase 2/3).
- Banco: `biblealpha`. Anote usuário, senha e host interno.

### redis
- Tipo **Redis** (padrão).

### api
- Tipo **App** → Source: GitHub, repositório `biblealpha`, branch `develop`.
- Build: **Dockerfile**, caminho `services/api/Dockerfile`, contexto `services/api`.
- Porta do container: `8000`. **Sem domínio** (acesso só interno, pelo `web`).
- Variáveis de ambiente: ver seção 3.
- As migrações do banco rodam sozinhas a cada deploy (`alembic upgrade head` no início do container).

### worker
- Tipo **App**, mesma origem e Dockerfile da `api`.
- *Command* (sobrescrever): `celery -A app.worker worker --loglevel=info`
- Mesmas variáveis de ambiente da `api`. Sem porta, sem domínio.

### web
- Tipo **App** → mesmo repositório e branch.
- Build: **Dockerfile**, caminho `apps/app/Dockerfile`, contexto `apps/app`.
- Variável: `API_UPSTREAM=http://<host interno da api>:8000`
- Porta do container: `80`. **Domínio**: `biblealpha.com` (e `www.biblealpha.com` redirecionando para ele), com HTTPS automático do Easypanel. No registro do domínio, aponte os registros `A` de `biblealpha.com` e `www` para o IP do servidor.

### Deploy automático
Em `api`, `worker` e `web`, ativar **Auto Deploy** para que cada push no branch publique a nova versão.

## 3. Variáveis de ambiente (api e worker)

| Variável | Valor |
|---|---|
| `BA_ENV` | `staging` (homologação) ou `production` |
| `BA_APP_URL` | `https://biblealpha.com` — usada nos links dos e-mails e no QR code do telão (se ficar vazia em produção, já usa esse domínio) |
| `BA_DATABASE_URL` | `postgresql+asyncpg://USUARIO:SENHA@HOST_INTERNO_POSTGRES:5432/biblealpha` |
| `BA_REDIS_URL` | `redis://HOST_INTERNO_REDIS:6379/0` (se o Redis tiver senha: `redis://default:SENHA@HOST:6379/0`) |
| `BA_JWT_SECRET` | valor aleatório longo. Gere com `py -c "import secrets; print(secrets.token_urlsafe(48))"`. **Diferente em cada ambiente.** |
| `BA_EMAIL_BACKEND` | `resend` |
| `BA_RESEND_API_KEY` | chave da Resend (opcional: pode ser cadastrada no painel) |
| `BA_SECRETS_KEY` | opcional: chave que criptografa as chaves do painel (se vazia, deriva de `BA_JWT_SECRET`) |
| `BA_EMAIL_FROM` | `BibleAlpha <no-reply@biblealpha.com>` |

**Bíblias do mundo todo.** O servidor já sobe com BLIVRE, WEB e Reina-Valera 1909. Em produção ele **importa sozinho, logo depois de subir**, todo o catálogo do eBible.org (não precisa clicar em nada; o andamento aparece no Painel → Bíblias) e confere atualizações toda semana (`BA_BIBLE_AUTO_IMPORT=false` desliga). O servidor baixa do eBible.org todas as traduções redistribuíveis (cerca de 1.300, em mais de mil idiomas; ~15 milhões de versículos, ~12 GB no banco). Roda em segundo plano, uma por vez, e leva cerca de 4 a 5 horas; se o servidor reiniciar, ele continua sozinho de onde parou (ou clique em **Importar todo o catálogo** no painel). Reserve **pelo menos 20 GB** de disco para o Postgres. Também dá para rodar pelo terminal do serviço: `python -m app.bible.bulk`. Para trazer traduções novas ou atualizadas no futuro: **Buscar atualizações do catálogo** (ou `python -m app.bible.bulk --update`).

**Hebraico, grego, léxico, referências cruzadas e lugares bíblicos.** Também são importados sozinhos ao subir (uns 2 minutos, ~1 GB no banco): STEPBible.org (CC BY 4.0), OpenBible.info (CC BY). Pelo terminal: `python -m app.bible.original`.

**Chaves das integrações pelo painel.** Depois do primeiro deploy, entre como admin → Painel → **Integrações e chaves** e cadastre Anthropic (Claude), DeepSeek (traduções, bem mais barata), OpenAI, Resend e Stripe. Elas ficam criptografadas no banco e passam a valer em até 30 segundos, sem reiniciar. Cada grupo tem o botão **Testar conexão**.

**Stripe (pagamentos no mundo todo).** No Stripe → Developers → Webhooks, crie um endpoint com o endereço mostrado no painel (`https://biblealpha.com/api/v1/billing/stripe/webhook`) e os eventos listados lá; copie o *signing secret* (`whsec_…`) para o painel. Em Settings → Customer portal, ative o portal (trocar cartão, faturas, cancelar). O valor da **contribuição mensal** (Ofertante) é definido no painel (BRL para o Brasil, USD para o resto do mundo); cada versão de valor vira um Price no Stripe e quem já contribui mantém o valor escolhido. As **ofertas avulsas** (qualquer valor, de R$ 5 a R$ 10.000 ou US$ 1 a US$ 2.000) usam o mesmo webhook (evento `checkout.session.completed`) e aparecem no resumo do painel; não criam assinatura.

Em `staging`/`production` a API **se recusa a iniciar** sem `BA_JWT_SECRET` forte e sem `BA_EMAIL_BACKEND=resend`; isso evita subir com valores de desenvolvimento. A chave da Resend pode vir depois, pelo painel (sem ela os e-mails só ficam no log).

### Resend antes do domínio próprio
Enquanto `biblealpha.com` não estiver verificado na Resend, ela só envia a partir de `onboarding@resend.dev` e **apenas para o e-mail da sua conta Resend** **[verificar regra atual]**. Para testar a homologação: use `BA_EMAIL_FROM=BibleAlpha <onboarding@resend.dev>` e cadastre-se com o e-mail da sua conta Resend. Quando o domínio existir, adicione os registros DNS que a Resend indicar e troque o remetente.

## 4. Primeiro acesso

1. Abra a URL do `web` e crie sua conta.
2. No console do serviço `api` (Easypanel → api → Console), torne sua conta administradora (e, se a Resend ainda não estiver configurada, confirme o e-mail por aqui):
   ```
   python -m app.cli grant-role seu@email.com admin
   python -m app.cli verify-email seu@email.com
   ```
3. Teste: `https://<url-do-web>/api/v1/health` deve responder `{"status":"ok","env":"staging"}`.
4. No celular, abra a URL no Chrome (Android) ou Safari (iPhone) e use **Adicionar à tela inicial** para instalar o PWA.

## 5. Backups

- Postgres: ativar **Backups** no serviço postgres do Easypanel, com destino externo (S3, Backblaze, etc.) **[definir destino]**.
- Testar a restauração em homologação antes do lançamento (critério de aceitação do projeto).

## 6. Produção

Repetir os passos no projeto `biblealpha`, branch `main`, com `BA_ENV=production`, outro `BA_JWT_SECRET`, outro banco, e o domínio definitivo. Só promover para `main` o que foi aprovado em homologação.
