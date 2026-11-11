// Tela do MR de Laje: prancha de forma com as regiões de cada caminhão (Apple Pencil)
// e painel dos caminhões (Item, NF, Bet, HI, HT, Vol). Tudo é gravado sozinho.
import * as db from './db.js';
import { Planta, abrirPdf } from './planta.js';
import { corDoItem } from './cores.js';
import { el, uid } from './util.js';
import { icone, abrirModal, confirmar, escolher, toast, carregando, alerta } from './ui.js';
import { montar, ir } from './nav.js';
import { STATUS_MR, statusComTcs, duracao, fmtDuracao, fmtNumero, fmtDataBr, acumulados, resumoMr } from './mr.js';
import {
  novoCaminhao, criarGravador, camposCaminhao, avisoNfRepetida, excluirCaminhao, camposFaltando,
  conferirAntesDeConcluir, oferecerRelatorio,
} from './caminhao.js';
import { oferecerBackupAoConcluir } from './backup.js';

const LOGO = 'assets/logo-arcoirismar.png';

export async function telaMrLaje(id, camId = null) {
  const mr = await db.obter('mrs', id);
  if (!mr) return ir('#/');
  const obra = mr.obraId ? await db.obter('obras', mr.obraId) : null;
  const caminhoes = (await db.listarDoMr('caminhoes', id)).sort((a, b) => a.item - b.item);
  let regioes = (await db.listarDoMr('regioes', id)).sort((a, b) => a.ordem - b.ordem);
  let prancha = mr.pranchaId ? await db.obter('pranchas', mr.pranchaId) : null;
  let opacidade = (await db.obterMeta('opacidade')) ?? 0.33;
  let mouseDesenha = (await db.obterMeta('mouseDesenha')) ?? false;
  let desfazerPilha = [];
  let refazerPilha = [];
  let legendaAberta = false;
  let planta = null;
  if (mr.caminhaoAtivoId && !caminhoes.some((c) => c.id === mr.caminhaoAtivoId)) mr.caminhaoAtivoId = null;

  const g = criarGravador(caminhoes);
  const caminhaoPorId = (cid) => caminhoes.find((c) => c.id === cid);
  const ativo = () => caminhaoPorId(mr.caminhaoAtivoId);
  const regioesDe = (c) => regioes.filter((r) => r.caminhaoId === c.id);

  // ---------- estrutura ----------
  const botao = (nome, titulo, onclick) =>
    el('button', { type: 'button', class: 'btn-icone', title: titulo, 'aria-label': titulo, onclick }, icone(nome));
  const btDesfazer = botao('desfazer', 'Desfazer', () => desfazer());
  const btRefazer = botao('refazer', 'Refazer', () => refazer());
  const btLegenda = botao('legenda', 'Legenda', () => { legendaAberta = !legendaAberta; atualizar(); });
  const subtitulo = el('small', {});

  const area = el('div', { class: 'area-planta' });
  const dica = el('div', { class: 'dica-edicao', hidden: true });
  const btTrava = el('button', {
    type: 'button', class: 'btn-flutuante', title: 'Travar zoom/arraste', 'aria-label': 'Travar zoom e arraste',
    onclick: () => {
      if (!planta) return;
      planta.navegacaoTravada = !planta.navegacaoTravada;
      toast(planta.navegacaoTravada ? 'Zoom e arraste travados.' : 'Zoom e arraste liberados.');
      atualizar();
    },
  }, icone('cadeado'));
  const flut = (nome, titulo, onclick) =>
    el('button', { type: 'button', class: 'btn-flutuante', title: titulo, 'aria-label': titulo, onclick }, icone(nome));
  const controles = el('div', { class: 'controles-planta' },
    flut('mais', 'Aproximar', () => planta?.zoomCentro(1.6)),
    flut('menos', 'Afastar', () => planta?.zoomCentro(1 / 1.6)),
    flut('ajustar', 'Ver a prancha inteira', () => planta?.ajustar()),
    btTrava);
  const legenda = el('aside', { class: 'painel-legenda', hidden: true });
  const vazio = el('div', { class: 'carregando-planta' });
  area.append(vazio, dica, controles, legenda);

  const caixaAtivo = el('div', { class: 'caixa-ativo' });
  const chips = el('div', { class: 'grade-cam' });
  const tituloChips = el('h2', { class: 'titulo-painel' });
  const resumo = el('div', { class: 'resumo-laje' });
  const painel = el('aside', { class: 'painel-laje' },
    caixaAtivo,
    el('div', { class: 'bloco-cam' },
      tituloChips,
      chips,
      el('button', { type: 'button', class: 'btn btn-primario btn-grande', onclick: adicionar }, icone('caminhao'), 'Chegou caminhão')),
    resumo);

  const raiz = el('div', { class: 'tela tela-laje' },
    el('header', { class: 'topo' },
      el('a', { class: 'btn-icone', href: '#/', 'aria-label': 'Voltar' }, icone('voltar')),
      el('img', { class: 'logo-topo', src: LOGO, alt: 'Construtora Arco-Íris-Mar' }),
      el('div', { class: 'topo-titulo' }, el('strong', {}, `MR Laje — ${mr.local}`), subtitulo),
      btDesfazer, btRefazer, btLegenda,
      botao('config', 'Configurações', () => configuracoes()),
      el('a', { class: 'btn-icone', href: `#/mr/${mr.id}/editar`, title: 'Editar cabeçalho', 'aria-label': 'Editar cabeçalho' }, icone('editar')),
      botao('relatorio', 'Relatório PDF', () => gerarPdf())),
    el('div', { class: 'corpo-laje' }, area, painel));

  montar(raiz, () => { g.desligar(); planta?.destruir(); planta = null; });

  // ---------- prancha ----------
  async function abrirPlanta() {
    planta?.destruir();
    planta = null;
    vazio.hidden = false;
    if (!prancha) {
      vazio.replaceChildren(
        el('p', {}, 'Carregue a prancha de forma da laje (PDF) para desenhar as regiões.'),
        el('button', { type: 'button', class: 'btn btn-primario btn-grande', onclick: escolherPrancha }, icone('prancha'), 'Carregar prancha'));
      atualizar();
      return;
    }
    vazio.replaceChildren(el('div', { class: 'girador' }), el('span', {}, 'Abrindo a prancha…'));
    planta = new Planta(area, {
      podeDesenhar: () => !!ativo(),
      aoNaoPoderDesenhar: () => toast('Toque em "Chegou caminhão" ou escolha um caminhão antes de desenhar.'),
      aoFecharContorno: (pts) => novaRegiao(pts),
      aoDescartarTraco: (motivo) => toast(motivo === 'pequeno' ? 'Traço muito curto: ignorado.' : 'Traço interrompido: desenhe de novo.'),
      aoTocar: (px, py) => tocarNaPrancha(px, py),
    });
    area.prepend(planta.vista);
    planta.mouseDesenha = mouseDesenha;
    planta.setOpacidade(opacidade);
    try {
      await planta.carregar(prancha.pdf, prancha.pagina);
      vazio.hidden = true;
    } catch (e) {
      if (e?.name === 'RenderingCancelledException') return; // saiu da tela antes de terminar
      console.error(e);
      vazio.replaceChildren(el('p', { class: 'erro' }, 'Não foi possível abrir a prancha.'),
        el('button', { type: 'button', class: 'btn', onclick: escolherPrancha }, 'Carregar outra'));
    }
    atualizar();
  }

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
      if (regioes.length && !(await confirmar(
        'Já existem regiões desenhadas. Elas ficam nas mesmas coordenadas da prancha nova e podem não coincidir. Continuar?',
        { titulo: 'Trocar prancha', rotuloOk: 'Trocar' }))) return;
      const nova = { id: mr.pranchaId || uid(), nome: arq.name.replace(/\.pdf$/i, ''), pagina, pdf: buf };
      await db.gravar('pranchas', nova);
      prancha = nova;
      mr.pranchaId = nova.id;
      await db.gravar('mrs', mr);
      await abrirPlanta();
    });
    document.body.append(input);
    input.click();
  }

  // ---------- desenho da tela ----------
  const derivAtivo = { dur: null, acum: null, aviso: null, regs: null };

  function desenharAtivo() {
    const c = ativo();
    if (!c) {
      caixaAtivo.replaceChildren(el('div', { class: 'vazio-ativo' },
        el('p', {}, caminhoes.length ? 'Escolha um caminhão abaixo.' : 'Nenhum caminhão ainda.'),
        el('p', { class: 'nota' }, 'Toque em "Chegou caminhão" a cada betoneira que chegar. A Apple Pencil desenha a região do caminhão escolhido.')));
      return;
    }
    const k = camposCaminhao(c, g, atualizar);
    derivAtivo.dur = el('strong', {});
    derivAtivo.acum = el('strong', {});
    derivAtivo.aviso = el('p', { class: 'aviso-campo', hidden: true });
    derivAtivo.regs = el('strong', {});
    caixaAtivo.replaceChildren(el('section', { class: 'cartao-caminhao cartao-ativo', style: { '--cor': corDoItem(c.item) } },
      el('div', { class: 'cab-caminhao' },
        el('div', { class: 'num-item num-cor' }, el('small', {}, 'Item'), String(c.item)),
        k.nf, k.bet,
        el('button', { type: 'button', class: 'btn-icone btn-excluir', 'aria-label': `Excluir caminhão ${c.item}`, onclick: () => excluir(c) }, icone('lixo')),
        k.vol,
        el('div', { class: 'derivado' }, el('span', { class: 'rotulo-mini' }, 'Regiões'), derivAtivo.regs)),
      derivAtivo.aviso,
      el('div', { class: 'linha-horas' },
        k.hi, k.ht,
        el('div', { class: 'derivado' }, el('span', { class: 'rotulo-mini' }, 'Descarga'), derivAtivo.dur),
        el('div', { class: 'derivado' }, el('span', { class: 'rotulo-mini' }, 'Acumulado'), derivAtivo.acum))));
  }

  function atualizar() {
    const a = ativo();
    const acum = acumulados(caminhoes);
    subtitulo.textContent = `${fmtDataBr(mr.data)} · ${obra?.nome || 'Sem obra'} · ${STATUS_MR[mr.status]?.rotulo}`
      + (prancha ? ` · ${prancha.nome}${prancha.pagina > 1 ? ` (pág. ${prancha.pagina})` : ''}` : '');

    if (planta) {
      planta.corTraco = a ? corDoItem(a.item) : '#000';
      planta.setRegioes(regioes.map((r) => {
        const c = caminhaoPorId(r.caminhaoId);
        return { id: r.id, pontos: r.pontos, item: c?.item ?? '?', cor: c ? corDoItem(c.item) : '#777' };
      }));
    }
    dica.hidden = !prancha;
    if (prancha) {
      dica.replaceChildren(a
        ? el('span', {}, el('span', { class: 'amostra', style: { background: corDoItem(a.item) } }),
          el('b', {}, ` Caminhão ${a.item}`), ' · desenhe o contorno com a Apple Pencil. Dedo: mover e ampliar. Toque numa região para editar.')
        : el('span', {}, 'Toque em ', el('b', {}, 'Chegou caminhão'), ' para começar a desenhar.'));
    }

    // cartão do ativo (só os valores derivados; os campos não são recriados para não perder o foco)
    if (a && derivAtivo.dur) {
      const i = caminhoes.indexOf(a);
      derivAtivo.dur.textContent = fmtDuracao(duracao(a.hi, a.ht));
      derivAtivo.acum.textContent = `${fmtNumero(acum[i])} m³`;
      const n = regioesDe(a).length;
      derivAtivo.regs.textContent = String(n);
      derivAtivo.regs.classList.toggle('texto-alerta', !n);
      const aviso = avisoNfRepetida(a, caminhoes);
      derivAtivo.aviso.hidden = !aviso;
      derivAtivo.aviso.textContent = aviso;
    }

    // chips
    tituloChips.textContent = `Caminhões (${caminhoes.length})`;
    chips.replaceChildren(...caminhoes.map((c) => {
      const n = regioesDe(c).length;
      return el('button', {
        type: 'button',
        class: `chip-caminhao${c.id === mr.caminhaoAtivoId ? ' ativo' : ''}`,
        style: { '--cor': corDoItem(c.item) },
        onclick: () => ativar(c.id),
      }, el('span', { class: 'chip-num' }, String(c.item)), el('small', { class: n ? '' : 'sem-regiao' }, n ? `${n} reg.` : 'sem reg.'));
    }));

    // resumo e ações
    const r = resumoMr(caminhoes);
    const semRegiao = caminhoes.filter((c) => !regioesDe(c).length);
    const caixa = (rotulo, valor) => el('div', { class: 'caixa-resumo' }, el('small', {}, rotulo), el('strong', {}, valor));
    resumo.replaceChildren(
      el('div', { class: 'grade-resumo' },
        caixa('Volume total', `${fmtNumero(r.volume)} m³`),
        caixa('Regiões', String(regioes.length)),
        caixa('Início (1º HI)', r.inicio || '—'),
        caixa('Término (último HT)', r.termino || '—')),
      semRegiao.length
        ? el('p', { class: 'aviso-campo' }, `Sem região desenhada: caminhão ${semRegiao.map((c) => c.item).join(', ')}.`)
        : '',
      el('div', { class: 'acoes-painel' },
        mr.status === 'campo'
          ? el('button', { type: 'button', class: 'btn btn-primario', onclick: concluir }, icone('check'), 'Concluir concretagem')
          : el('button', { type: 'button', class: 'btn', onclick: reabrir }, 'Reabrir (voltar a "Em campo")'),
        el('a', { class: 'btn', href: `#/mr/${mr.id}/tcs` }, icone('tc'), 'Resultados de TC (MPa)'),
        el('button', { type: 'button', class: 'btn', onclick: gerarPdf }, icone('relatorio'), 'Relatório PDF')));

    btDesfazer.disabled = !desfazerPilha.length;
    btRefazer.disabled = !refazerPilha.length;
    btTrava.classList.toggle('ativo', !!planta?.navegacaoTravada);
    btLegenda.classList.toggle('ativo', legendaAberta);
    desenharLegenda(acum);
  }

  function desenharLegenda() {
    legenda.hidden = !legendaAberta;
    if (!legendaAberta) return;
    legenda.replaceChildren(
      el('h2', {}, 'Legenda'),
      caminhoes.length
        ? el('table', {},
          el('thead', {}, el('tr', {}, el('th', {}, 'Cam.'), el('th', {}, 'Cor'), el('th', {}, 'NF'), el('th', {}, 'HI–HT'), el('th', {}, 'Vol'))),
          el('tbody', {}, caminhoes.map((c) => el('tr', { onclick: () => ativar(c.id), class: c.id === mr.caminhaoAtivoId ? 'ativo' : '' },
            el('td', {}, String(c.item)),
            el('td', {}, el('span', { class: 'amostra', style: { background: corDoItem(c.item) } })),
            el('td', {}, c.nf ?? '—'),
            el('td', {}, `${c.hi || '—'}–${c.ht || '—'}`),
            el('td', {}, c.vol != null ? fmtNumero(c.vol) : '—')))))
        : el('p', { class: 'nota' }, 'Nenhum caminhão ainda.'));
  }

  // ---------- caminhões ----------
  async function ativar(cid) {
    g.descarregar();
    mr.caminhaoAtivoId = cid;
    await db.gravar('mrs', mr);
    desenharAtivo();
    atualizar();
    chips.querySelector('.ativo')?.scrollIntoView({ block: 'nearest' });
  }

  async function adicionar() {
    const c = novoCaminhao(mr.id, caminhoes.length + 1);
    await db.gravar('caminhoes', c);
    caminhoes.push(c);
    await ativar(c.id);
    caixaAtivo.querySelector('input')?.focus({ preventScroll: true });
    toast(`Caminhão ${c.item} ativo: desenhe a região dele.`);
  }

  async function excluir(c) {
    const minhas = regioesDe(c);
    const detalhe = minhas.length
      ? ` ${minhas.length === 1 ? 'A região desenhada dele também será apagada' : `As ${minhas.length} regiões desenhadas dele também serão apagadas`}.`
      : '';
    const ok = await excluirCaminhao(c, caminhoes, g, {
      detalhe: detalhe + (caminhoes.length > c.item ? ' As cores seguem o Item e mudam com a renumeração.' : ''),
      antes: async () => {
        for (const r of minhas) await db.excluir('regioes', r.id);
        regioes = regioes.filter((r) => r.caminhaoId !== c.id);
      },
    });
    if (!ok) return;
    // o histórico de desenho pode citar o caminhão excluído
    desfazerPilha = [];
    refazerPilha = [];
    mr.caminhaoAtivoId = caminhoes.at(-1)?.id ?? null;
    await db.gravar('mrs', mr);
    desenharAtivo();
    atualizar();
  }

  async function concluir() {
    g.descarregar();
    const faltas = [];
    for (const c of caminhoes) {
      const f = camposFaltando(c);
      if (!regioesDe(c).length) f.push('região desenhada');
      if (f.length) faltas.push(`Caminhão ${c.item}: falta ${f.join(', ')}`);
    }
    if (!prancha) faltas.push('Nenhuma prancha carregada.');
    if (!caminhoes.length) faltas.push('Nenhum caminhão registrado.');
    if (!(await conferirAntesDeConcluir(faltas, abrirModal))) return;
    mr.status = statusComTcs('concluido', caminhoes);
    mr.concluidoEm = new Date().toISOString();
    await db.gravar('mrs', mr);
    atualizar();
    toast('MR concluído');
    await oferecerBackupAoConcluir();
  }

  async function reabrir() {
    mr.status = 'campo';
    await db.gravar('mrs', mr);
    atualizar();
  }

  async function gerarPdf() {
    g.descarregar();
    await oferecerRelatorio(mr, obra, caminhoes, { prancha, regioes, opacidade });
  }

  // ---------- regiões ----------
  async function novaRegiao(pontos) {
    const a = ativo();
    if (!a) return;
    const ordem = (regioes.at(-1)?.ordem ?? 0) + 1;
    await executar({ t: 'add', r: { id: uid(), mrId: mr.id, caminhaoId: a.id, pontos, ordem } });
  }

  async function tocarNaPrancha(px, py) {
    const alvo = planta.regiaoEm(px, py);
    if (!alvo) return;
    const r = regioes.find((x) => x.id === alvo.id);
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
      const outros = caminhoes.filter((x) => x.id !== r.caminhaoId);
      if (!outros.length) {
        await alerta('Não há outro caminhão. Toque em "Chegou caminhão" primeiro.');
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

  async function aplicar(cmd, inverso) {
    const { t } = cmd;
    if ((t === 'add' && !inverso) || (t === 'del' && inverso)) {
      await db.gravar('regioes', cmd.r);
      regioes.push(cmd.r);
      regioes.sort((a, b) => a.ordem - b.ordem);
    } else if (t === 'add' || t === 'del') {
      await db.excluir('regioes', cmd.r.id);
      regioes = regioes.filter((x) => x.id !== cmd.r.id);
    } else if (t === 'trocar') {
      const r = regioes.find((x) => x.id === cmd.id);
      if (!r) return;
      r.caminhaoId = inverso ? cmd.de : cmd.para;
      await db.gravar('regioes', r);
    }
  }

  async function executar(cmd) {
    await aplicar(cmd, false);
    desfazerPilha.push(cmd);
    refazerPilha = [];
    atualizar();
  }

  async function desfazer() {
    const cmd = desfazerPilha.pop();
    if (!cmd) return;
    await aplicar(cmd, true);
    refazerPilha.push(cmd);
    atualizar();
  }

  async function refazer() {
    const cmd = refazerPilha.pop();
    if (!cmd) return;
    await aplicar(cmd, false);
    desfazerPilha.push(cmd);
    atualizar();
  }

  // ---------- configurações ----------
  function configuracoes() {
    const valor = el('span', { class: 'valor-faixa' }, `${Math.round(opacidade * 100)}%`);
    const faixa = el('input', { type: 'range', min: '15', max: '60', step: '1', value: String(Math.round(opacidade * 100)), class: 'faixa' });
    faixa.addEventListener('input', () => {
      opacidade = Number(faixa.value) / 100;
      valor.textContent = `${faixa.value}%`;
      planta?.setOpacidade(opacidade);
    });
    faixa.addEventListener('change', () => db.salvarMeta('opacidade', opacidade));
    const mouse = el('input', { type: 'checkbox', class: 'caixa', checked: mouseDesenha });
    mouse.addEventListener('change', () => {
      mouseDesenha = mouse.checked;
      if (planta) planta.mouseDesenha = mouse.checked;
      db.salvarMeta('mouseDesenha', mouse.checked);
    });
    const fechar = () => document.querySelector('#camada-modal .modal-fundo')?.remove();
    return abrirModal({
      titulo: 'Configurações',
      corpo: el('div', { class: 'config' },
        el('label', { class: 'rotulo-campo' }, el('span', {}, 'Opacidade do preenchimento (tela e relatório)'), el('div', { class: 'linha-faixa' }, faixa, valor)),
        el('label', { class: 'opcao' }, mouse, el('span', {}, 'Desenhar com o mouse', el('small', {}, 'Só para teste no computador. No iPad, deixe desligado.'))),
        el('div', { class: 'linha-botoes' },
          el('button', { type: 'button', class: 'btn', onclick: () => { fechar(); escolherPrancha(); } }, icone('prancha'), prancha ? 'Trocar prancha' : 'Carregar prancha'))),
      botoes: [{ rotulo: 'Fechar', classe: 'btn-primario', valor: true }],
    });
  }

  // vindo da busca: esse caminhão fica ativo e as regiões dele aparecem destacadas
  if (camId && caminhaoPorId(camId)) mr.caminhaoAtivoId = camId;
  desenharAtivo();
  atualizar();
  await abrirPlanta();
  if (camId && planta?.pagina) {
    const minhas = regioes.filter((r) => r.caminhaoId === camId);
    if (minhas.length) {
      planta.selecionar(minhas.map((r) => r.id));
      planta.enquadrar(minhas.flatMap((r) => r.pontos));
      setTimeout(() => planta?.selecionar(null), 6000);
    } else {
      toast('Este caminhão não tem região desenhada.');
    }
  }
}
