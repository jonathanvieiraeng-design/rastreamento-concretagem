// Tela do MR de Pilares: caminhões (Item, NF, Bet, HI, HT, Vol) e elementos por chips.
// Toda alteração é gravada sozinha (digitação com pequeno atraso; botões na hora).
import * as db from './db.js';
import { montar, ir } from './nav.js';
import { el } from './util.js';
import { icone, abrirModal, confirmar, toast } from './ui.js';
import {
  STATUS_MR, statusComTcs, duracao, fmtDuracao, fmtNumero, fmtDataBr, acumulados, resumoMr,
  mapaElementos, naoVinculados, normalizarElemento,
  LADOS_A, LADOS_B, ALTURA_PILAR, volumePilar, resumoPilares, compararNatural, marcadosComLaje,
} from './mr.js';
import {
  novoCaminhao, criarGravador, camposCaminhao, avisoNfRepetida, excluirCaminhao, camposFaltando,
  conferirAntesDeConcluir, oferecerRelatorio, escolherElementosDoCaminhao, pilaresConcretadosNaLaje,
} from './caminhao.js';
import { oferecerBackupAoConcluir } from './backup.js';

const LOGO = 'assets/logo-arcoirismar.png';

export async function telaMrPilares(id, camId = null) {
  const mr = await db.obter('mrs', id);
  if (!mr) return ir('#/');
  const obra = mr.obraId ? await db.obter('obras', mr.obraId) : null;
  const caminhoes = (await db.listarDoMr('caminhoes', id)).sort((a, b) => a.item - b.item);
  mr.elementos = mr.elementos || [];
  // pilares pendentes que foram concretados depois, junto com uma laje
  const { naLaje, lajes } = await pilaresConcretadosNaLaje(mr);
  const concretadosNaLaje = new Set(naLaje.keys());

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
    const marcados = marcadosComLaje(mr, caminhoes).filter((e) => !naLaje.has(e));
    const falta = naoVinculados(mr, caminhoes).filter((e) => !naLaje.has(e) && !marcados.includes(e));
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
      falta.length || marcados.length
        ? el('button', { type: 'button', class: 'btn', onclick: marcarComLaje }, icone('lista'), 'Serão concretados com a laje')
        : '',
      marcados.length
        ? el('section', { class: 'bloco-na-laje' },
          el('h2', { class: 'titulo-painel' }, `A concretar com a laje (${marcados.length})`),
          el('div', { class: 'chips-falta' }, [...marcados].sort(compararNatural).map((e) => el('span', { class: 'chip-el com-laje' }, e))))
        : '',
      naLaje.size
        ? el('section', { class: 'bloco-na-laje' },
          el('h2', { class: 'titulo-painel' }, `Concretados com a laje (${naLaje.size})`),
          el('p', { class: 'nota' }, `MR de Laje: ${lajes.map((l) => `${l.local} (${fmtDataBr(l.data)})`).join('; ')}`),
          el('div', { class: 'chips-falta' }, [...naLaje.entries()].sort((a, b) => compararNatural(a[0], b[0]))
            .map(([e, cs]) => el('span', { class: 'chip-el sel', title: 'caminhão do MR de Laje' }, e, el('small', {}, ` L${cs.map((c) => c.item).join(',')}`)))))
        : '',
      blocoVolumePilares(),
      el('div', { class: 'acoes-painel' },
        mr.status === 'campo'
          ? el('button', { type: 'button', class: 'btn btn-primario', onclick: concluir }, icone('check'), 'Concluir concretagem')
          : el('button', { type: 'button', class: 'btn', onclick: reabrir }, 'Reabrir (voltar a "Em campo")'),
        el('a', { class: 'btn', href: `#/mr/${mr.id}/tcs` }, icone('tc'), 'Resultados de TCP (MPa)'),
        el('button', { type: 'button', class: 'btn', onclick: gerarPdf }, icone('relatorio'), 'Relatório PDF')));
  }

  // ---------- pilares que serão concretados junto com a laje ----------
  async function marcarComLaje() {
    const candidatos = naoVinculados(mr, caminhoes).filter((e) => !naLaje.has(e)).sort(compararNatural);
    let sel = new Set((mr.comLaje || []).filter((e) => candidatos.includes(e)));
    if (!sel.size) sel = new Set(candidatos); // primeira vez: todos os pendentes marcados
    const grade = el('div', { class: 'grade-chips' });
    const info = el('p', { class: 'nota' });
    const desenhar = () => {
      info.textContent = `${sel.size} de ${candidatos.length} marcado(s).`;
      grade.replaceChildren(...candidatos.map((e) => el('button', {
        type: 'button', class: `chip-el chip-toque${sel.has(e) ? ' sel' : ''}`,
        onclick: () => { if (sel.has(e)) sel.delete(e); else sel.add(e); desenhar(); },
      }, e)));
    };
    desenhar();
    const ok = await abrirModal({
      titulo: 'Serão concretados com a laje',
      classe: 'modal-largo',
      corpo: el('div', { class: 'modal-corpo' },
        el('p', { class: 'nota' }, 'Marque os pilares sem caminhão que vão ser concretados junto com a laje. No relatório eles aparecem como "COM A LAJE" em vez de "SEM CAMINHÃO". Depois, no MR de Laje, use "Trazer pilares pendentes".'),
        el('div', { class: 'linha-botoes' },
          el('button', { type: 'button', class: 'btn', onclick: () => { sel = new Set(candidatos); desenhar(); } }, 'Marcar todos'),
          el('button', { type: 'button', class: 'btn', onclick: () => { sel = new Set(); desenhar(); } }, 'Desmarcar todos')),
        grade, info),
      botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Salvar', classe: 'btn-primario', valor: true }],
    });
    if (!ok) return;
    mr.comLaje = [...sel];
    await db.gravar('mrs', mr);
    desenharPainel();
    toast(sel.size ? `${sel.size} pilar(es) marcado(s) para concretar com a laje.` : 'Nenhum pilar marcado para a laje.');
  }

  // ---------- volume dos pilares (dimensões × altura fixa) ----------
  function blocoVolumePilares() {
    const p = resumoPilares(mr, caminhoes, concretadosNaLaje);
    const caixa = (rotulo, valor, classe = '') => el('div', { class: `caixa-resumo ${classe}` }, el('small', {}, rotulo), el('strong', {}, valor));
    const m3 = (v) => `${fmtNumero(v, 2)} m³`;
    return el('section', { class: 'bloco-volume-pilares' },
      el('h2', { class: 'titulo-painel' }, `Volume dos pilares (altura ${fmtNumero(ALTURA_PILAR, 2)} m)`),
      p.comMedida
        ? el('div', { class: 'grade-resumo' },
          caixa('Total', m3(p.total)),
          caixa('Já concretado', m3(p.concretado)),
          caixa('Falta concretar', m3(p.falta), 'caixa-destaque'),
          caixa('Com medida', `${p.comMedida} de ${mr.elementos.length}`),
          p.comLaje > 0 ? caixa('Com a laje (fora da conta)', m3(p.comLaje)) : '')
        : el('p', { class: 'nota' }, 'Cadastre as medidas para ver o volume total e quanto falta concretar.'),
      p.comMedida && p.semMedida.length
        ? el('p', { class: 'nota' }, `Sem medida (fora da conta): ${p.semMedida.join('; ')}`)
        : '',
      el('button', { type: 'button', class: 'btn', onclick: editarDimensoes }, icone('ajustar'), 'Dimensões dos pilares'));
  }

  async function editarDimensoes() {
    mr.dimensoes = mr.dimensoes || {};
    const elementos = [...mr.elementos].sort(compararNatural);
    const opcoes = (lista, atual) => [el('option', { value: '' }, '—'),
      ...lista.map((v) => el('option', { value: String(v), selected: atual === v }, fmtNumero(v, 2)))];
    const totalModal = el('strong', {});
    const linhas = new Map(); // elemento → { a, b, vol }

    const gravar = () => db.gravar('mrs', mr).catch((e) => toast(`Erro ao gravar: ${e.message}`));
    function atualizarTotal() {
      const p = resumoPilares(mr, caminhoes, concretadosNaLaje);
      totalModal.textContent = `Total: ${fmtNumero(p.total, 2)} m³ · ${p.comMedida} de ${mr.elementos.length} com medida`;
    }
    function linha(e) {
      const d = mr.dimensoes[e] || {};
      const sa = el('select', { class: 'campo campo-dim', 'aria-label': `Lado A de ${e}` }, opcoes(LADOS_A, d.a));
      const sb = el('select', { class: 'campo campo-dim', 'aria-label': `Lado B de ${e}` }, opcoes(LADOS_B, d.b));
      const vol = el('span', { class: 'vol-dim' });
      const mostrar = () => { const v = volumePilar(mr.dimensoes[e]); vol.textContent = v == null ? '—' : `${fmtNumero(v, 3)} m³`; };
      const mudou = () => {
        const a = sa.value ? Number(sa.value) : null;
        const b = sb.value ? Number(sb.value) : null;
        if (a == null && b == null) delete mr.dimensoes[e];
        else mr.dimensoes[e] = { a, b };
        mostrar();
        atualizarTotal();
        gravar();
      };
      sa.addEventListener('change', mudou);
      sb.addEventListener('change', mudou);
      mostrar();
      linhas.set(e, { sa, sb, mostrar });
      return el('tr', {}, el('td', { class: 'nome-dim' }, e), el('td', {}, sa), el('td', {}, sb), el('td', {}, vol));
    }

    // copia do MR de Pilares anterior da mesma obra, só para pilares sem medida aqui
    async function copiarAnterior() {
      const todos = await db.listar('mrs');
      const anteriores = todos
        .filter((m) => m.id !== mr.id && m.tipo === 'pilares' && m.obraId === mr.obraId && m.dimensoes && Object.keys(m.dimensoes).length)
        .sort((x, y) => (y.data || '').localeCompare(x.data || '') || (y.criadoEm || '').localeCompare(x.criadoEm || ''));
      const ant = anteriores.find((m) => (m.data || '') <= (mr.data || '')) || anteriores[0];
      if (!ant) { toast('Nenhum MR de Pilares anterior desta obra tem medidas.'); return; }
      let n = 0;
      for (const e of elementos) {
        const d = ant.dimensoes[e];
        if (!mr.dimensoes[e] && d) {
          mr.dimensoes[e] = { a: d.a ?? null, b: d.b ?? null };
          const l = linhas.get(e);
          l.sa.value = d.a != null ? String(d.a) : '';
          l.sb.value = d.b != null ? String(d.b) : '';
          l.mostrar();
          n++;
        }
      }
      atualizarTotal();
      await gravar();
      toast(n ? `${n} medida(s) copiada(s) do MR de ${fmtDataBr(ant.data)} (${ant.local}).` : `Nada a copiar do MR de ${fmtDataBr(ant.data)}: os pilares com o mesmo nome já têm medida aqui ou não têm lá.`);
    }

    atualizarTotal();
    await abrirModal({
      titulo: 'Dimensões dos pilares',
      classe: 'modal-largo',
      corpo: el('div', { class: 'modal-corpo' },
        el('p', { class: 'nota' }, `Escolha o Lado A e o Lado B de cada pilar (m). Altura fixa: ${fmtNumero(ALTURA_PILAR, 2)} m. Grava sozinho.`),
        elementos.length
          ? el('div', { class: 'tabela-rolavel tabela-dim-caixa' }, el('table', { class: 'tabela-dim' },
            el('thead', {}, el('tr', {}, el('th', {}, 'Elemento'), el('th', {}, 'Lado A (m)'), el('th', {}, 'Lado B (m)'), el('th', {}, 'Volume'))),
            el('tbody', {}, elementos.map(linha))))
          : el('p', {}, 'Este MR não tem elementos. Edite o cabeçalho para colocar a lista.'),
        el('p', {}, totalModal),
        el('button', { type: 'button', class: 'btn', onclick: copiarAnterior }, icone('lista'), 'Copiar medidas do MR anterior desta obra')),
      botoes: [{ rotulo: 'Concluir', classe: 'btn-primario', valor: true }],
    });
    desenharPainel();
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
    await escolherElementosDoCaminhao({ mr, c, caminhoes, gravarAgora });
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
    const comLajeAgora = marcadosComLaje(mr, caminhoes);
    const nv = naoVinculados(mr, caminhoes).filter((e) => !naLaje.has(e) && !comLajeAgora.includes(e));
    if (nv.length) faltas.push(`Elementos sem caminhão: ${nv.join('; ')}`);
    if (!caminhoes.length) faltas.push('Nenhum caminhão registrado.');
    if (!(await conferirAntesDeConcluir(faltas, abrirModal))) return;
    mr.status = statusComTcs('concluido', caminhoes);
    mr.concluidoEm = new Date().toISOString();
    await db.gravar('mrs', mr);
    atualizarSubtitulo();
    desenharPainel();
    toast('MR concluído');
    await oferecerBackupAoConcluir();
  }

  async function reabrir() {
    mr.status = 'campo';
    await db.gravar('mrs', mr);
    atualizarSubtitulo();
    desenharPainel();
  }

  async function gerarPdf() {
    descarregar();
    await oferecerRelatorio(mr, obra, caminhoes, { naLaje, lajes, comLaje: marcadosComLaje(mr, caminhoes).filter((e) => !naLaje.has(e)) });
  }

  atualizarSubtitulo();
  desenharLista();
  // vindo da busca: mostra o caminhão
  const alvo = camId && document.getElementById(`cam-${camId}`);
  if (alvo) {
    alvo.classList.add('destaque');
    alvo.scrollIntoView({ block: 'center' });
    setTimeout(() => alvo.classList.remove('destaque'), 5000);
  }
}
