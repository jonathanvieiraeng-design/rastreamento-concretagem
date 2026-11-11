// Tela inicial: lista de MRs com filtro por obra, tipo e mês.
import * as db from './db.js';
import { montar } from './nav.js';
import { el } from './util.js';
import { icone } from './ui.js';
import { TIPOS, STATUS_MR, fmtDataBr, fmtNumero, resumoMr } from './mr.js';

const LOGO = 'assets/logo-arcoirismar.png';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// filtros ficam enquanto o app está aberto
const filtro = { obraId: '', tipo: '', mes: '' };

export async function telaInicio() {
  const [mrs, obras, caminhoes] = await Promise.all([db.listar('mrs'), db.listar('obras'), db.listar('caminhoes')]);
  const lista = mrs.filter((m) => m.id !== 'prototipo-laje');
  const obraNome = new Map(obras.map((o) => [o.id, o.nome]));
  const porMr = new Map();
  for (const c of caminhoes) {
    if (!porMr.has(c.mrId)) porMr.set(c.mrId, []);
    porMr.get(c.mrId).push(c);
  }
  // mais recentes primeiro; no mesmo dia, Pilares antes de Laje (ordem usual da concretagem)
  lista.sort((a, b) => (b.data || '').localeCompare(a.data || '')
    || (a.tipo === b.tipo ? (b.criadoEm || '').localeCompare(a.criadoEm || '') : a.tipo === 'pilares' ? -1 : 1));

  const meses = [...new Set(lista.map((m) => (m.data || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  if (filtro.obraId && !obraNome.has(filtro.obraId)) filtro.obraId = '';
  if (filtro.mes && !meses.includes(filtro.mes)) filtro.mes = '';

  const caixaLista = el('div', { class: 'lista-mrs' });

  function desenharLista() {
    const vis = lista.filter((m) => (!filtro.obraId || m.obraId === filtro.obraId)
      && (!filtro.tipo || m.tipo === filtro.tipo)
      && (!filtro.mes || (m.data || '').startsWith(filtro.mes)));
    if (!lista.length) {
      caixaLista.replaceChildren(el('div', { class: 'vazio' },
        el('p', {}, 'Nenhum MR ainda.'),
        el('p', { class: 'nota' }, 'Toque em "Novo MR" no dia da concretagem.')));
      return;
    }
    if (!vis.length) {
      caixaLista.replaceChildren(el('div', { class: 'vazio' }, el('p', {}, 'Nenhum MR com esses filtros.')));
      return;
    }
    caixaLista.replaceChildren(...vis.map((m) => {
      const r = resumoMr((porMr.get(m.id) || []).sort((a, b) => a.item - b.item));
      return el('a', { class: `cartao-mr tipo-${m.tipo}`, href: `#/mr/${m.id}` },
        el('div', { class: 'cartao-topo' },
          el('span', { class: `selo-tipo tipo-${m.tipo}` }, TIPOS[m.tipo].rotulo),
          el('span', { class: `selo-status st-${m.status}` }, STATUS_MR[m.status]?.rotulo || '—')),
        el('h2', {}, m.local || 'Sem local'),
        el('p', { class: 'sub' }, `${fmtDataBr(m.data)} · ${obraNome.get(m.obraId) || 'Sem obra'}`),
        el('p', { class: 'contagens' }, `${r.caminhoes} caminhão(ões) · ${fmtNumero(r.volume)} m³`));
    }));
  }

  const opcao = (valor, rotulo, atual) => el('option', { value: valor, selected: valor === atual }, rotulo);
  const selObra = el('select', { class: 'campo' },
    opcao('', 'Todas as obras', filtro.obraId),
    obras.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((o) => opcao(o.id, o.nome, filtro.obraId)));
  selObra.addEventListener('change', () => { filtro.obraId = selObra.value; desenharLista(); });

  const selMes = el('select', { class: 'campo' },
    opcao('', 'Todas as datas', filtro.mes),
    meses.map((m) => opcao(m, `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`, filtro.mes)));
  selMes.addEventListener('change', () => { filtro.mes = selMes.value; desenharLista(); });

  const seg = el('div', { class: 'segmentado' });
  const desenharSeg = () => seg.replaceChildren(...[['', 'Todos'], ['pilares', 'Pilares'], ['laje', 'Laje']].map(([v, r]) =>
    el('button', {
      type: 'button',
      class: `seg-btn${filtro.tipo === v ? ' ativo' : ''}`,
      onclick: () => { filtro.tipo = v; desenharSeg(); desenharLista(); },
    }, r)));
  desenharSeg();

  const raiz = el('div', { class: 'tela tela-rolavel' },
    el('div', { class: 'conteudo' },
      el('header', { class: 'cabecalho-inicio' },
        el('img', { class: 'logo-marca', src: LOGO, alt: 'Construtora Arco-Íris-Mar' }),
        el('h1', {}, 'Rastreamento de Concretagem'),
        el('p', { class: 'sub' }, 'Mapa de Rastreamento (MR) · caminhão, NF e local de aplicação')),
      el('a', { class: 'btn btn-primario btn-grande', href: '#/novo' }, icone('mais'), 'Novo MR'),
      el('div', { class: 'filtros' }, seg, selObra, selMes),
      caixaLista,
      el('div', { class: 'acoes-inicio' },
        el('a', { class: 'btn', href: '#/cadastros' }, icone('lista'), 'Cadastros de elementos'),
        el('a', { class: 'btn', href: '#/prototipo-laje' }, icone('editar'), 'Protótipo do desenho da laje')),
      el('p', { class: 'rodape-versao' }, 'Construtora Arco-Íris-Mar · uso offline · Etapa 3')));
  montar(raiz);
  desenharLista();
}
