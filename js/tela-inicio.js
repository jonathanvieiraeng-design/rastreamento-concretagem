// Tela inicial: lista de MRs com filtro por obra, tipo e mês.
import * as db from './db.js';
import { montar } from './nav.js';
import { el } from './util.js';
import { icone } from './ui.js';
import { TIPOS, STATUS_MR, fmtDataBr, fmtNumero, fmtTc, resumoMr } from './mr.js';
import { buscar } from './busca.js';
import { VERSAO_APP } from './ajuda.js';
import { fazerBackup, restaurarBackup, ultimoBackup, fmtDataHoraIso, DIAS_LEMBRETE } from './backup.js';

const LOGO = 'assets/logo-arcoirismar.png';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// filtros e busca ficam enquanto o app está aberto
const filtro = { obraId: '', tipo: '', mes: '', busca: '' };

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


  // ---- busca reversa ----
  const caixaBusca = el('div', { class: 'resultados-busca', hidden: true });
  const cBusca = el('input', {
    class: 'campo campo-busca', type: 'search', value: filtro.busca, placeholder: 'Buscar NF, Bet ou elemento (ex.: 140537, P11)',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', autocapitalize: 'characters', enterkeyhint: 'search',
    'aria-label': 'Buscar por NF, Bet ou elemento',
  });
  cBusca.addEventListener('input', () => { filtro.busca = cBusca.value; desenharBusca(); });

  function desenharBusca() {
    const q = filtro.busca.trim();
    caixaBusca.hidden = !q;
    caixaLista.hidden = !!q;
    filtros.hidden = !!q;
    if (!q) return;
    const res = buscar(q, lista, caminhoes);
    caixaBusca.replaceChildren(
      el('p', { class: 'nota' }, res.length ? `${res.length} resultado(s)${res.length >= 60 ? ' (mostrando os 60 primeiros)' : ''}. Toque para abrir o MR no caminhão.` : 'Nada encontrado.'),
      ...res.map(({ mr, caminhao: c, motivos }) => el('a', {
        class: `resultado tipo-${mr.tipo}`, href: c ? `#/mr/${mr.id}/cam/${c.id}` : `#/mr/${mr.id}`,
      },
      el('div', { class: 'resultado-topo' },
        el('span', { class: `selo-tipo tipo-${mr.tipo}` }, TIPOS[mr.tipo].rotulo),
        el('strong', {}, c ? `Caminhão ${c.item}` : 'SEM CAMINHÃO'),
        ...motivos.map((m) => el('span', { class: `chip-el${c ? ' sel' : ' falta'}` }, m))),
      el('p', { class: 'sub' }, `${mr.local} · ${fmtDataBr(mr.data)} · ${obraNome.get(mr.obraId) || 'Sem obra'}`),
      c ? el('p', { class: 'contagens' }, [
        `NF ${c.nf ?? '—'}`, `Bet ${c.bet || '—'}`, `${c.hi || '—'}–${c.ht || '—'}`, `${c.vol != null ? fmtNumero(c.vol) : '—'} m³`,
        c.tc7 != null ? `TCP7 ${fmtTc(c.tc7)} MPa` : null, c.tc28 != null ? `TCP28 ${fmtTc(c.tc28)} MPa` : null,
      ].filter(Boolean).join(' · ')) : null)));
  }

  // ---- backup ----
  const ub = await ultimoBackup();
  const atrasado = lista.length > 0 && (ub.iso == null || ub.dias >= DIAS_LEMBRETE);
  const blocoBackup = el('section', { class: `bloco-backup${atrasado ? ' atrasado' : ''}` },
    el('div', {},
      el('strong', {}, 'Backup'),
      el('p', {}, ub.iso
        ? `Último backup: ${fmtDataHoraIso(ub.iso)} (${ub.dias === 0 ? 'hoje' : ub.dias === 1 ? 'há 1 dia' : `há ${ub.dias} dias`}).`
        : 'Nenhum backup feito neste iPad.'),
      atrasado ? el('p', { class: 'aviso-backup' }, `Faça um backup e salve no OneDrive${ub.iso ? ` (passou de ${DIAS_LEMBRETE} dias)` : ''}.`) : null),
    el('div', { class: 'botoes-backup' },
      el('button', { type: 'button', class: `btn${atrasado ? ' btn-primario' : ''}`, onclick: async () => { if (await fazerBackup()) telaInicio(); } }, icone('salvar'), 'Fazer backup'),
      el('button', { type: 'button', class: 'btn', onclick: async () => { if (await restaurarBackup()) telaInicio(); } }, icone('restaurar'), 'Restaurar backup')));

  const filtros = el('div', { class: 'filtros' }, seg, selObra, selMes);
  const raiz = el('div', { class: 'tela tela-rolavel' },
    el('div', { class: 'conteudo' },
      el('header', { class: 'cabecalho-inicio' },
        el('img', { class: 'logo-marca', src: LOGO, alt: 'Construtora Arco-Íris-Mar' }),
        el('h1', {}, 'Rastreamento de Concretagem'),
        el('p', { class: 'sub' }, 'Mapa de Rastreamento (MR) · caminhão, NF e local de aplicação')),
      el('a', { class: 'btn btn-primario btn-grande', href: '#/novo' }, icone('mais'), 'Novo MR'),
      el('label', { class: 'linha-busca' }, icone('busca'), cBusca),
      filtros,
      caixaBusca,
      caixaLista,
      blocoBackup,
      el('div', { class: 'acoes-inicio' },
        el('a', { class: 'btn', href: '#/cadastros' }, icone('lista'), 'Cadastros de elementos'),
        el('a', { class: 'btn', href: '#/ajuda' }, icone('legenda'), 'Como usar')),
      el('p', { class: 'rodape-versao' }, `Construtora Arco-Íris-Mar · uso offline · versão ${VERSAO_APP}`)));
  montar(raiz);
  desenharLista();
  desenharBusca();
}
