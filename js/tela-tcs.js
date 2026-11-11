// Resultados de TC (MPa) de um MR: tabela com todos os caminhões e as idades 7, 28 e 60 dias.
// Valores com 1 casa decimal. O app não classifica os resultados (sem limites informados).
import * as db from './db.js';
import { montar, ir } from './nav.js';
import { el } from './util.js';
import { icone, toast } from './ui.js';
import { corDoItem } from './cores.js';
import {
  TIPOS, STATUS_MR, IDADES_TC, somarDias, statusComTcs, lerNumero, fmtTc, fmtNumero, fmtDataBr,
} from './mr.js';
import { criarGravador, oferecerRelatorio } from './caminhao.js';

const LOGO = 'assets/logo-arcoirismar.png';

export async function telaTcs(id) {
  const mr = await db.obter('mrs', id);
  if (!mr) return ir('#/');
  const obra = mr.obraId ? await db.obter('obras', mr.obraId) : null;
  const caminhoes = (await db.listarDoMr('caminhoes', id)).sort((a, b) => a.item - b.item);
  const g = criarGravador(caminhoes);
  const ehLaje = mr.tipo === 'laje';

  const subtitulo = el('small', {});
  const contagem = el('p', { class: 'nota' });
  function atualizarCabecalho() {
    subtitulo.textContent = `${fmtDataBr(mr.data)} · ${obra?.nome || 'Sem obra'} · ${STATUS_MR[mr.status]?.rotulo}`;
    const n = (campo) => caminhoes.filter((c) => c[campo] != null).length;
    contagem.textContent = IDADES_TC.map((i) => `${i.rotulo}: ${n(i.campo)} de ${caminhoes.length}`).join(' · ');
  }

  async function aoMudarTc() {
    const novo = statusComTcs(mr.status, caminhoes);
    if (novo !== mr.status) {
      mr.status = novo;
      await db.gravar('mrs', mr);
      if (novo === 'tcs') toast('Todos os caminhões com TC 7 e 28 dias: MR marcado como "TCs completos".');
    }
    atualizarCabecalho();
  }

  function campoTc(c, campo, rotulo) {
    const inp = el('input', {
      class: 'campo campo-tc', value: fmtTc(c[campo]), autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
      enterkeyhint: 'next', 'aria-label': `${rotulo} do caminhão ${c.item}`,
    });
    inp.addEventListener('input', () => {
      const n = lerNumero(inp.value);
      inp.classList.toggle('invalido', Number.isNaN(n));
      if (Number.isNaN(n)) return;
      c[campo] = n == null ? null : Math.round(n * 10) / 10;
      g.depois(c);
      aoMudarTc();
    });
    inp.addEventListener('blur', () => {
      if (!inp.classList.contains('invalido')) inp.value = fmtTc(c[campo]);
    });
    return inp;
  }

  const cab = el('tr', {},
    el('th', {}, 'Item'), el('th', {}, 'NF'), el('th', {}, 'Bet'), el('th', { class: 'col-opcional' }, 'HI–HT'), el('th', { class: 'col-opcional' }, 'Vol (m³)'),
    ...IDADES_TC.map((i) => el('th', { class: 'col-tc' }, `${i.rotulo} (MPa)`, el('small', {}, `prev. ${fmtDataBr(somarDias(mr.data, i.dias))}`))));
  const corpo = el('tbody', {}, caminhoes.map((c) => el('tr', { id: `tc-${c.id}` },
    el('td', {}, el('span', { class: 'item-tc', style: ehLaje ? { background: corDoItem(c.item), color: '#fff' } : {} }, String(c.item))),
    el('td', {}, c.nf ?? '—'),
    el('td', {}, c.bet || '—'),
    el('td', { class: 'col-opcional' }, c.hi || c.ht ? `${c.hi || '—'}–${c.ht || '—'}` : '—'),
    el('td', { class: 'col-opcional' }, c.vol != null ? fmtNumero(c.vol) : '—'),
    ...IDADES_TC.map((i) => el('td', {}, campoTc(c, i.campo, i.rotulo))))));

  async function gerarPdf() {
    g.descarregar();
    let extra;
    if (ehLaje) {
      const regioes = (await db.listarDoMr('regioes', mr.id)).sort((a, b) => a.ordem - b.ordem);
      const prancha = mr.pranchaId ? await db.obter('pranchas', mr.pranchaId) : null;
      extra = { prancha, regioes, opacidade: (await db.obterMeta('opacidade')) ?? 0.33 };
    }
    await oferecerRelatorio(mr, obra, caminhoes, extra);
  }

  const raiz = el('div', { class: 'tela' },
    el('header', { class: 'topo' },
      el('a', { class: 'btn-icone', href: `#/mr/${mr.id}`, 'aria-label': 'Voltar ao MR' }, icone('voltar')),
      el('img', { class: 'logo-topo', src: LOGO, alt: 'Construtora Arco-Íris-Mar' }),
      el('div', { class: 'topo-titulo' }, el('strong', {}, `Resultados de TC — MR ${TIPOS[mr.tipo].rotulo} — ${mr.local}`), subtitulo),
      el('button', { type: 'button', class: 'btn-icone', title: 'Relatório PDF', 'aria-label': 'Relatório PDF', onclick: gerarPdf }, icone('relatorio'))),
    el('div', { class: 'rolavel form form-tcs' },
      el('p', { class: 'nota' }, 'Digite o resultado em MPa, com 1 casa decimal (vírgula ou ponto). Grava sozinho. "prev." é a data da concretagem + a idade, só como referência.'),
      contagem,
      caminhoes.length
        ? el('div', { class: 'tabela-rolavel' }, el('table', { class: 'tabela-tcs' }, el('thead', {}, cab), corpo))
        : el('div', { class: 'vazio' }, el('p', {}, 'Este MR não tem caminhões.')),
      el('p', { class: 'nota' }, 'O MR fica "TCs completos" quando todos os caminhões têm TC 7 e 28 dias.'),
      el('button', { type: 'button', class: 'btn btn-primario btn-grande', onclick: gerarPdf }, icone('relatorio'), 'Relatório PDF com os TCs')));
  montar(raiz, () => g.desligar());
  atualizarCabecalho();
}
