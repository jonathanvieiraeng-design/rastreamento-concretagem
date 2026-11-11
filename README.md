# Rastreamento de Concretagem

PWA para iPad com Apple Pencil: substitui o Mapa de Rastreamento (MR) de concretagem feito em Excel. Funciona 100% offline depois de instalado. Os dados ficam só no aparelho (IndexedDB).

> **Estado atual: protótipo da Etapa 2** — só o desenho das regiões na prancha da laje (contorno → fechamento → preenchimento, rejeição de palma, zoom/pan). Cadastro de caminhões (NF, Bet, horários, volume), MR de Pilares, relatório e backup entram nas próximas etapas.

## Publicar no GitHub Pages

1. Repositório **público** `rastreamento-concretagem` (contém **só o código**).
2. `git push` na branch `main`.
3. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**.
4. Em 1 ou 2 minutos o app fica em `https://jonathanvieiraeng-design.github.io/rastreamento-concretagem/`.

> **Nunca** faça commit de pranchas (`.pdf`), planilhas (`.xlsx`) ou backups (`.json`). O `.gitignore` já bloqueia esses arquivos e as pastas `modelos/` e `pranchas/`.

## Instalar no iPad

1. Abra o endereço acima no **Safari** (com internet).
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra o app pela Tela de Início uma vez com internet, para ele guardar tudo no cache. A partir daí funciona em modo avião.

## Publicar uma atualização

1. Altere os arquivos.
2. Em `sw.js`, **aumente a versão**: `mr-v1` → `mr-v2`. Sem isso o app instalado não percebe a mudança.
3. Se criou um arquivo novo, inclua-o na lista `ARQUIVOS` do `sw.js`.
4. Faça commit e push. Ao abrir o app com internet, aparece a faixa **"Nova versão disponível — Recarregar"**.

## Desenho na prancha (regras de entrada)

- **Só a Apple Pencil desenha** (`pointerType === "pen"`). O dedo só move, amplia e toca.
- Enquanto a caneta está na tela, todo toque de dedo é ignorado (rejeição de palma). Se a palma encostou um instante antes e moveu a vista, a vista volta.
- Ao soltar a caneta, o contorno fecha sozinho (último ponto liga ao primeiro) e é preenchido com a cor do caminhão ativo.
- Os pontos são gravados em **coordenadas da prancha** (pt do PDF, viewport do pdf.js em escala 1), não da tela.
- Botão de cadeado: trava zoom e arraste (útil se a palma ainda mover a vista).
- Configurações → "Desenhar com o mouse": só para testar no computador.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html`, `css/app.css` | Página e estilo (identidade Arco-Íris-Mar) |
| `js/app.js` | Tela do protótipo, caminhões, desfazer/refazer |
| `js/planta.js` | pdf.js, zoom, arraste, traço da caneta e camada das regiões |
| `js/geometria.js` | Área, ponto dentro do contorno, simplificação do traço, posição do número |
| `js/cores.js` | Paleta dos caminhões |
| `js/db.js` | IndexedDB (pranchas, mrs, caminhoes, regioes, meta) |
| `js/ui.js`, `js/util.js` | Modais, ícones e utilidades |
| `sw.js`, `manifest.webmanifest` | PWA (offline e instalação) |

## Bibliotecas incluídas (sem CDN)

| Biblioteca | Versão | Arquivos |
|---|---|---|
| pdf.js (`pdfjs-dist`, build legacy) | 4.10.38 | `vendor/pdf.min.mjs`, `vendor/pdf.worker.min.mjs` |
| Poppins (títulos, licença OFL) | Google Fonts | `fonts/Poppins-*.ttf`, `fonts/OFL-Poppins.txt` |
| Open Sans (texto, licença OFL) | googlefonts/opensans | `fonts/OpenSans-*.ttf`, `fonts/OFL-OpenSans.txt` |
