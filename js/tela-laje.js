// Protótipo da Etapa 2: desenho das regiões da laje com a Apple Pencil.
// Um único MR de teste ("prototipo-laje"): prancha, caminhões e regiões, gravados a cada alteração.
import * as db from './db.js';
import { Planta, abrirPdf } from './planta.js';
import { corDoItem } from './cores.js';
import { el, uid } from './util.js';
import { icone, abrirModal, confirmar, escolher, toast, carregando, alerta } from './ui.js';
import { montar } from './nav.js';

const VERSAO_APP = 'Protótipo 1 (Etapa 2)';
const MR_ID = 'prototipo-laje';
const LOGO = 'assets/logo-arcoirismar.png';



const est = {
  mr: null,
  prancha: null,
  caminhoes: [],
  regioes: [],
  opacidade: 0.33,
  desfazer: [],
  refazer: [],
  legendaAberta: false,
};
let planta = null;
let ui = {};

// ---------- dados ----------

async function carregarDados() {
  est.mr = (await db.obter('mrs', MR_ID)) || { id: MR_ID, tipo: 'laje', local: 'Protótipo', caminhaoAtivoId: null, pranchaId: null };
  est.prancha = est.mr.pranchaId ? await db.obter('pranchas', est.mr.pranchaId) : null;
  est.caminhoes = (await db.listarDoMr('caminhoes', MR_ID)).sort((a, b) => a.item - b.item);
  est.regioes = (await db.listarDoMr('regioes', MR_ID)).sort((a, b) => a.ordem - b.ordem);
  est.opacidade = (await db.obterMeta('opacidade')) ?? 0.33;
  est.mouseDesenha = (await db.obterMeta('mouseDesenha')) ?? false;
}

const salvarMr = () => db.gravar('mrs', est.mr);
const caminhaoPorId = (id) => est.caminhoes.find((c) => c.id === id);
const ativo = () => caminhaoPorId(est.mr.caminhaoAtivoId);

// ---------- tela ----------

function montarTela() {
  const botao = (nome, titulo, onclick, extra = {}) =>
    el('button', { type: 'button', class: 'btn-icone', title: titulo, 'aria-label': titulo, onclick, ...extra }, icone(nome));

  ui.btDesfazer = botao('desfazer', 'Desfazer', () => desfazer());
  ui.btRefazer = botao('refazer', 'Refazer', () => refazer());
  ui.btLegenda = botao('legenda', 'Legenda', () => alternarLegenda());

  const topo = el('header', { class: 'topo' },
    el('a', { class: 'btn-icone', href: '#/', 'aria-label': 'Voltar' }, icone('voltar')),
    el('img', { class: 'logo-topo', src: LOGO, alt: 'Arco-Íris-Mar' }),
    el('div', { class: 'topo-titulo' },
      el('strong', {}, 'MR Laje — protótipo do desenho'),
      ui.subtitulo = el('small', {}, '')),
    ui.btDesfazer, ui.btRefazer, ui.btLegenda,
    botao('config', 'Configurações', () => abrirConfiguracoes()));

  ui.area = el('div', { class: 'area-planta' });
  ui.dica = el('div', { class: 'dica-edicao' });
  ui.btTrava = el('button', {
    type: 'button', class: 'btn-flutuante', title: 'Travar zoom/arraste', 'aria-label': 'Travar zoom e arraste',
    onclick: () => alternarTrava(),
  }, icone('cadeado'));
  const flut = (nome, titulo, onclick) =>
    el('button', { type: 'button', class: 'btn-flutuante', title: titulo, 'aria-label': titulo, onclick }, icone(nome));
  ui.controles = el('div', { class: 'controles-planta' },
    flut('mais', 'Aproximar', () => planta?.zoomCentro(1.6)),
    flut('menos', 'Afastar', () => planta?.zoomCentro(1 / 1.6)),
    flut('ajustar', 'Ver a prancha inteira', () => planta?.ajustar()),
    ui.btTrava);
  ui.legenda = el('aside', { class: 'painel-legenda', hidden: true });
  ui.vazio = el('div', { class: 'carregando-planta' });
  ui.area.append(ui.vazio, ui.dica, ui.controles, ui.legenda);

  ui.chips = el('div', { class: 'chips-caminhoes' });
  const barra = el('footer', { class: 'barra-caminhoes' },
    ui.chips,
    el('button', { type: 'button', class: 'btn btn-primario btn-novo-caminhao', onclick: () => adicionarCaminhao() },
      icone('mais'), 'Caminhão'));

  montar(el('div', { class: 'tela tela-laje' }, topo, ui.area, barra), () => { planta?.destruir(); planta = null; });
}

async function abrirPlanta() {
  planta?.destruir();
  planta = null;
  if (!est.prancha) {
    ui.vazio.hidden = false;
    ui.vazio.replaceChildren(
      el('p', {}, 'Carregue a prancha de forma da laje (PDF) para começar.'),
      el('button', { type: 'button', class: 'btn btn-primario', onclick: () => escolherPrancha() }, icone('prancha'), 'Carregar prancha'));
    atualizarTudo();
    return;
  }
  ui.vazio.hidden = false;
  ui.vazio.replaceChildren(el('div', { class: 'girador' }), el('span', {}, 'Abrindo a prancha…'));
  planta = new Planta(ui.area, {
    podeDesenhar: () => !!ativo(),
    aoNaoPoderDesenhar: () => toast('Escolha ou adicione um caminhão antes de desenhar.'),
    aoFecharContorno: (pts) => novaRegiao(pts),
    aoDescartarTraco: (motivo) => toast(motivo === 'pequeno' ? 'Traço muito curto: ignorado.' : 'Traço interrompido: desenhe de novo.'),
    aoTocar: (px, py) => tocarNaPrancha(px, py),
  });
  // a vista fica atrás dos controles
  ui.area.prepend(planta.vista);
  planta.mouseDesenha = est.mouseDesenha;
  planta.setOpacidade(est.opacidade);
  try {
    await planta.carregar(est.prancha.pdf, est.prancha.pagina);
    ui.vazio.hidden = true;
  } catch (e) {
    console.error(e);
    ui.vazio.replaceChildren(el('p', { class: 'erro' }, 'Não foi possível abrir a prancha.'),
      el('button', { type: 'button', class: 'btn', onclick: () => escolherPrancha() }, 'Carregar outra'));
  }
  atualizarTudo();
}

function atualizarTudo() {
  const a = ativo();
  if (planta) {
    planta.corTraco = a ? corDoItem(a.item) : '#000';
    planta.setRegioes(est.regioes.map((r) => {
      const c = caminhaoPorId(r.caminhaoId);
      return { id: r.id, pontos: r.pontos, item: c?.item ?? '?', cor: c ? corDoItem(c.item) : '#777' };
    }));
  }
  // subtítulo
  ui.subtitulo.textContent = est.prancha
    ? `${est.prancha.nome}${est.prancha.pagina > 1 ? ` · pág. ${est.prancha.pagina}` : ''} · ${est.caminhoes.length} caminhão(ões) · ${est.regioes.length} região(ões)`
    : 'Sem prancha';
  // dica
  if (!est.prancha) {
    ui.dica.hidden = true;
  } else {
    ui.dica.hidden = false;
    ui.dica.replaceChildren(a
      ? el('span', {}, el('span', { class: 'amostra', style: { background: corDoItem(a.item) } }),
        el('b', {}, ` Caminhão ${a.item}`), ' · desenhe o contorno com a Apple Pencil. Dedo: mover e ampliar. Toque numa região para editar.')
      : el('span', {}, 'Toque em ', el('b', {}, '+ Caminhão'), ' para começar a desenhar.'));
  }
  // chips
  ui.chips.replaceChildren(...est.caminhoes.map((c) => {
    const n = est.regioes.filter((r) => r.caminhaoId === c.id).length;
    return el('button', {
      type: 'button',
      class: `chip-caminhao${c.id === est.mr.caminhaoAtivoId ? ' ativo' : ''}`,
      style: { '--cor': corDoItem(c.item) },
      onclick: () => ativar(c.id),
    }, el('span', { class: 'chip-num' }, String(c.item)), el('small', {}, n ? `${n} reg.` : '—'));
  }));
  ui.chips.querySelector('.ativo')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  ui.btDesfazer.disabled = !est.desfazer.length;
  ui.btRefazer.disabled = !est.refazer.length;
  ui.btTrava.classList.toggle('ativo', !!planta?.navegacaoTravada);
  ui.btLegenda.classList.toggle('ativo', est.legendaAberta);
  desenharLegenda();
}

function desenharLegenda() {
  ui.legenda.hidden = !est.legendaAberta;
  if (!est.legendaAberta) return;
  ui.legenda.replaceChildren(
    el('h2', {}, 'Legenda'),
    est.caminhoes.length
      ? el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Cam.'), el('th', {}, 'Cor'), el('th', {}, 'NF'), el('th', {}, 'Vol (m³)'))),
        el('tbody', {}, est.caminhoes.map((c) => el('tr', { onclick: () => ativar(c.id), class: c.id === est.mr.caminhaoAtivoId ? 'ativo' : '' },
          el('td', {}, String(c.item)),
          el('td', {}, el('span', { class: 'amostra', style: { background: corDoItem(c.item) } })),
          el('td', {}, c.nf ?? '—'),
          el('td', {}, c.vol ?? '—')))))
      : el('p', { class: 'nota' }, 'Nenhum caminhão ainda.'),
    el('p', { class: 'nota' }, 'NF e volume entram na Etapa 4.'));
}

// ---------- ações ----------

async function ativar(id) {
  est.mr.caminhaoAtivoId = id;
  await salvarMr();
  atualizarTudo();
}

async function adicionarCaminhao() {
  const c = { id: uid(), mrId: MR_ID, item: est.caminhoes.length + 1 };
  await db.gravar('caminhoes', c);
  est.caminhoes.push(c);
  await ativar(c.id);
  toast(`Caminhão ${c.item} ativo.`);
}

async function novaRegiao(pontos) {
  const a = ativo();
  if (!a) return;
  const ordem = (est.regioes.at(-1)?.ordem ?? 0) + 1;
  const r = { id: uid(), mrId: MR_ID, caminhaoId: a.id, pontos, ordem };
  await executar({ t: 'add', r });
}

async function tocarNaPrancha(px, py) {
  const alvo = planta.regiaoEm(px, py);
  if (!alvo) return;
  const r = est.regioes.find((x) => x.id === alvo.id);
  const c = caminhaoPorId(r.caminhaoId);
  planta.selecionar(r.id);
  const op = await escolher({
    titulo: `Região do caminhão ${c?.item ?? '?'}`,
    opcoes: [
      { rotulo: 'Trocar de caminhão', valor: 'trocar', classe: 'btn-primario' },
      { rotulo: 'Apagar região', valor: 'apagar', classe: 'btn-texto-perigo' },
      { rotulo: 'Cancelar', valor: null },
    ],
  });
  if (op === 'apagar') {
    if (await confirmar(`Apagar esta região do caminhão ${c?.item ?? '?'}?`, { titulo: 'Apagar região', rotuloOk: 'Apagar', perigo: true })) {
      await executar({ t: 'del', r });
    }
  } else if (op === 'trocar') {
    const outros = est.caminhoes.filter((x) => x.id !== r.caminhaoId);
    if (!outros.length) {
      await alerta('Não há outro caminhão. Adicione um caminhão primeiro.');
    } else {
      const para = await escolher({
        titulo: 'Mover a região para o caminhão',
        classe: 'modal-grade',
        opcoes: [...outros.map((x) => ({
          rotulo: String(x.item), valor: x.id, classe: 'btn-cor', estilo: { '--cor': corDoItem(x.item) },
        })), { rotulo: 'Cancelar', valor: null }],
      });
      if (para) await executar({ t: 'trocar', id: r.id, de: r.caminhaoId, para });
    }
  }
  planta?.selecionar(null);
}

// ---------- desfazer / refazer ----------

async function aplicar(cmd, inverso) {
  const { t } = cmd;
  if ((t === 'add' && !inverso) || (t === 'del' && inverso)) {
    await db.gravar('regioes', cmd.r);
    est.regioes.push(cmd.r);
    est.regioes.sort((a, b) => a.ordem - b.ordem);
  } else if (t === 'add' || t === 'del') {
    await db.excluir('regioes', cmd.r.id);
    est.regioes = est.regioes.filter((x) => x.id !== cmd.r.id);
  } else if (t === 'trocar') {
    const r = est.regioes.find((x) => x.id === cmd.id);
    if (!r) return;
    r.caminhaoId = inverso ? cmd.de : cmd.para;
    await db.gravar('regioes', r);
  }
}

async function executar(cmd) {
  await aplicar(cmd, false);
  est.desfazer.push(cmd);
  est.refazer = [];
  atualizarTudo();
}

async function desfazer() {
  const cmd = est.desfazer.pop();
  if (!cmd) return;
  await aplicar(cmd, true);
  est.refazer.push(cmd);
  atualizarTudo();
}

async function refazer() {
  const cmd = est.refazer.pop();
  if (!cmd) return;
  await aplicar(cmd, false);
  est.desfazer.push(cmd);
  atualizarTudo();
}

// ---------- prancha ----------

function escolherPrancha() {
  const input = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  input.addEventListener('change', async () => {
    const arq = input.files?.[0];
    input.remove();
    if (!arq) return;
    const fim = carregando('Lendo a prancha…');
    let buf;
    let paginas;
    try {
      buf = await arq.arrayBuffer();
      const doc = await abrirPdf(buf);
      paginas = doc.numPages;
      doc.destroy();
    } catch (e) {
      fim();
      await alerta('Não foi possível ler este arquivo como PDF.');
      return;
    }
    fim();
    let pagina = 1;
    if (paginas > 1) {
      pagina = await escolher({
        titulo: 'Qual página tem a forma da laje?',
        classe: 'modal-grade',
        opcoes: Array.from({ length: Math.min(paginas, 40) }, (_, i) => ({ rotulo: String(i + 1), valor: i + 1 })),
      });
      if (!pagina) return;
    }
    if (est.regioes.length && !(await confirmar(
      'Já existem regiões desenhadas. Elas ficam nas mesmas coordenadas da prancha nova e podem não coincidir. Continuar?',
      { titulo: 'Trocar prancha', rotuloOk: 'Trocar' }))) return;
    const prancha = { id: est.mr.pranchaId || uid(), nome: arq.name.replace(/\.pdf$/i, ''), pagina, pdf: buf };
    await db.gravar('pranchas', prancha);
    est.prancha = prancha;
    est.mr.pranchaId = prancha.id;
    await salvarMr();
    await abrirPlanta();
  });
  document.body.append(input);
  input.click();
}

// ---------- configurações ----------

function alternarLegenda() {
  est.legendaAberta = !est.legendaAberta;
  atualizarTudo();
}

function alternarTrava() {
  if (!planta) return;
  planta.navegacaoTravada = !planta.navegacaoTravada;
  toast(planta.navegacaoTravada ? 'Zoom e arraste travados.' : 'Zoom e arraste liberados.');
  atualizarTudo();
}

function abrirConfiguracoes() {
  const valor = el('span', { class: 'valor-faixa' }, `${Math.round(est.opacidade * 100)}%`);
  const faixa = el('input', { type: 'range', min: '15', max: '60', step: '1', value: String(Math.round(est.opacidade * 100)), class: 'faixa' });
  faixa.addEventListener('input', () => {
    est.opacidade = Number(faixa.value) / 100;
    valor.textContent = `${faixa.value}%`;
    planta?.setOpacidade(est.opacidade);
  });
  faixa.addEventListener('change', () => db.salvarMeta('opacidade', est.opacidade));

  const mouse = el('input', { type: 'checkbox', class: 'caixa', checked: est.mouseDesenha });
  mouse.addEventListener('change', () => {
    est.mouseDesenha = mouse.checked;
    if (planta) planta.mouseDesenha = mouse.checked;
    db.salvarMeta('mouseDesenha', mouse.checked);
  });

  return abrirModal({
    titulo: 'Configurações',
    corpo: el('div', { class: 'config' },
      el('label', { class: 'rotulo-campo' }, el('span', {}, 'Opacidade do preenchimento'), el('div', { class: 'linha-faixa' }, faixa, valor)),
      el('label', { class: 'opcao' }, mouse, el('span', {}, 'Desenhar com o mouse', el('small', {}, 'Só para teste no computador. No iPad, deixe desligado.'))),
      el('div', { class: 'linha-botoes' },
        el('button', { type: 'button', class: 'btn', onclick: () => { fecharModal(); escolherPrancha(); } }, 'Trocar prancha'),
        el('button', { type: 'button', class: 'btn btn-texto-perigo', onclick: () => { fecharModal(); apagarTudo(); } }, 'Apagar desenhos')),
      el('p', { class: 'nota' }, VERSAO_APP)),
    botoes: [{ rotulo: 'Fechar', classe: 'btn-primario', valor: true }],
  });
}

function fecharModal() {
  document.querySelector('#camada-modal .modal-fundo')?.remove();
}

async function apagarTudo() {
  if (!(await confirmar('Apagar todos os caminhões e regiões deste protótipo? A prancha continua carregada. Não dá para desfazer.', {
    titulo: 'Apagar desenhos', rotuloOk: 'Apagar tudo', perigo: true,
  }))) return;
  await db.limparMr(MR_ID);
  est.caminhoes = [];
  est.regioes = [];
  est.desfazer = [];
  est.refazer = [];
  est.mr.caminhaoAtivoId = null;
  await salvarMr();
  atualizarTudo();
}

// ---------- entrada da tela ----------

export async function telaLaje() {
  est.desfazer = [];
  est.refazer = [];
  await carregarDados();
  montarTela();
  await abrirPlanta();
}
