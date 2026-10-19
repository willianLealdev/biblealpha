# Estudo visual do capítulo — especificação

Pedido do usuário (18/10/2026): ao abrir um livro e capítulo, poder pedir à IA um **estudo visual** — diagrama/pôster mostrando como poderia ter acontecido, imagens da época, mapas, ligações com o Antigo Testamento e profecias que Jesus cumpriu — algo que realmente faça a pessoa aprender.

## Decisões

| Tema | Decisão |
|---|---|
| Ilustrações | **OpenAI gpt-image** (chave própria, só no backend: `OPENAI_API_KEY`) |
| Quem gera | **Todos**, com cota: o **Free** gera uma quantidade limitada (ex.: 3 por mês), o **Pro** gera com teto de segurança, e o admin sem limite. Os números ficam no painel do admin (`visual_free_monthly`, `visual_pro_daily_cap`). Cada capítulo gerado fica guardado por idioma e **todos veem** sem gastar cota; ao acabar a cota do Free aparece o convite ao Pro |
| Texto e estrutura | Claude (mesma camada de IA, funcionalidade `visual_study`), JSON estruturado |
| Custo | Registrado no painel do admin: `visual_study` (texto) e `image` (por imagem); orçamento e liga/desliga no painel |

## Onde aparece

- Leitor: botão **Estudo visual** na barra do capítulo (ícone de imagens).
- Tela própria `/bible/visual/[book]/[chapter]`, com rolagem por seções e exportação como pôster (imagem/PDF).

## Conteúdo (tudo com fonte)

1. **Resumo do capítulo** — com referências.
2. **Linha do tempo** — eventos do capítulo e do contexto, com referência; datas aproximadas marcadas como "aprox." e com fonte nomeada.
3. **Mapa** — lugares citados no capítulo, rotas e distâncias. As coordenadas vêm de base aberta (OpenBible.info Bible Geocoding, CC BY **[verificar licença]**), nunca inventadas pela IA. Mapa base: Natural Earth (domínio público), desenhado em SVG (funciona no PWA, Android e iOS).
4. **Personagens** — quem aparece e como se relacionam (diagrama).
5. **Ligações com o Antigo Testamento** — citação, alusão, profecia → cumprimento, com as duas referências, o tipo de ligação e a explicação. Toda referência é conferida no banco; conferência cruzada com a base de referências da Fase 6 (OpenBible / Treasury of Scripture Knowledge).
6. **Palavras de Jesus e profecias cumpridas** — quando o capítulo tiver (ex.: Lucas 4:16-21 ↔ Isaías 61:1-2), sempre com as duas passagens lado a lado.
7. **Contexto histórico** — só com fonte nomeada (autor — obra) ou da própria Bíblia, nas mesmas regras da IA de estudo.
8. **Ilustrações (IA)** — até 3 por capítulo, geradas com descrições montadas a partir dos fatos acima. Sempre com o selo **"Ilustração artística gerada por IA — não é registro histórico"**. Não representar o rosto de Jesus ou de outros personagens como aparência histórica comprovada.
9. **Fotos reais** — sítios arqueológicos, artefatos e manuscritos do Wikimedia Commons, com autor e licença de cada imagem exibidos.
10. **Pôster** — resumo visual exportável (imagem/PDF) para estudo, aula ou compartilhamento.

## Regras

- Nada sem fonte: referência bíblica conferida ou fonte nomeada; o que não for verificável fica de fora.
- Imagens de IA são claramente rotuladas; fotos reais trazem crédito e licença.
- Gerado uma vez por capítulo e idioma (cache compartilhado); o admin pode regenerar.
- Cota própria do estudo visual (separada das perguntas): Free com limite mensal, Pro com teto de segurança; abrir um estudo já gerado não consome cota. Tudo aparece no painel de custos.

## Pendências para ativar

- Chave da OpenAI para imagens.
- Confirmar licenças: OpenBible.info Geocoding e referências cruzadas.
