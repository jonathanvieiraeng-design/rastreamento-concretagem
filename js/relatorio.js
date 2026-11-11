// Relatório do MR em PDF (jsPDF + autotable), na identidade da Construtora Arco-Íris-Mar.
// A4 paisagem: cabeçalho, resumo, tabela de caminhões, rastreamento por elemento (Pilares) e assinaturas.
// Laje: mais uma página A3 paisagem com o mapa (prancha + regiões numeradas) e a legenda.
import { bufParaBase64, hexParaRgb, limitarEscala } from './util.js';
import { corDoItem, rgba } from './cores.js';
import { pontoRotulo } from './geometria.js';
import {
  TIPOS, STATUS_MR, duracao, fmtDuracao, fmtNumero, fmtTc, fmtDataBr, acumulados, resumoMr,
  mapaElementos, naoVinculados, compararNatural, juntarElementos, nomeArquivoMr,
} from './mr.js';

const LOGO = 'assets/logo-arcoirismar.png';
const LOGO_PROPORCAO = 1250 / 190;

let recursos;

async function baixar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`arquivo não encontrado (${url})`);
  return r.arrayBuffer();
}

// A logo é PNG com transparência (o jsPDF guardaria sem compressão). Converte para JPEG.
async function logoJpeg() {
  // onload (e não decode()): decode() fica parado com o app em segundo plano
  const img = await new Promise((ok, falha) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error('logo não encontrada'));
    i.src = LOGO;
  });
  const c = document.createElement('canvas');
  c.width = 700;
  c.height = Math.round((700 * img.naturalHeight) / img.naturalWidth);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const dados = c.toDataURL('image/jpeg', 0.92);
  c.width = 0;
  c.height = 0;
  return dados;
}

async function carregarRecursos() {
  if (!recursos) {
    const [regular, negrito, titulo, logo] = await Promise.all([
      baixar('fonts/OpenSans-Regular.ttf'), baixar('fonts/OpenSans-Bold.ttf'), baixar('fonts/Poppins-SemiBold.ttf'), logoJpeg(),
    ]);
    recursos = { regular: bufParaBase64(regular), negrito: bufParaBase64(negrito), titulo: bufParaBase64(titulo), logo };
  }
  return recursos;
}

const AZUL = [11, 66, 109];
const OURO = [195, 165, 89];
const TEXTO = [35, 35, 35];
const MEDIO = [100, 100, 100];
const LINHA = [221, 216, 204];
const CLARO = [247, 246, 243];
const ALERTA = [179, 38, 30];

const dois = (n) => String(n).padStart(2, '0');
function fmtDataHora(d) {
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export async function gerarRelatorioMr(mr, obra, caminhoes, extra = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const f = await carregarRecursos();
  doc.addFileToVFS('OpenSans-Regular.ttf', f.regular);
  doc.addFont('OpenSans-Regular.ttf', 'OpenSans', 'normal');
  doc.addFileToVFS('OpenSans-Bold.ttf', f.negrito);
  doc.addFont('OpenSans-Bold.ttf', 'OpenSans', 'bold');
  doc.addFileToVFS('Poppins-SemiBold.ttf', f.titulo);
  doc.addFont('Poppins-SemiBold.ttf', 'Poppins', 'normal');

  const L = 297;
  const A = 210;
  const M = 12;
  const emissao = new Date();
  const ordenados = [...caminhoes].sort((a, b) => a.item - b.item);
  const tipo = TIPOS[mr.tipo];

  // ---- cabeçalho ----
  const logoL = 50;
  doc.addImage(f.logo, 'JPEG', L - M - logoL, 9, logoL, logoL / LOGO_PROPORCAO);
  doc.setFont('Poppins', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(...AZUL);
  doc.text(`Mapa de Rastreamento — ${tipo.rotulo}`, M, 15);
  doc.setFont('OpenSans', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MEDIO);
  doc.text(obra?.nome || 'Obra não informada', M, 21);
  doc.setDrawColor(...OURO);
  doc.setLineWidth(0.8);
  doc.line(M, 25, L - M, 25);

  const info = [
    ['Local da concretagem', mr.local || '—'],
    ['Data', fmtDataBr(mr.data)],
    ['Especificação do concreto recebido', mr.especificacao || '—'],
    ['Status', STATUS_MR[mr.status]?.rotulo || '—'],
  ];
  let y = 31;
  doc.setFontSize(9.5);
  const larguraRotulo = 62;
  for (const [rotulo, valor] of info) {
    doc.setFont('OpenSans', 'bold');
    doc.setTextColor(...AZUL);
    doc.text(rotulo, M, y);
    doc.setFont('OpenSans', 'normal');
    doc.setTextColor(...TEXTO);
    const linhas = doc.splitTextToSize(valor, L - 2 * M - larguraRotulo);
    doc.text(linhas, M + larguraRotulo, y);
    y += 5 * linhas.length;
  }

  // ---- resumo ----
  const r = resumoMr(ordenados);
  const caixas = [
    ['Caminhões', String(r.caminhoes)],
    ['Volume total', `${fmtNumero(r.volume)} m³`],
    ['Início (1º HI)', r.inicio || '—'],
    ['Término (último HT)', r.termino || '—'],
    ['Duração total', r.inicio && r.termino ? fmtDuracao(duracao(r.inicio, r.termino)) : '—'],
  ];
  y += 1;
  const gap = 3;
  const larg = (L - 2 * M - gap * (caixas.length - 1)) / caixas.length;
  const alt = 14;
  caixas.forEach(([rotulo, valor], i) => {
    const x = M + i * (larg + gap);
    doc.setFillColor(...CLARO);
    doc.setDrawColor(...LINHA);
    doc.rect(x, y, larg, alt, 'FD');
    doc.setFont('OpenSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MEDIO);
    doc.text(rotulo, x + 3.5, y + 4.8);
    doc.setFont('Poppins', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(...AZUL);
    doc.text(valor, x + 3.5, y + 11);
  });
  y += alt + 6;

  // ---- tabela de caminhões ----
  const acum = acumulados(ordenados);
  const comElementos = mr.tipo === 'pilares';
  const ehLaje = mr.tipo === 'laje';
  const cab = ['Item', 'NF', 'Bet', 'HI', 'HT', 'Descarga', 'Vol (m³)', 'Acum. (m³)', 'TCP 7d (MPa)', 'TCP 28d (MPa)', 'TCP 60d (MPa)'];
  if (comElementos) cab.push('Elementos');
  const corpo = ordenados.map((c, i) => {
    const linha = [
      String(c.item),
      c.nf != null ? String(c.nf) : '—',
      c.bet || '—',
      c.hi || '—',
      c.ht || '—',
      fmtDuracao(duracao(c.hi, c.ht)),
      c.vol != null ? fmtNumero(c.vol) : '—',
      fmtNumero(acum[i]),
      fmtTc(c.tc7) || '',
      fmtTc(c.tc28) || '',
      fmtTc(c.tc60) || '',
    ];
    if (comElementos) linha.push(juntarElementos(c.elementos) || '—');
    return linha;
  });
  titulo(doc, 'Caminhões', M, y);
  y += 2;
  const colunas = {
    0: { cellWidth: 11, halign: 'center', fontStyle: 'bold' },
    1: { cellWidth: 17 },
    2: { cellWidth: 13 },
    3: { cellWidth: 12, halign: 'center' },
    4: { cellWidth: 12, halign: 'center' },
    5: { cellWidth: 19 },
    6: { cellWidth: 15, halign: 'right' },
    7: { cellWidth: 17, halign: 'right' },
    8: { cellWidth: 13, halign: 'right' },
    9: { cellWidth: 14, halign: 'right' },
    10: { cellWidth: 14, halign: 'right' },
  };
  if (!comElementos) {
    // sem a coluna Elementos: as colunas se esticam até a largura da página
    const soma = Object.values(colunas).reduce((s, c) => s + c.cellWidth, 0);
    for (const c of Object.values(colunas)) c.cellWidth *= (L - 2 * M) / soma;
  }
  doc.autoTable({
    startY: y,
    margin: { left: M, right: M, bottom: 16 },
    head: [cab],
    body: corpo.length ? corpo : [[{ content: 'Nenhum caminhão registrado.', colSpan: cab.length }]],
    styles: { font: 'OpenSans', fontSize: 8.8, textColor: TEXTO, cellPadding: 1.6, lineColor: LINHA, lineWidth: 0.1, overflow: 'linebreak', valign: 'middle' },
    headStyles: { font: 'OpenSans', fontStyle: 'bold', fillColor: AZUL, textColor: 255 },
    alternateRowStyles: { fillColor: CLARO },
    columnStyles: colunas,
    didParseCell: (d) => {
      // Laje: o Item na cor do caminhão (a mesma do mapa)
      if (ehLaje && d.section === 'body' && d.column.index === 0 && ordenados[d.row.index]) {
        d.cell.styles.fillColor = hexParaRgb(corDoItem(ordenados[d.row.index].item));
        d.cell.styles.textColor = 255;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ---- Laje: caminhões sem região ----
  const regioes = extra.regioes || [];
  if (ehLaje) {
    const sem = ordenados.filter((c) => !regioes.some((rg) => rg.caminhaoId === c.id));
    doc.setFontSize(9);
    if (sem.length) {
      doc.setFont('OpenSans', 'bold');
      doc.setTextColor(...ALERTA);
      doc.text(`Caminhão sem região desenhada no mapa: ${sem.map((c) => c.item).join(', ')}.`, M, y);
    } else if (ordenados.length) {
      doc.setFont('OpenSans', 'normal');
      doc.setTextColor(...MEDIO);
      doc.text(extra.prancha ? 'Locais de aplicação: ver o mapa na página seguinte (número = Item do caminhão).' : 'Sem prancha carregada: o mapa não foi gerado.', M, y);
    }
    y += 6;
  }

  // ---- rastreamento por elemento (Pilares) ----
  if (comElementos) {
    const mapa = mapaElementos(ordenados);
    const todos = [...new Set([...(mr.elementos || []), ...mapa.keys()])].sort(compararNatural);
    const falta = naoVinculados(mr, ordenados);
    if (y > A - 40) { doc.addPage(); y = 18; }
    titulo(doc, 'Rastreamento por elemento', M, y);
    y += 2;
    // duas tabelas lado a lado para economizar papel
    const linhasEl = todos.map((e) => {
      const cs = mapa.get(e) || [];
      return [
        e,
        cs.length ? cs.map((c) => c.item).join(' + ') : 'SEM CAMINHÃO',
        cs.map((c) => (c.nf != null ? c.nf : '—')).join(' + '),
        cs.map((c) => c.bet || '—').join(' + '),
        cs.map((c) => `${c.hi || '—'}–${c.ht || '—'}`).join(' + '),
      ];
    });
    // dois elementos por linha (lê-se da esquerda para a direita); uma coluna estreita separa os pares
    const cabEl = ['Elemento', 'Caminhão', 'NF', 'Bet', 'HI–HT', '', 'Elemento', 'Caminhão', 'NF', 'Bet', 'HI–HT'];
    const pares = [];
    for (let i = 0; i < linhasEl.length; i += 2) {
      pares.push([...linhasEl[i], '', ...(linhasEl[i + 1] || ['', '', '', '', ''])]);
    }
    const larguraEl = (L - 2 * M - 4) / 2;
    const colEl = (base) => ({
      [base]: { fontStyle: 'bold', cellWidth: 24 },
      [base + 1]: { cellWidth: 20, halign: 'center' },
      [base + 2]: { cellWidth: 26 },
      [base + 3]: { cellWidth: 22 },
      [base + 4]: { cellWidth: larguraEl - 92 },
    });
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, bottom: 16 },
      head: [cabEl],
      body: pares,
      styles: { font: 'OpenSans', fontSize: 8.3, textColor: TEXTO, cellPadding: 1.3, lineColor: LINHA, lineWidth: 0.1, overflow: 'linebreak' },
      headStyles: { font: 'OpenSans', fontStyle: 'bold', fillColor: AZUL, textColor: 255 },
      alternateRowStyles: { fillColor: CLARO },
      columnStyles: { ...colEl(0), 5: { cellWidth: 4, fillColor: [255, 255, 255], lineWidth: 0 }, ...colEl(6) },
      didParseCell: (d) => {
        if (d.column.index === 5) {
          d.cell.styles.fillColor = [255, 255, 255];
          d.cell.styles.lineWidth = 0;
        }
        if (d.section === 'body' && (d.column.index === 1 || d.column.index === 7) && d.cell.raw === 'SEM CAMINHÃO') {
          d.cell.styles.textColor = ALERTA;
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
    if (!todos.length) {
      doc.setFont('OpenSans', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MEDIO);
      doc.text('Nenhum elemento informado.', M, y);
      y += 6;
    }
    if (falta.length) {
      doc.setFont('OpenSans', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...ALERTA);
      const t = doc.splitTextToSize(`Elementos sem caminhão (${falta.length}): ${juntarElementos(falta)}`, L - 2 * M);
      doc.text(t, M, y);
      y += 4.5 * t.length + 2;
    }
  }

  // ---- assinaturas ----
  // sempre ao pé da página; se não couber, vai para uma página nova
  if (y + 4 > A - 37) doc.addPage();
  y = A - 37;
  const ass = [['Inspecionado por', mr.inspecionadoPor], ['Visto', mr.visto], ['Aprovação Final', mr.aprovacaoFinal]];
  const largA = (L - 2 * M - 2 * 12) / 3;
  ass.forEach(([rotulo, nome], i) => {
    const x = M + i * (largA + 12);
    doc.setDrawColor(...TEXTO);
    doc.setLineWidth(0.3);
    doc.line(x, y + 12, x + largA, y + 12);
    doc.setFont('OpenSans', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...AZUL);
    doc.text(rotulo, x, y + 16.5);
    doc.setFont('OpenSans', 'normal');
    doc.setTextColor(...TEXTO);
    if (nome) doc.text(nome, x, y + 21);
  });

  // ---- Laje: mapa em A3 ----
  if (ehLaje && extra.prancha) {
    await paginaMapa(doc, f, mr, ordenados, regioes, extra.prancha, extra.opacidade ?? 0.33);
  }

  // ---- rodapé ----
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const Lp = doc.internal.pageSize.getWidth();
    const Ap = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...OURO);
    doc.setLineWidth(0.5);
    doc.line(M, Ap - 11, Lp - M, Ap - 11);
    doc.setFont('OpenSans', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MEDIO);
    doc.text(`Construtora Arco-Íris-Mar · ${obra?.nome || ''} · MR ${tipo.rotulo} · ${mr.local} · ${fmtDataBr(mr.data)} · emitido em ${fmtDataHora(emissao)}`, M, Ap - 6.5, { maxWidth: Lp - 2 * M - 30 });
    doc.text(`Página ${i} de ${total}`, Lp - M, Ap - 6.5, { align: 'right' });
  }

  return new File([doc.output('blob')], nomeArquivoMr(mr, 'pdf'), { type: 'application/pdf' });
}

function titulo(doc, texto, x, y) {
  doc.setFont('Poppins', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(...AZUL);
  doc.text(texto, x, y);
}

// ---------- mapa da laje ----------

const PX_POR_MM = 8; // ~200 dpi na impressão

// Retângulo [x, y, l, a] em pt com tudo o que não é branco na página, mais as regiões, com folga.
async function areaDesenhada(pagina, regioes) {
  const vp1 = pagina.getViewport({ scale: 1 });
  const k = Math.min(1, 1200 / Math.max(vp1.width, vp1.height));
  const vp = pagina.getViewport({ scale: k });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  await pagina.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise; // 'print': não depende de quadros de animação (segue mesmo com o app em segundo plano)
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  c.width = 0;
  c.height = 0;
  if (x1 < x0) return [0, 0, vp1.width, vp1.height]; // página em branco
  x0 /= k; y0 /= k; x1 = (x1 + 1) / k; y1 = (y1 + 1) / k;
  for (const r of regioes) {
    for (const [x, y] of r.pontos) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const folga = 0.012 * Math.max(x1 - x0, y1 - y0);
  x0 = Math.max(0, x0 - folga);
  y0 = Math.max(0, y0 - folga);
  x1 = Math.min(vp1.width, x1 + folga);
  y1 = Math.min(vp1.height, y1 + folga);
  return [x0, y0, x1 - x0, y1 - y0];
}

// Prancha + regiões numeradas como JPEG, no tamanho que cabe na caixa (mm).
async function imagemMapa(prancha, regioes, ordenados, opacidade, caixaL, caixaA) {
  const { abrirPdf } = await import('./planta.js');
  const pdf = await abrirPdf(prancha.pdf);
  try {
    const pagina = await pdf.getPage(Math.min(prancha.pagina || 1, pdf.numPages));
    // recorte: só a parte desenhada da prancha (sem a margem branca), sem cortar nenhuma região
    const [bx, by, bw, bh] = await areaDesenhada(pagina, regioes);
    const mmPorPt = Math.min(caixaL / bw, caixaA / bh);
    const escala = limitarEscala(bw, bh, mmPorPt * PX_POR_MM);
    const vp = pagina.getViewport({ scale: escala, offsetX: -bx * escala, offsetY: -by * escala });
    const c = document.createElement('canvas');
    c.width = Math.floor(bw * escala);
    c.height = Math.floor(bh * escala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    await pagina.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise; // 'print': não depende de quadros de animação (segue mesmo com o app em segundo plano)

    const pxPorMm = escala / mmPorPt;
    const porId = new Map(ordenados.map((x) => [x.id, x]));
    // regiões (pontos em pt da prancha); a última fica por cima
    ctx.setTransform(escala, 0, 0, escala, -bx * escala, -by * escala);
    ctx.lineJoin = 'round';
    for (const r of regioes) {
      const cam = porId.get(r.caminhaoId);
      const cor = cam ? corDoItem(cam.item) : '#777777';
      const p = r.pontos;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fillStyle = rgba(cor, opacidade);
      ctx.fill('nonzero');
      ctx.lineWidth = (0.35 * pxPorMm) / escala;
      ctx.strokeStyle = cor;
      ctx.stroke();
    }
    // números: tamanho fixo no papel
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of regioes) {
      const cam = porId.get(r.caminhaoId);
      const cor = cam ? corDoItem(cam.item) : '#777777';
      const [rx, ry] = pontoRotulo(r.pontos);
      const x = (rx - bx) * escala;
      const y = (ry - by) * escala;
      const txt = String(cam?.item ?? '?');
      const raio = (txt.length > 1 ? 2.9 : 2.5) * pxPorMm;
      ctx.beginPath();
      ctx.arc(x, y, raio, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 0.55 * pxPorMm;
      ctx.strokeStyle = cor;
      ctx.stroke();
      ctx.fillStyle = '#1A1A1A';
      ctx.font = `700 ${Math.round(3.1 * pxPorMm)}px Helvetica, Arial, sans-serif`;
      ctx.fillText(txt, x, y + 0.04 * raio);
    }
    const dados = c.toDataURL('image/jpeg', 0.9);
    const res = { dados, l: bw * mmPorPt, a: bh * mmPorPt };
    c.width = 0;
    c.height = 0;
    return res;
  } finally {
    pdf.destroy();
  }
}

async function paginaMapa(doc, f, mr, ordenados, regioes, prancha, opacidade) {
  doc.addPage('a3', 'landscape');
  const L = 420;
  const A = 297;
  const M = 12;
  const legL = 84;          // coluna da legenda
  const topo = 27;
  const base = A - 15;

  // cabeçalho
  const logoL = 42;
  doc.addImage(f.logo, 'JPEG', L - M - logoL, 8, logoL, logoL / LOGO_PROPORCAO);
  doc.setFont('Poppins', 'normal');
  doc.setFontSize(15);
  doc.setTextColor(...AZUL);
  doc.text('Mapa da concretagem — locais de aplicação por caminhão', M, 14);
  doc.setFont('OpenSans', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MEDIO);
  doc.text(`${mr.local} · ${fmtDataBr(mr.data)} · Prancha: ${prancha.nome}${prancha.pagina > 1 ? ` (pág. ${prancha.pagina})` : ''}`, M, 20, { maxWidth: L - 2 * M - logoL - 6 });
  doc.setDrawColor(...OURO);
  doc.setLineWidth(0.8);
  doc.line(M, 23, L - M, 23);

  // mapa
  const caixaL = L - 2 * M - legL - 6;
  const caixaA = base - topo - 4;
  const img = await imagemMapa(prancha, regioes, ordenados, opacidade, caixaL, caixaA);
  const ix = M + (caixaL - img.l) / 2;
  const iy = topo + 4;
  doc.addImage(img.dados, 'JPEG', ix, iy, img.l, img.a);
  doc.setDrawColor(...LINHA);
  doc.setLineWidth(0.3);
  doc.rect(ix, iy, img.l, img.a);

  // legenda
  const lx = L - M - legL;
  titulo(doc, 'Legenda', lx, topo + 4);
  doc.setFont('OpenSans', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...MEDIO);
  doc.text('Número no mapa = Item do caminhão.', lx, topo + 9);
  const nReg = (c) => regioes.filter((r) => r.caminhaoId === c.id).length;
  doc.autoTable({
    startY: topo + 12,
    margin: { left: lx, right: M, bottom: 16 },
    tableWidth: legL,
    head: [['Item', 'NF', 'HI–HT', 'Vol']],
    body: ordenados.map((c) => [
      String(c.item),
      c.nf != null ? String(c.nf) : '—',
      c.hi || c.ht ? `${c.hi || "—"}–${c.ht || "—"}` : "—",
      c.vol != null ? fmtNumero(c.vol) : '—',
    ]),
    styles: { font: 'OpenSans', fontSize: 8, textColor: TEXTO, cellPadding: 1.2, lineColor: LINHA, lineWidth: 0.1 },
    headStyles: { font: 'OpenSans', fontStyle: 'bold', fillColor: AZUL, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 22 },
      2: { cellWidth: 33 },
      3: { cellWidth: 16, halign: 'right' },
    },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const c = ordenados[d.row.index];
      if (d.column.index === 0) {
        d.cell.styles.fillColor = hexParaRgb(corDoItem(c.item));
        d.cell.styles.textColor = 255;
      }
      if (!nReg(c)) d.cell.styles.textColor = d.column.index === 0 ? 255 : ALERTA;
    },
  });
  const sem = ordenados.filter((c) => !nReg(c));
  if (sem.length) {
    const yy = doc.lastAutoTable.finalY + 5;
    doc.setFont('OpenSans', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...ALERTA);
    doc.text(doc.splitTextToSize(`Sem região no mapa: ${sem.map((c) => c.item).join(', ')}.`, legL), lx, yy);
  }
}
