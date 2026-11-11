// Componentes de interface: ícones, modais, avisos e indicador de carregamento.
import { el, compartilharArquivo, tamanhoLegivel } from './util.js';

const ICONES = {
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  relatorio: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  caminhao: '<path d="M3 7h10v9H3zM13 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  lista: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  ajustar: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  refazer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  legenda: '<path d="M9 6h11M9 12h11M9 18h11"/><rect x="3" y="4.5" width="3" height="3" rx=".6"/><rect x="3" y="10.5" width="3" height="3" rx=".6"/><rect x="3" y="16.5" width="3" height="3" rx=".6"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  prancha: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/>',
};

export function icone(nome) {
  const s = document.createElement('span');
  s.className = 'icone';
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
  return s;
}

// Cada botão fecha o modal com seu `valor`, ou chama `acao(fechar)`.
export function abrirModal({ titulo, corpo, botoes = [], classe = '', aoAbrir }) {
  return new Promise((resolve) => {
    const camada = document.getElementById('camada-modal');
    const fundo = el('div', { class: 'modal-fundo' });
    const caixa = el('div', { class: `modal ${classe}`, role: 'dialog', 'aria-modal': 'true' });
    const fechar = (valor) => {
      fundo.remove();
      resolve(valor);
    };
    if (titulo) caixa.append(el('h2', { class: 'modal-titulo' }, titulo));
    if (corpo) caixa.append(el('div', { class: 'modal-corpo' }, corpo));
    if (botoes.length) {
      const barra = el('div', { class: 'modal-botoes' });
      for (const b of botoes) {
        barra.append(el('button', {
          type: 'button',
          class: `btn ${b.classe || ''}`,
          style: b.estilo,
          onclick: () => (b.acao ? b.acao(fechar) : fechar(b.valor)),
        }, b.rotulo));
      }
      caixa.append(barra);
    }
    fundo.append(caixa);
    camada.append(fundo);
    aoAbrir?.(caixa, fechar);
  });
}

export function alerta(mensagem, titulo = 'Aviso') {
  return abrirModal({
    titulo,
    corpo: el('p', {}, mensagem),
    botoes: [{ rotulo: 'OK', classe: 'btn-primario', valor: true }],
  });
}

export function confirmar(mensagem, { titulo = 'Confirmar', rotuloOk = 'Confirmar', perigo = false } = {}) {
  return abrirModal({
    titulo,
    corpo: el('p', {}, mensagem),
    botoes: [
      { rotulo: 'Cancelar', valor: false },
      { rotulo: rotuloOk, classe: perigo ? 'btn-perigo' : 'btn-primario', valor: true },
    ],
  });
}

// Lista de opções empilhadas (estilo "action sheet").
export function escolher({ titulo, texto, opcoes, classe = '' }) {
  return abrirModal({
    titulo,
    classe: `modal-escolha ${classe}`,
    corpo: texto ? el('p', { class: 'nota' }, texto) : null,
    botoes: opcoes.map((o) => ({ rotulo: o.rotulo, valor: o.valor, classe: o.classe, estilo: o.estilo })),
  });
}

export function pedirTexto({ titulo, rotulo, valor = '', placeholder = '', rotuloOk = 'Salvar', perigo = false, maiusculas = false, validar }) {
  const input = el('input', {
    class: 'campo', type: 'text', value: valor, placeholder,
    autocapitalize: maiusculas ? 'characters' : 'sentences',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done',
  });
  const erro = el('p', { class: 'erro', hidden: true });
  const enviar = (fechar) => {
    const msg = validar?.(input.value);
    if (msg) {
      erro.textContent = msg;
      erro.hidden = false;
      return;
    }
    fechar(input.value);
  };
  return abrirModal({
    titulo,
    corpo: el('label', { class: 'rotulo-campo' }, rotulo ? el('span', {}, rotulo) : null, input, erro),
    botoes: [
      { rotulo: 'Cancelar', valor: null },
      { rotulo: rotuloOk, classe: perigo ? 'btn-perigo' : 'btn-primario', acao: enviar },
    ],
    aoAbrir: (caixa, fechar) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          enviar(fechar);
        }
      });
      input.addEventListener('input', () => { erro.hidden = true; });
      input.focus();
      input.select();
    },
  });
}

// Arquivo pronto → botão "Compartilhar" (o toque abre o menu do iOS).
// Resolve com 'compartilhado' | 'cancelado' | 'baixado' | null (fechou).
export function oferecerArquivo(arquivo, { titulo, texto }) {
  return abrirModal({
    titulo,
    corpo: el('div', { class: 'modal-corpo' },
      texto ? el('p', {}, texto) : null,
      el('div', { class: 'nome-arquivo' }, arquivo.name),
      el('p', { class: 'nota' }, tamanhoLegivel(arquivo.size))),
    botoes: [
      { rotulo: 'Fechar', valor: null },
      { rotulo: 'Compartilhar', classe: 'btn-primario', acao: (fechar) => fechar(compartilharArquivo(arquivo)) },
    ],
  });
}

let timerToast;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { t.hidden = true; }, 2800);
}

export function carregando(msg = 'Carregando…') {
  const camada = el('div', { class: 'carregando' },
    el('div', { class: 'carregando-caixa' }, el('div', { class: 'girador' }), el('span', {}, msg)));
  document.body.append(camada);
  return () => camada.remove();
}
