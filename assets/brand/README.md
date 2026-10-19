# Ativos da marca BibleAlpha

O logo oficial é **`logo-original.webp`**, mantido sem alterações. Todos os outros arquivos são **recortes e redimensionamentos dele**, gerados por `tools/brand/build.py`:

```bash
py tools/brand/build.py
```

## Temas

O usuário escolhe fundo **preto** ou **branco** no app.

- **Fundo preto:** o logo original como está.
- **Fundo branco:** o selo original fica intacto (recortado pela borda dourada). Só o texto muda: "Bible" e a tagline, que são brancos no original, viram tinta escura `#16120C`, e "Alpha" mantém o dourado um pouco mais profundo, para ter contraste.

## Arquivos

| Pasta | Arquivo | Uso |
|---|---|---|
| `logo/` | `logo-on-dark.png` | Logo completo para fundo preto (cópia exata do original em PNG) |
| | `logo-on-dark-transparent.png` | Mesmo logo com fundo transparente, para qualquer fundo escuro |
| | `logo-on-light.png` | Logo completo para fundo branco |
| | `seal.png` | Só o selo (A + Bíblia), cantos transparentes, para os dois temas |
| | `wordmark-on-dark-transparent.png` / `wordmark-on-light-transparent.png` | Só "BibleAlpha" + tagline, para cabeçalhos |
| `app/` | `icon.png` (1024) | Ícone do app Android/iOS: selo original sobre preto |
| | `adaptive-foreground.png` + fundo `#040302` | Ícone adaptativo do Android |
| | `splash-icon.png` | Tela de abertura |
| `web/` | `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Manifesto do PWA |
| | `apple-touch-icon.png` (180) | iPhone, "Adicionar à Tela de Início" |
| | `favicon.ico`, `favicon-16/32/48.png` | Aba do navegador |
| — | `preview.png` | Folha de conferência: preto × branco, ícones de 180 a 16 px |

## Observações

- O ícone da loja é sempre o selo sobre preto: o sistema não deixa o app trocar o ícone pelo tema escolhido dentro dele.
- No ícone, o selo ocupa 86% da área, para o arredondamento do iOS/Android não cortar a moldura dourada.
- Em 16–32 px os detalhes do selo ficam pouco legíveis; isso é próprio da arte.
- Para ícones e impressão em alta qualidade, vale ter o arquivo do logo em resolução maior (2048 px ou mais) ou o arquivo-fonte do designer. Se você tiver, substitua `logo-original.webp` e rode o script de novo.
