// Instruções de uso: um único conteúdo, mostrado na tela "Como usar" e exportado em PDF.
import { montar } from './nav.js';
import { el } from './util.js';
import { icone, carregando, alerta, oferecerArquivo } from './ui.js';

export const VERSAO_APP = '1.0';
const LOGO = 'assets/logo-arcoirismar.png';
const ENDERECO = 'https://jonathanvieiraeng-design.github.io/rastreamento-concretagem/';

// Blocos: p (parágrafo), passos (lista numerada), lista (marcadores), aviso (destaque).
const CONTEUDO = [
  {
    titulo: '1. Instalar no iPad',
    blocos: [
      { tipo: 'passos', itens: [
        `Abra o Safari e acesse ${ENDERECO}`,
        'Toque em Compartilhar → "Adicionar à Tela de Início".',
        'Abra o app pela Tela de Início uma vez com internet. A partir daí ele funciona sem internet (inclusive em modo avião).',
      ] },
      { tipo: 'p', texto: 'Atualizações: com internet, aparece a faixa "Nova versão disponível — Recarregar". Toque em Recarregar. Se não aparecer, feche o app pelo multitarefa e abra de novo.' },
      { tipo: 'aviso', texto: 'Os dados ficam somente neste iPad. Antes de apagar o app, limpar "Dados de sites" do Safari ou trocar de iPad, faça um backup (seção 9).' },
    ],
  },
  {
    titulo: '2. Preparação (antes da concretagem)',
    blocos: [
      { tipo: 'lista', itens: [
        'Pilares: crie a lista de elementos em "Cadastros de elementos" → "Novo cadastro": escolha a obra, dê um nome e cole a lista separada por ponto e vírgula (P11; P12; PA4) ou um elemento por linha.',
        'Laje: deixe a prancha de forma em PDF acessível no iPad (app Arquivos ou OneDrive).',
      ] },
    ],
  },
  {
    titulo: '3. Criar o MR',
    blocos: [
      { tipo: 'passos', itens: [
        'Na tela inicial, toque em "Novo MR".',
        'Escolha a obra (ou "Nova obra") e o tipo: Pilares ou Laje.',
        'Preencha local, data e especificação do concreto (vem a última usada).',
        'Pilares: escolha um cadastro ou cole a lista de elementos.',
        'Assinaturas: vêm do último MR; pode deixar em branco e preencher depois.',
        'Toque em "Criar MR".',
      ] },
      { tipo: 'p', texto: 'Para corrigir o cabeçalho depois, use o lápis no topo do MR. Para excluir um MR e começar de novo, toque na lixeira do cartão dele na tela inicial (ou em "Excluir MR" no cabeçalho) e digite EXCLUIR. Isso apaga o MR, os caminhões, os desenhos e a prancha dele; não dá para desfazer.' },
    ],
  },
  {
    titulo: '4. MR de Pilares — durante a concretagem',
    blocos: [
      { tipo: 'passos', itens: [
        'A cada betoneira, toque em "Chegou caminhão" e preencha NF, Bet e Vol.',
        'Toque em "HI agora" no início da descarga e em "HT agora" no fim (ou digite a hora). Se já houver hora, o app pede confirmação para trocar.',
        'Toque em "Elementos" e marque os elementos que o caminhão concretou.',
      ] },
      { tipo: 'lista', itens: [
        'Elemento já ligado a outro caminhão: o app pergunta se ele foi completado por este caminhão também.',
        'Elemento fora da lista: digite em "Elemento livre" e toque em Adicionar.',
        'NF repetida em dois caminhões: aparece um aviso amarelo.',
        'Lixeira do caminhão: exclui e renumera os caminhões seguintes.',
        'O painel mostra volume total, início, término e os elementos ainda sem caminhão ("Não vinculados").',
      ] },
    ],
  },
  {
    titulo: '5. MR de Laje — durante a concretagem',
    blocos: [
      { tipo: 'passos', itens: [
        'Na primeira vez, toque em "Carregar prancha" e escolha o PDF da forma (e a página, se houver mais de uma).',
        'A cada betoneira, toque em "Chegou caminhão". Ele fica ativo, com a cor dele, e o cartão à direita recebe NF, Bet, Vol, HI e HT.',
        'Com a Apple Pencil, contorne a área concretada por esse caminhão. Ao soltar a caneta, o contorno fecha e é pintado com a cor do caminhão. Pode desenhar mais de uma região por caminhão.',
      ] },
      { tipo: 'lista', itens: [
        'Só a Apple Pencil desenha. O dedo arrasta e amplia (pinça). Botões +, − e "ver a prancha inteira" ficam à direita.',
        'Se a mão apoiada mexer a prancha, use o cadeado para travar zoom e arraste.',
        'Para trocar o caminhão ativo, toque no número dele em "Caminhões".',
        'Toque numa região com o dedo para trocá-la de caminhão ou apagá-la.',
        'Setas no topo: desfazer e refazer (valem enquanto a tela está aberta).',
        'Ícone de lista no topo: legenda. Engrenagem: opacidade do preenchimento e trocar a prancha.',
        '"sem reg." em vermelho: caminhão ainda sem região desenhada.',
        'Excluir um caminhão apaga as regiões dele e renumera os seguintes (as cores acompanham o número).',
      ] },
    ],
  },
  {
    titulo: '6. Concluir e gerar o relatório',
    blocos: [
      { tipo: 'passos', itens: [
        'Ao terminar, toque em "Concluir concretagem". O app mostra o que está faltando; você pode voltar e completar ou concluir assim.',
        'Em seguida o app oferece o backup. Recomendado: aceite.',
        'Toque em "Relatório PDF" → Compartilhar → "Salvar em Arquivos" → pasta da obra no OneDrive.',
      ] },
      { tipo: 'lista', itens: [
        'Pilares: resumo, tabela de caminhões e rastreamento por elemento.',
        'Laje: resumo, tabela de caminhões (Item na cor do mapa) e página A3 com o mapa e a legenda.',
        '"Reabrir" volta o MR para "Em campo".',
      ] },
    ],
  },
  {
    titulo: '7. Resultados de TCP (teste de corpo de prova)',
    blocos: [
      { tipo: 'passos', itens: [
        'No MR, toque em "Resultados de TCP (MPa)".',
        'Digite os resultados de 7, 28 e 60 dias de cada caminhão (1 casa decimal; vírgula ou ponto). Grava sozinho.',
        'Gere o relatório de novo para que ele saia com os TCPs.',
      ] },
      { tipo: 'lista', itens: [
        '"prev." é a data da concretagem mais a idade, só como referência.',
        'O MR passa a "TCPs completos" quando todos os caminhões têm TCP de 7 e 28 dias.',
        'O app não classifica os resultados; a análise é do engenheiro.',
      ] },
    ],
  },
  {
    titulo: '8. Busca e filtros',
    blocos: [
      { tipo: 'lista', itens: [
        'No campo "Buscar" da tela inicial, digite um NF, uma Bet ou um elemento (ex.: 140537, P11).',
        'Toque no resultado para abrir o MR já no caminhão. Na laje, a região dele aparece destacada no mapa.',
        '"SEM CAMINHÃO" indica elemento do MR que não foi ligado a nenhum caminhão.',
        'Sem busca, a lista de MRs pode ser filtrada por tipo, obra e mês.',
      ] },
    ],
  },
  {
    titulo: '9. Backup e troca de iPad',
    blocos: [
      { tipo: 'passos', itens: [
        'Tela inicial → "Fazer backup" → Compartilhar → "Salvar em Arquivos" → pasta do OneDrive.',
        'O arquivo BACKUP-MR-(data).json guarda tudo: obras, cadastros, MRs, caminhões, desenhos e pranchas.',
      ] },
      { tipo: 'lista', itens: [
        'Quando fazer: ao concluir cada concretagem (o app pergunta) e no mínimo a cada 30 dias (a tela inicial avisa).',
        'Restaurar: "Restaurar backup" e escolha o arquivo .json. Os dados são juntados: o que é novo entra, o que existe nos dois fica com a versão mais recente, nada é apagado.',
        'Trocar de iPad: faça o backup no antigo, instale o app no novo (seção 1) e use "Restaurar backup".',
      ] },
    ],
  },
  {
    titulo: '10. Se algo der errado',
    blocos: [
      { tipo: 'lista', itens: [
        'A prancha não abre: engrenagem → "Trocar prancha" e carregue o PDF de novo.',
        'O app não atualiza: feche pelo multitarefa e abra com internet.',
        'A palma mexe a prancha: trave com o cadeado.',
        'O relatório demora: aguarde com o app aberto na tela.',
      ] },
    ],
  },
];

// ---------- tela ----------

export function telaAjuda() {
  const bloco = (b) => {
    if (b.tipo === 'p') return el('p', {}, b.texto);
    if (b.tipo === 'aviso') return el('p', { class: 'nota-destaque' }, b.texto);
    return el(b.tipo === 'passos' ? 'ol' : 'ul', { class: 'lista-ajuda' }, b.itens.map((t) => el('li', {}, t)));
  };
  const raiz = el('div', { class: 'tela' },
    el('header', { class: 'topo' },
      el('a', { class: 'btn-icone', href: '#/', 'aria-label': 'Voltar' }, icone('voltar')),
      el('img', { class: 'logo-topo', src: LOGO, alt: 'Construtora Arco-Íris-Mar' }),
      el('div', { class: 'topo-titulo' }, el('strong', {}, 'Como usar'), el('small', {}, `Rastreamento de Concretagem · versão ${VERSAO_APP}`)),
      el('button', { type: 'button', class: 'btn-icone', title: 'Instruções em PDF', 'aria-label': 'Instruções em PDF', onclick: oferecerPdf }, icone('relatorio'))),
    el('div', { class: 'rolavel form ajuda' },
      el('button', { type: 'button', class: 'btn btn-primario', onclick: oferecerPdf }, icone('relatorio'), 'Instruções em PDF (para salvar ou imprimir)'),
      ...CONTEUDO.map((s) => el('section', { class: 'secao-ajuda' }, el('h2', {}, s.titulo), ...s.blocos.map(bloco)))));
  montar(raiz);
}

async function oferecerPdf() {
  const fim = carregando('Gerando PDF…');
  let arquivo;
  try {
    arquivo = await gerarPdfAjuda();
  } catch (e) {
    console.error(e);
    alerta(`Não foi possível gerar o PDF: ${e.message}`, 'Erro');
    return;
  } finally {
    fim();
  }
  await oferecerArquivo(arquivo, { titulo: 'Instruções prontas', texto: 'Toque em Compartilhar para salvar no OneDrive ou imprimir.' });
}

// ---------- PDF (A4 retrato) ----------

export async function gerarPdfAjuda() {
  const { novoDocumento, LOGO_PROPORCAO, AZUL, OURO, TEXTO, MEDIO } = await import('./relatorio.js');
  const { doc, f } = await novoDocumento({ orientation: 'portrait' });
  const L = 210;
  const A = 297;
  const M = 16;
  const larg = L - 2 * M;
  const BASE = A - 18;
  let y;

  const cabecalho = (primeira) => {
    const logoL = primeira ? 52 : 34;
    doc.addImage(f.logo, 'JPEG', L - M - logoL, 10, logoL, logoL / LOGO_PROPORCAO);
    doc.setFont('Poppins', 'normal');
    doc.setTextColor(...AZUL);
    if (primeira) {
      doc.setFontSize(19);
      doc.text('Rastreamento de Concretagem', M, 20);
      doc.setFont('OpenSans', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...MEDIO);
      doc.text(`Instruções de uso · versão ${VERSAO_APP}`, M, 27);
      doc.setDrawColor(...OURO);
      doc.setLineWidth(0.8);
      doc.line(M, 31, L - M, 31);
      y = 40;
    } else {
      doc.setFontSize(11);
      doc.text('Rastreamento de Concretagem — instruções de uso', M, 16);
      doc.setDrawColor(...OURO);
      doc.setLineWidth(0.5);
      doc.line(M, 20, L - M, 20);
      y = 28;
    }
  };
  const garantir = (alt) => {
    if (y + alt > BASE) {
      doc.addPage();
      cabecalho(false);
    }
  };
  const texto = (t, x, largura, { negrito = false, cor = TEXTO, tam = 10 } = {}) => {
    doc.setFont('OpenSans', negrito ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    // a fonte embutida não tem a seta "→": no PDF vira ">"
    const linhas = doc.splitTextToSize(t.replace(/→/g, ">"), largura);
    const alt = linhas.length * tam * 0.42;
    return { linhas, alt };
  };

  cabecalho(true);
  for (const s of CONTEUDO) {
    garantir(22);
    doc.setFont('Poppins', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(...AZUL);
    doc.text(s.titulo, M, y);
    y += 7;
    for (const b of s.blocos) {
      if (b.tipo === 'p' || b.tipo === 'aviso') {
        const aviso = b.tipo === 'aviso';
        const x = aviso ? M + 4 : M;
        const { linhas, alt } = texto(b.texto, x, larg - (aviso ? 8 : 0), { negrito: aviso });
        garantir(alt + (aviso ? 6 : 2));
        if (aviso) {
          doc.setFillColor(251, 246, 234);
          doc.rect(M, y - 4.2, larg, alt + 4, 'F');
          doc.setFillColor(...OURO);
          doc.rect(M, y - 4.2, 1.2, alt + 4, 'F');
        }
        doc.setFont('OpenSans', aviso ? 'bold' : 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...TEXTO);
        doc.text(linhas, x, y);
        y += alt + (aviso ? 5 : 3);
      } else {
        b.itens.forEach((t, i) => {
          const marca = b.tipo === 'passos' ? `${i + 1}.` : '•';
          const { linhas, alt } = texto(t, M + 7, larg - 7);
          garantir(alt + 1.5);
          doc.setFont('OpenSans', 'bold');
          doc.setTextColor(...AZUL);
          doc.text(marca, M + 1, y);
          doc.setFont('OpenSans', 'normal');
          doc.setTextColor(...TEXTO);
          doc.text(linhas, M + 7, y);
          y += alt + 1.6;
        });
        y += 1.6;
      }
    }
    y += 3;
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...OURO);
    doc.setLineWidth(0.5);
    doc.line(M, A - 12, L - M, A - 12);
    doc.setFont('OpenSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MEDIO);
    doc.text(`Construtora Arco-Íris-Mar · Rastreamento de Concretagem · versão ${VERSAO_APP}`, M, A - 7.5);
    doc.text(`Página ${i} de ${total}`, L - M, A - 7.5, { align: 'right' });
  }
  return new File([doc.output('blob')], `Instrucoes-Rastreamento-de-Concretagem-v${VERSAO_APP}.pdf`, { type: 'application/pdf' });
}
