// Tela do MR de Pilares: caminhões (Item, NF, Bet, HI, HT, Vol) e elementos por chips.
// Toda alteração é gravada sozinha (digitação com pequeno atraso; botões na hora).
import * as db from './db.js';
import { montar, ir } from './nav.js';
import { el } from './util.js';
import { icone, abrirModal, confirmar, toast } from './ui.js';
import {
  STATUS_MR, duracao, fmtDuracao, fmtNumero, fmtDataBr, acumulados, resumoMr,
  mapaElementos, naoVinculados, normalizarElemento,
} from './mr.js';
import {
  novoCaminhao, criarGravador, camposCaminhao, avisoNfRepetida, excluirCaminhao, camposFaltando,
  conferirAntesDeConcluir, oferecerRelatorio,
} from './caminhao.js';

const LOGO = 'assets/logo-arcoirismar.png';

export async function telaMrPilares(id) {
  const mr = await db.obter('mrs', id);
  if (!mr) return ir('#/');
  const obra = mr.obraId ? await db.obter('obras', mr.obraId) : null;
  const caminhoes = (await db.listarDoMr('caminhoes', id)).sort((a, b) => a.item - b.item);
  mr.elementos = mr.elementos || [];

  // ---------- gravação ----------
  const g = criarGravador(caminhoes);
  const gravarAgora = g.agora;
  const descarregar = g.descarregar;

  // ---------- estrutura ----------
  const subtitulo = el('small', {});
  const lista = el('div', { class: 'lista-caminhoes' });
  const painel = el('aside', { class: 'painel-mr' });
  const derivados = new Map(); // id → { dur, acum, aviso }

  const raiz = el('div', { class: 'tela tela-mr' },
    el('header', { class: 'topo' },
      el('a', { class: 'btn-icone', href: '#/', 'aria-label': 'Voltar' }, icone('voltar')),
      el('img', { class: 'logo-topo', src: LOGO, alt: 'Construtora Arco-Íris-Mar' }),
      el('div', { class: 'topo-titulo' }, el('strong', {}, `MR Pilares — ${mr.local}`), subtitulo),
      el('a', { class: 'btn-icone', href: `#/mr/${mr.id}/editar`, title: 'Editar cabeçalho', 'aria-label': 'Editar cabeçalho' }, icone('editar')),
      el('button', { type: 'button', class: 'btn-icone', title: 'Relatório PDF', 'aria-label': 'Relatório PDF', onclick: gerarPdf }, icone('relatorio'))),
    el('div', { class: 'corpo-mr' },
      el('div', { class: 'coluna-caminhoes rolavel' },
        lista,
        el('button', { type: 'button', class: 'btn btn-primario btn-grande btn-add-caminhao', onclick: adicionar },
          icone('caminhao'), 'Chegou caminhão')),
      painel));

  montar(raiz, () => g.desligar());

  function atualizarSubtitulo() {
    subtitulo.textContent = `${fmtDataBr(mr.data)} · ${obra?.nome || 'Sem obra'} · ${STATUS_MR[mr.status]?.rotulo}`;
  }

  // ---------- cartões ----------
  function cartao(c) {
    const d = { dur: el('strong', {}), acum: el('strong', {}), aviso: el('p', { class: 'aviso-campo', hidden: true }) };
    derivados.set(c.id, d);

    const k = camposCaminhao(c, g, atualizarDerivados);

    // elementos
    const chips = el('div', { class: 'chips-caminhao' });
    const usados = mapaElementos(caminhoes);
    if ((c.elementos || []).length) {
      chips.append(...c.elementos.map((e) => {
        const outros = usados.get(e).filter((x) => x.id !== c.id);
        return el('span', { class: `chip-el sel${outros.length ? ' dividido' : ''}`, title: outros.length ? `também no caminhão ${outros.map((x) => x.item).join(', ')}` : '' },
          e, outros.length ? el('small', {}, ` +C${outros.map((x) => x.item).join(',')}`) : null);
      }));
    } else {
      chips.append(el('span', { class: 'nota' }, 'Nenhum elemento vinculado.'));
    }

    return el('section', { class: 'cartao-caminhao', id: `cam-${c.id}` },
      el('div', { class: 'cab-caminhao' },
        el('div', { class: 'num-item' }, el('small', {}, 'Item'), String(c.item)),
        k.nf, k.bet, k.vol,
        el('button', { type: 'button', class: 'btn-icone btn-excluir', 'aria-label': `Excluir caminhão ${c.item}`, onclick: () => excluir(c) }, icone('lixo'))),
      d.aviso,
      el('div', { class: 'linha-horas' },
        k.hi, k.ht,
        el('div', { class: 'derivado' }, el('span', { class: 'rotulo-mini' }, 'Descarga'), d.dur),
        el('div', { class: 'derivado' }, el('span', { class: 'rotulo-mini' }, 'Acumulado'), d.acum)),
      el('div', { class: 'linha-elementos' },
        chips,
        el('button', { type: 'button', class: 'btn btn-elementos', onclick: () => escolherElementos(c) },
          icone('lista'), `Elementos${c.elementos?.length ? ` (${c.elementos.length})` : ''}`)));
  }

  function desenharLista() {
    derivados.clear();
    lista.replaceChildren(...(caminhoes.length
      ? caminhoes.map(cartao)
      : [el('div', { class: 'vazio' }, el('p', {}, 'Nenhum caminhão ainda.'), el('p', { class: 'nota' }, 'Toque em "Chegou caminhão" a cada betoneira que chegar.'))]));
    atualizarDerivados();
  }

  function atualizarDerivados() {
    const acum = acumulados(caminhoes);
    caminhoes.forEach((c, i) => {
      const d = derivados.get(c.id);
      if (!d) return;
      d.dur.textContent = fmtDuracao(duracao(c.hi, c.ht));
      d.acum.textContent = `${fmtNumero(acum[i])} m³`;
      const aviso = avisoNfRepetida(c, caminhoes);
      d.aviso.hidden = !aviso;
      d.aviso.textContent = aviso;
    });
    desenharPainel();
  }

  // ---------- painel ----------
  function desenharPainel() {
    const r = resumoMr(caminhoes);
    const falta = naoVinculados(mr, caminhoes);
    const caixa = (rotulo, valor) => el('div', { class: 'caixa-resumo' }, el('small', {}, rotulo), el('strong', {}, valor));
    painel.replaceChildren(
      el('div', { class: 'grade-resumo' },
        caixa('Caminhões', String(r.caminhoes)),
        caixa('Volume total', `${fmtNumero(r.volume)} m³`),
        caixa('Início (1º HI)', r.inicio || '—'),
        caixa('Término (último HT)', r.termino || '—')),
      el('h2', { class: 'titulo-painel' }, `Não vinculados (${falta.length} de ${mr.elementos.length})`),
      mr.elementos.length
        ? (falta.length
          ? el('div', { class: 'chips-falta' }, falta.map((e) => el('span', { class: 'chip-el falta' }, e)))
          : el('p', { class: 'ok-painel' }, icone('check'), 'Todos os elementos têm caminhão.'))
        : el('p', { class: 'nota' }, 'Este MR não tem lista de elementos. Use "elemento livre" em cada caminhão ou edite o cabeçalho.'),
      el('div', { class: 'acoes-painel' },
        mr.status === 'campo'
          ? el('button', { type: 'button', class: 'btn btn-primario', onclick: concluir }, icone('check'), 'Concluir concretagem')
          : el('button', { type: 'button', class: 'btn', onclick: reabrir }, 'Reabrir (voltar a "Em campo")'),
        el('button', { type: 'button', class: 'btn', onclick: gerarPdf }, icone('relatorio'), 'Relatório PDF')));
  }

  // ---------- ações ----------
  async function adicionar() {
    const c = novoCaminhao(mr.id, caminhoes.length + 1);
    await db.gravar('caminhoes', c);
    caminhoes.push(c);
    desenharLista();
    const no = document.getElementById(`cam-${c.id}`);
    no?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    no?.querySelector('input')?.focus({ preventScroll: true });
  }

  async function excluir(c) {
    if (await excluirCaminhao(c, caminhoes, g)) desenharLista();
  }

  async function escolherElementos(c) {
    c.elementos = c.elementos || [];
    const grade = el('div', { class: 'grade-chips' });
    const cLivre = el('input', { class: 'campo', placeholder: 'Elemento livre (ex.: VIGAS)', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const info = el('p', { class: 'nota' });

    function desenhar() {
      const usados = mapaElementos(caminhoes);
      info.textContent = `${c.elementos.length} selecionado(s) neste caminhão.`;
      grade.replaceChildren(...mr.elementos.map((e) => {
        const sel = c.elementos.includes(e);
        const outros = (usados.get(e) || []).filter((x) => x.id !== c.id);
        return el('button', {
          type: 'button',
          class: `chip-el chip-toque${sel ? ' sel' : ''}${!sel && outros.length ? ' em-outro' : ''}`,
          onclick: () => alternar(e, sel, outros),
        }, e, outros.length ? el('small', {}, ` C${outros.map((x) => x.item).join(',')}`) : null);
      }));
    }

    async function alternar(e, sel, outros) {
      if (sel) {
        c.elementos = c.elementos.filter((x) => x !== e);
      } else {
        if (outros.length && !(await confirmar(
          `${e} já está no caminhão ${outros.map((x) => x.item).join(', ')}. Vincular também ao caminhão ${c.item} (elemento completado por outro caminhão)?`,
          { titulo: 'Elemento em outro caminhão', rotuloOk: 'Vincular também' },
        ))) return;
        c.elementos = [...c.elementos, e];
      }
      await gravarAgora(c);
      desenhar();
    }

    async function adicionarLivre() {
      const e = normalizarElemento(cLivre.value);
      if (!e) return;
      cLivre.value = '';
      if (!mr.elementos.includes(e)) {
        mr.elementos = [...mr.elementos, e];
        await db.gravar('mrs', mr);
      }
      if (!c.elementos.includes(e)) {
        const outros = (mapaElementos(caminhoes).get(e) || []).filter((x) => x.id !== c.id);
        await alternar(e, false, outros);
      }
      desenhar();
    }
    cLivre.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); adicionarLivre(); } });

    desenhar();
    await abrirModal({
      titulo: `Elementos do caminhão ${c.item}`,
      classe: 'modal-largo',
      corpo: el('div', { class: 'modal-corpo' },
        el('p', { class: 'nota' }, 'Toque para marcar ou desmarcar. Os marcados com "C" já estão em outro caminhão.'),
        mr.elementos.length ? grade : el('p', {}, 'Este MR não tem lista de elementos.'),
        info,
        el('div', { class: 'linha-campo' }, cLivre, el('button', { type: 'button', class: 'btn', onclick: adicionarLivre }, icone('mais'), 'Adicionar'))),
      botoes: [{ rotulo: 'Concluir', classe: 'btn-primario', valor: true }],
    });
    desenharLista();
  }

  async function concluir() {
    descarregar();
    const faltas = [];
    for (const c of caminhoes) {
      const f = camposFaltando(c);
      if (!(c.elementos || []).length) f.push('elementos');
      if (f.length) faltas.push(`Caminhão ${c.item}: falta ${f.join(', ')}`);
    }
    const nv = naoVinculados(mr, caminhoes);
    if (nv.length) faltas.push(`Elementos sem caminhão: ${nv.join('; ')}`);
    if (!caminhoes.length) faltas.push('Nenhum caminhão registrado.');
    if (!(await conferirAntesDeConcluir(faltas, abrirModal))) return;
    mr.status = 'concluido';
    mr.concluidoEm = new Date().toISOString();
    await db.gravar('mrs', mr);
    atualizarSubtitulo();
    desenharPainel();
    toast('MR concluído');
  }

  async function reabrir() {
    mr.status = 'campo';
    await db.gravar('mrs', mr);
    atualizarSubtitulo();
    desenharPainel();
  }

  async function gerarPdf() {
    descarregar();
    await oferecerRelatorio(mr, obra, caminhoes);
  }

  atualizarSubtitulo();
  desenharLista();
}
