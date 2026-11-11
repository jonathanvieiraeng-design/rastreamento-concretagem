// Troca de telas e rotas (#/…).
const app = () => document.getElementById('app');
let aoSairDaTela = null;
let tratarRota = () => {};

export function definirRotas(fn) {
  tratarRota = fn;
}

// Substitui a tela atual. `aoSair` roda quando a tela for trocada (liberar PDF, salvar pendências…).
export function montar(no, aoSair = null) {
  const anterior = aoSairDaTela;
  aoSairDaTela = aoSair;
  try {
    anterior?.();
  } catch (e) {
    console.warn(e);
  }
  app().replaceChildren(no);
}

export function ir(hash) {
  if (location.hash === hash) tratarRota();
  else location.hash = hash;
}

export function rotaAtual() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}
