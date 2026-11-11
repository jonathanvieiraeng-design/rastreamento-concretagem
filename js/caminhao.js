// Partes do caminhão comuns aos MRs de Pilares e de Laje:
// gravação automática, campos (NF, Bet, Vol, HI, HT), exclusão com renumeração e conferência.
import * as db from './db.js';
import { el, uid } from './util.js';
import { icone, alerta, confirmar, toast, carregando, oferecerArquivo, pedirTexto } from './ui.js';
import { horaAgora, lerNumero, fmtNumero } from './mr.js';

const ATRASO_GRAVAR = 400;

export function novoCaminhao(mrId, item) {
  return {
    id: uid(), mrId, item,
    nf: null, bet: '', hi: '', ht: '', vol: null, tc7: null, tc28: null, tc60: null, elementos: [],
  };
}

// Digitação grava com pequeno atraso; botões gravam na hora. Ao sair/ocultar o app, grava o pendente.
export function criarGravador(caminhoes) {
  const pendentes = new Map(); // id → timer
  const g = {
    depois(c) {
      clearTimeout(pendentes.get(c.id));
      pendentes.set(c.id, setTimeout(() => {
        pendentes.delete(c.id);
        db.gravar('caminhoes', c).catch((e) => alerta(`Não foi possível gravar: ${e.message}`, 'Erro'));
      }, ATRASO_GRAVAR));
    },
    async agora(c) {
      g.cancelar(c);
      await db.gravar('caminhoes', c);
    },
    cancelar(c) {
      clearTimeout(pendentes.get(c.id));
      pendentes.delete(c.id);
    },
    descarregar() {
      for (const [cid, t] of pendentes) {
        clearTimeout(t);
        const c = caminhoes.find((x) => x.id === cid);
        if (c) db.gravar('caminhoes', c);
      }
      pendentes.clear();
    },
  };
  const aoOcultar = () => { if (document.visibilityState === 'hidden') g.descarregar(); };
  document.addEventListener('visibilitychange', aoOcultar);
  window.addEventListener('pagehide', g.descarregar);
  g.desligar = () => {
    g.descarregar();
    document.removeEventListener('visibilitychange', aoOcultar);
    window.removeEventListener('pagehide', g.descarregar);
  };
  return g;
}

// Campos editáveis de um caminhão. aoMudar() é chamado quando NF, Vol, HI ou HT mudam.
export function camposCaminhao(c, g, aoMudar) {
  const entrada = (props) => el('input', { class: 'campo', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', ...props });
  const cNf = entrada({ value: c.nf ?? '', inputmode: 'numeric', enterkeyhint: 'next', 'aria-label': 'NF' });
  const cBet = entrada({ value: c.bet ?? '', enterkeyhint: 'next', 'aria-label': 'Betoneira' });
  const cVol = entrada({ value: fmtNumero(c.vol), inputmode: 'decimal', enterkeyhint: 'done', 'aria-label': 'Volume' });

  cNf.addEventListener('input', () => {
    const s = cNf.value.replace(/\D/g, '');
    if (s !== cNf.value) cNf.value = s;
    c.nf = s ? Number(s) : null;
    g.depois(c);
    aoMudar();
  });
  cBet.addEventListener('input', () => {
    c.bet = cBet.value.trim(); // sempre texto
    g.depois(c);
  });
  cVol.addEventListener('input', () => {
    const n = lerNumero(cVol.value);
    cVol.classList.toggle('invalido', Number.isNaN(n));
    if (Number.isNaN(n)) return;
    c.vol = n;
    g.depois(c);
    aoMudar();
  });

  const hora = (campo, rotulo) => {
    const cH = entrada({ type: 'time', value: c[campo] || '', 'aria-label': rotulo });
    cH.addEventListener('change', () => {
      c[campo] = cH.value || '';
      g.agora(c);
      aoMudar();
    });
    const btAgora = el('button', {
      type: 'button', class: 'btn btn-agora',
      onclick: async () => {
        const h = horaAgora();
        if (c[campo] && c[campo] !== h && !(await confirmar(`${rotulo} já está como ${c[campo]}. Trocar para ${h}?`, { rotuloOk: 'Trocar' }))) return;
        c[campo] = h;
        cH.value = h;
        await g.agora(c);
        aoMudar();
        toast(`${rotulo} do caminhão ${c.item}: ${h}`);
      },
    }, icone('relogio'), `${rotulo} agora`);
    return el('div', { class: 'bloco-hora' }, el('span', { class: 'rotulo-mini' }, rotulo), el('div', { class: 'linha-hora' }, btAgora, cH));
  };

  return {
    nf: el('label', { class: 'campo-mini campo-nf' }, el('span', { class: 'rotulo-mini' }, 'NF'), cNf),
    bet: el('label', { class: 'campo-mini campo-bet' }, el('span', { class: 'rotulo-mini' }, 'Bet'), cBet),
    vol: el('label', { class: 'campo-mini campo-vol' }, el('span', { class: 'rotulo-mini' }, 'Vol (m³)'), cVol),
    hi: hora('hi', 'HI'),
    ht: hora('ht', 'HT'),
  };
}

export function avisoNfRepetida(c, caminhoes) {
  if (c.nf == null) return '';
  const dup = caminhoes.filter((x) => x.id !== c.id && x.nf === c.nf);
  return dup.length ? `Atenção: NF ${c.nf} também está no caminhão ${dup.map((x) => x.item).join(', ')}.` : '';
}

// Pergunta, exclui e renumera os seguintes. `detalhe` entra na mensagem (ex.: regiões que serão apagadas).
// Devolve true se excluiu.
export async function excluirCaminhao(c, caminhoes, g, { detalhe = '', antes } = {}) {
  const seguintes = caminhoes.length - c.item;
  const msg = `Excluir o caminhão ${c.item}${c.nf ? ` (NF ${c.nf})` : ''}?`
    + detalhe
    + (seguintes === 1 ? ` O caminhão seguinte será renumerado (Item ${c.item + 1} vira ${c.item}).` : '')
    + (seguintes > 1 ? ` Os ${seguintes} caminhões seguintes serão renumerados (Item ${c.item + 1} vira ${c.item}…).` : '')
    + ' Não dá para desfazer.';
  if (!(await confirmar(msg, { titulo: 'Excluir caminhão', rotuloOk: 'Excluir', perigo: true }))) return false;
  g.cancelar(c);
  await antes?.();
  await db.excluir('caminhoes', c.id);
  caminhoes.splice(caminhoes.indexOf(c), 1);
  const mudados = [];
  caminhoes.forEach((x, i) => {
    if (x.item !== i + 1) { x.item = i + 1; mudados.push(x); }
  });
  if (mudados.length) await db.gravarVarios('caminhoes', mudados);
  toast('Caminhão excluído');
  return true;
}

// Campos do registro do caminhão que estão vazios.
export function camposFaltando(c) {
  const f = [];
  if (c.nf == null) f.push('NF');
  if (!c.bet) f.push('Bet');
  if (!c.hi) f.push('HI');
  if (!c.ht) f.push('HT');
  if (c.vol == null) f.push('Vol');
  return f;
}

// Mostra a conferência; devolve true para concluir.
export async function conferirAntesDeConcluir(faltas, abrirModal) {
  if (!faltas.length) return true;
  return abrirModal({
    titulo: 'Conferência antes de concluir',
    corpo: el('div', { class: 'modal-corpo' }, el('ul', { class: 'lista-faltas' }, faltas.map((f) => el('li', {}, f)))),
    botoes: [{ rotulo: 'Voltar e completar', valor: false }, { rotulo: 'Concluir assim', classe: 'btn-primario', valor: true }],
  });
}

// Gera o relatório PDF e oferece Compartilhar/Salvar. `extra` vai para o gerador (prancha e regiões da laje).
export async function oferecerRelatorio(mr, obra, caminhoes, extra) {
  const fim = carregando('Gerando relatório…');
  let arquivo;
  try {
    const { gerarRelatorioMr } = await import('./relatorio.js');
    arquivo = await gerarRelatorioMr(mr, obra, caminhoes, extra);
  } catch (e) {
    console.error(e);
    alerta(`Não foi possível gerar o relatório: ${e.message}`, 'Erro');
    return;
  } finally {
    fim();
  }
  try {
    await oferecerArquivo(arquivo, {
      titulo: 'Relatório pronto',
      texto: 'Toque em Compartilhar e escolha "Salvar em Arquivos" → pasta do OneDrive da obra.',
    });
  } catch (e) {
    alerta(`Erro ao compartilhar: ${e.message}`, 'Erro');
  }
}

// Exclui o MR inteiro (caminhões, regiões e prancha) depois de digitar EXCLUIR. Devolve true se excluiu.
export async function excluirMrConfirmado(mr) {
  const n = (await db.listarDoMr('caminhoes', mr.id)).length;
  const v = await pedirTexto({
    titulo: 'Excluir MR',
    rotulo: `Isso apaga o MR "${mr.local}"${n ? ` e ${n === 1 ? 'o caminhão registrado' : `os ${n} caminhões registrados`}` : ''}`
      + `${mr.tipo === 'laje' ? ', os desenhos e a prancha' : ''}. Não dá para desfazer. Digite EXCLUIR para confirmar.`,
    rotuloOk: 'Excluir',
    perigo: true,
    maiusculas: true,
    validar: (x) => (x.trim().toUpperCase() === 'EXCLUIR' ? null : 'Digite EXCLUIR.'),
  });
  if (v == null) return false;
  await db.limparMr(mr.id, { excluirMr: true });
  if (mr.pranchaId) await db.excluir('pranchas', mr.pranchaId);
  toast('MR excluído');
  return true;
}
