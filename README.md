# Rastreamento de Concretagem

PWA para iPad com Apple Pencil: substitui o Mapa de Rastreamento (MR) de concretagem feito em Excel. Funciona 100% offline depois de instalado. Os dados ficam só no aparelho (IndexedDB).

> **Estado atual: Etapa 5** — MR de Pilares e de Laje, resultados de TCP (MPa), busca reversa (NF, Bet, elemento) e backup/restauração. Falta a Etapa 6 (instruções finais).

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
2. Em `sw.js`, **aumente a versão**: `mr-v6` → `mr-v7`. Sem isso o app instalado não percebe a mudança.
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
| `js/app.js`, `js/nav.js` | Rotas e service worker |
| `js/tela-inicio.js` | Lista de MRs com filtro por obra, tipo e mês |
| `js/tela-form-mr.js` | Cabeçalho do MR (obra, local, data, especificação, elementos, assinaturas) |
| `js/tela-cadastros.js` | Cadastros de elementos (colar lista "P11; P12; …") |
| `js/tela-mr-pilares.js` | MR de Pilares: caminhões, horas, chips, conclusão |
| `js/tela-mr-laje.js` | MR de Laje: prancha, regiões por caminhão (Apple Pencil), painel dos caminhões, conclusão |
| `js/caminhao.js` | Partes comuns do caminhão (campos, gravação, exclusão com renumeração, relatório) |
| `js/tela-tcs.js` | Resultados de TCP (teste de corpo de prova) 7/28/60 dias (MPa) de um MR; status "TCPs completos" com 7 e 28 dias em todos |
| `js/busca.js` | Busca reversa: NF, Bet ou elemento → MR e caminhão |
| `js/backup.js` | Backup .json (com as pranchas) e restauração que junta os dados |
| `js/mr.js` | Regras do MR: formatos, valores derivados, listas de elementos |
| `js/relatorio.js` | Relatório PDF do MR (Laje: página A3 com o mapa e a legenda) |
| `js/planta.js` | pdf.js, zoom, arraste, traço da caneta e camada das regiões |
| `js/geometria.js` | Área, ponto dentro do contorno, simplificação do traço, posição do número |
| `js/cores.js` | Paleta dos caminhões |
| `js/db.js` | IndexedDB (obras, cadastros, mrs, caminhoes, regioes, pranchas, meta) |
| `js/ui.js`, `js/util.js` | Modais, ícones e utilidades |
| `sw.js`, `manifest.webmanifest` | PWA (offline e instalação) |

## Bibliotecas incluídas (sem CDN)

| Biblioteca | Versão | Arquivos |
|---|---|---|
| pdf.js (`pdfjs-dist`, build legacy) | 4.10.38 | `vendor/pdf.min.mjs`, `vendor/pdf.worker.min.mjs` |
| jsPDF | 2.5.2 | `vendor/jspdf.umd.min.js` |
| jspdf-autotable | 3.8.4 | `vendor/jspdf.plugin.autotable.min.js` |
| Poppins (títulos, licença OFL) | Google Fonts | `fonts/Poppins-*.ttf`, `fonts/OFL-Poppins.txt` |
| Open Sans (texto, licença OFL) | googlefonts/opensans | `fonts/OpenSans-*.ttf`, `fonts/OFL-OpenSans.txt` |

## Backup

- Tela inicial → **Fazer backup**: gera `BACKUP-MR-AAAA-MM-DD-HHhMM.json` com tudo (obras, cadastros, MRs, caminhões, regiões, pranchas e preferências). Salve no OneDrive pelo Compartilhar.
- Ao concluir uma concretagem, o app oferece o backup. A tela inicial mostra a data do último backup e avisa quando passa de 30 dias.
- **Restaurar backup** junta o arquivo aos dados do iPad: registro novo entra; registro que existe nos dois fica com a versão mais recente (`atualizadoEm`); nada é apagado. As preferências do iPad (opacidade etc.) são mantidas.
