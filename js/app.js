// Entrada do app: rotas e service worker.
import { definirRotas, rotaAtual } from './nav.js';
import { alerta } from './ui.js';
import { telaInicio } from './tela-inicio.js';
import { telaFormMr } from './tela-form-mr.js';
import { telaCadastros, telaFormCadastro } from './tela-cadastros.js';
import { telaMrPilares } from './tela-mr-pilares.js';
import { telaLaje } from './tela-laje.js';
import * as db from './db.js';

async function rota() {
  const p = rotaAtual();
  try {
    if (p[0] === 'novo') await telaFormMr(null);
    else if (p[0] === 'mr' && p[1] && p[2] === 'editar') await telaFormMr(p[1]);
    else if (p[0] === 'mr' && p[1]) {
      const mr = await db.obter('mrs', p[1]);
      if (mr?.tipo === 'pilares') await telaMrPilares(p[1]);
      else location.hash = '#/';
    } else if (p[0] === 'cadastros' && p[1]) await telaFormCadastro(p[1] === 'novo' ? null : p[1]);
    else if (p[0] === 'cadastros') await telaCadastros();
    else if (p[0] === 'prototipo-laje') await telaLaje();
    else await telaInicio();
  } catch (e) {
    console.error(e);
    alerta(`Ocorreu um erro: ${e.message}`, 'Erro');
  }
}

function iniciarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // no computador (desenvolvimento) o cache atrapalharia ver as alterações
  if (location.hostname === 'localhost') {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }
  const faixa = document.getElementById('faixa-atualizacao');
  let recarregar = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregar) location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const mostrar = () => { faixa.hidden = false; };
    if (reg.waiting && navigator.serviceWorker.controller) mostrar();
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      novo?.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) mostrar();
      });
    });
    faixa.querySelector('button').addEventListener('click', () => {
      recarregar = true;
      if (reg.waiting) reg.waiting.postMessage('pular-espera');
      else location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('Service worker não registrado', e));
}

document.addEventListener('gesturestart', (e) => e.preventDefault());
navigator.storage?.persist?.().catch(() => {});
definirRotas(rota);
window.addEventListener('hashchange', rota);
iniciarServiceWorker();
rota();
