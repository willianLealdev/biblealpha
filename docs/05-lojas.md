# Apps nas lojas: Google Play, App Store e Microsoft Store

Os apps de Android e iPhone são gerados na nuvem da Expo (EAS Build) a partir de `apps/app`. O da Microsoft Store é o próprio site (PWA) empacotado pelo PWABuilder. Os três usam o servidor `https://biblealpha.com`: tudo o que você muda no painel (limites, valores, chaves, devocionais, Bíblias, idiomas, textos) vale na hora, sem publicar versão nova.

## 0. Contas necessárias

| Conta | Custo | Para quê |
|---|---|---|
| Expo (expo.dev) | grátis | gerar os apps na nuvem e mandar atualizações |
| Google Play Console | US$ 25, uma vez | publicar no Android |
| Apple Developer Program | US$ 99 por ano | publicar no iPhone/iPad |
| Microsoft Partner Center | grátis para pessoa física | publicar no Windows |

## 1. Entrar na Expo (uma vez)

No terminal, dentro de `apps/app`:

```
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest update:configure
```

O `init` cria o projeto na sua conta Expo e grava o `projectId` no `app.json`. O `update:configure` liga as **atualizações automáticas** (EAS Update).

## 2. Android

1. App de teste (instala direto no celular, sem loja):
   ```
   npx eas-cli@latest build -p android --profile preview
   ```
   No fim aparece um link/QR code para baixar o `.apk`.
2. Versão da loja (`.aab`):
   ```
   npx eas-cli@latest build -p android --profile production
   ```
3. No Google Play Console: **Criar app** → nome `BibleAlpha` → idioma padrão Português (Brasil) → App → Gratuito.
   - Envie o primeiro `.aab` manualmente em **Testes → Teste interno**. Os próximos podem ir pelo comando `npx eas-cli@latest submit -p android` (precisa de uma chave de conta de serviço do Google, a Expo explica no próprio comando).
   - Preencha a ficha com os textos da seção 5, a classificação de conteúdo (questionário: tudo "não", resultado Livre) e a seção **Segurança dos dados** (seção 6).

## 3. iPhone / iPad

1. ```
   npx eas-cli@latest build -p ios --profile production
   ```
   Na primeira vez a Expo pede login da conta Apple Developer e cria sozinha os certificados.
2. ```
   npx eas-cli@latest submit -p ios
   ```
   Envia para o App Store Connect (TestFlight). Lá: preencha a ficha (seção 5), **Privacidade do app** (seção 6) e envie para revisão.
3. **Conta de demonstração para a Apple:** a revisão da Apple precisa entrar no app. Crie uma conta de teste (por exemplo `revisao@biblealpha.com`), confirme o e-mail e informe e-mail e senha em "Informações da revisão".

## 4. Microsoft Store (Windows)

1. Abra **https://www.pwabuilder.com**, digite `https://biblealpha.com` e clique em **Start**.
2. Clique em **Package for stores → Windows**.
   - Package ID, Publisher e Publisher display name: copie do Partner Center (**Gerenciamento de produtos → Identidade do produto**) depois de reservar o nome `BibleAlpha`.
3. Baixe o pacote e envie o arquivo `.msixbundle` em **Partner Center → Envios**.
4. Use os textos da seção 5 e capturas de tela do site no computador (1366×768 ou maior).

## 5. Textos para as lojas

**Nome:** BibleAlpha
**Subtítulo (Apple, até 30 caracteres):** Bíblia, estudo e ministração
**Descrição curta (Google, até 80 caracteres):** Bíblia em mil idiomas, estudo com IA, devocional diário e recursos para pregar.
**Categoria:** Livros e referências (Google) · Referência (Apple) · Livros e referências (Microsoft)
**Palavras-chave (Apple, até 100 caracteres):** biblia,estudo biblico,devocional,pregacao,sermao,igreja,hebraico,grego,ia,cristao
**Site:** https://biblealpha.com
**Suporte:** contato@biblealpha.com
**Política de privacidade:** https://biblealpha.com/legal/privacy
**Termos de uso:** https://biblealpha.com/legal/terms

**Descrição completa:**

> Descubra a profundidade da Palavra de Deus.
>
> O BibleAlpha é um app de estudo bíblico sem fins lucrativos, feito para quem quer entender as Escrituras e para quem ministra.
>
> BÍBLIA EM MAIS DE MIL IDIOMAS
> • Mais de 1.200 traduções livres, com leitura offline
> • Leitura em voz alta, destaques por cores, anotações e marcadores
>
> ESTUDO COM IA QUE MOSTRA AS FONTES
> • Pergunte sobre qualquer passagem e receba explicações com referências bíblicas
> • Hebraico e grego palavra por palavra, com o significado no seu idioma
> • Referências cruzadas, comparador de traduções e estudo visual com mapas e linha do tempo
> • Professor com IA para testar o que você aprendeu
>
> DEVOCIONAL DIÁRIO
> • Um texto novo por dia, 366 no ano, no seu idioma
>
> PARA QUEM MINISTRA
> • Editor em blocos: digite a referência e o versículo entra sozinho
> • Escreva falando (ditado por voz)
> • Modo púlpito com letra grande e cronômetro que fica amarelo e vermelho no fim do tempo
> • Compartilhar tela: leve o texto ao telão da igreja pelo QR code, como no WhatsApp Web
> • Exporte em PDF, Word e PowerPoint
> • Agenda de pregações com lembrete por e-mail
>
> SEM ANÚNCIOS
> O BibleAlpha é mantido por ofertas voluntárias. Você pode usar gratuitamente.

**Short description (English):** Bible in 1,000+ languages, AI study, daily devotional and preaching tools.
**Descripción corta (español):** Biblia en mil idiomas, estudio con IA, devocional y recursos para predicar.

## 6. Segurança dos dados (Google) / Privacidade do app (Apple)

Respostas de acordo com a Política de Privacidade:

| Dado | Coletado | Para quê | Vinculado à pessoa | Rastreamento/anúncios |
|---|---|---|---|---|
| Nome, e-mail | Sim | Conta | Sim | Não |
| Conteúdo do usuário (anotações, ministrações, agenda, perguntas à IA) | Sim | Funcionalidade do app | Sim | Não |
| Áudio (ditado) | Não é guardado: o reconhecimento de fala é do próprio aparelho | Funcionalidade | — | Não |
| Fotos/câmera | Não é guardada: a câmera só lê o QR code | Funcionalidade | — | Não |
| Identificadores do dispositivo / IP | Sim | Segurança | Sim | Não |
| Compras | Sim (situação da contribuição, pela Stripe) | Funcionalidade | Sim | Não |
| Localização, contatos, saúde | Não | — | — | — |

- Os dados são criptografados em trânsito (HTTPS): **Sim**.
- A pessoa pode pedir a exclusão dos dados: **Sim** (no app: Perfil → Excluir conta; na web: https://biblealpha.com).
- Rastreamento entre apps (Apple ATT): **Não**.

## 7. Atualizações sem passar pela loja

- **Mudanças no painel:** valem na hora para todos (não precisam de nada).
- **Correções de telas e textos do app:** depois do `update:configure`, publique com
  ```
  npx eas-cli@latest update --channel production --message "descrição"
  ```
  Os apps instalados baixam sozinhos na próxima abertura.
- **Mudanças nativas** (permissão nova, biblioteca nativa nova, troca de ícone) precisam de um build novo e de uma nova publicação na loja. Para isso, aumente `version` no `app.json` (ex.: 1.0.1). O número interno de build sobe sozinho.

## 8. Possíveis perguntas da revisão

- **Ofertas pelo Stripe dentro do app:** as lojas podem pedir mudanças nas contribuições (Apple: diretriz 3.1.1, exceção para doações de organizações sem fins lucrativos; Google: política de pagamentos). Se pedirem, ajustamos.
- **Conteúdo gerado por IA:** o app identifica as ilustrações como geradas por IA e as respostas mostram as fontes.
