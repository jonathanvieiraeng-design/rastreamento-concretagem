// Relatório do MR em PDF (jsPDF + autotable), na identidade da Construtora Arco-Íris-Mar.
// A4 paisagem: cabeçalho, resumo, tabela de caminhões, rastreamento por elemento e assinaturas.
import { bufParaBase64 } from './util.js';
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
  const img = new Image();
  img.src = LOGO;
  await img.decode();
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

export async function gerarRelatorioMr(mr, obra, caminhoes) {
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
  const cab = ['Item', 'NF', 'Bet', 'HI', 'HT', 'Descarga', 'Vol (m³)', 'Acum. (m³)', 'TC 7d', 'TC 28d', 'TC 60d'];
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
  doc.autoTable({
    startY: y,
    margin: { left: M, right: M, bottom: 16 },
    head: [cab],
    body: corpo.length ? corpo : [[{ content: 'Nenhum caminhão registrado.', colSpan: cab.length }]],
    styles: { font: 'OpenSans', fontSize: 8.8, textColor: TEXTO, cellPadding: 1.6, lineColor: LINHA, lineWidth: 0.1, overflow: 'linebreak', valign: 'middle' },
    headStyles: { font: 'OpenSans', fontStyle: 'bold', fillColor: AZUL, textColor: 255 },
    alternateRowStyles: { fillColor: CLARO },
    columnStyles: colunas,
  });
  y = doc.lastAutoTable.finalY + 8;

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

  // ---- rodapé ----
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...OURO);
    doc.setLineWidth(0.5);
    doc.line(M, A - 11, L - M, A - 11);
    doc.setFont('OpenSans', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MEDIO);
    doc.text(`Construtora Arco-Íris-Mar · ${obra?.nome || ''} · MR ${tipo.rotulo} · ${mr.local} · ${fmtDataBr(mr.data)} · emitido em ${fmtDataHora(emissao)}`, M, A - 6.5, { maxWidth: L - 2 * M - 30 });
    doc.text(`Página ${i} de ${total}`, L - M, A - 6.5, { align: 'right' });
  }

  return new File([doc.output('blob')], nomeArquivoMr(mr, 'pdf'), { type: 'application/pdf' });
}

function titulo(doc, texto, x, y) {
  doc.setFont('Poppins', 'normal');
  doc.setFontSize(11.5);
  doc.setTextColor(...AZUL);
  doc.text(texto, x, y);
}
