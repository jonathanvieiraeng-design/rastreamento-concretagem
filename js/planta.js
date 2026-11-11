// Prancha (pdf.js) com zoom, arraste e desenho das regiões com a Apple Pencil.
//
// Sistemas de coordenadas:
// - "pt": espaço da prancha (viewport do pdf.js em escala 1). É o que se grava.
// - "mundo": a página ajustada à tela em escala 1 (this.bw × this.bh px CSS); mundo = pt × this.ajuste.
// - tela: a vista aplica translate(tx, ty) scale(s) sobre o mundo.
//   tela = t + pt × ajuste × s
//
// Render da prancha em duas camadas (limite de canvas do iOS), como no app de pilares:
// - base: página inteira em resolução fixa; detalhe: região visível ao fim de cada gesto.
// As regiões ficam num canvas do tamanho da tela, redesenhado a cada mudança de vista
// (fica nítido em qualquer zoom). O traço em andamento tem um canvas próprio, desenhado
// direto no evento da caneta para não ter atraso.
//
// Entrada:
// - Só pointerType "pen" desenha. Dedo: arraste, pinça e toque (seleciona região).
// - Enquanto a caneta está na tela, todo toque de dedo é ignorado (rejeição de palma).
//   Se a palma encostou um instante antes da caneta e começou a mover a vista,
//   a vista volta para onde estava.

import * as pdfjsLib from '../vendor/pdf.min.mjs';
import { el, limitarEscala, LIMITE_LADO, LIMITE_AREA } from './util.js';
import { rgba } from './cores.js';
import { simplificar, area, contem, pontoRotulo } from './geometria.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

export function abrirPdf(buf) {
  // pdf.js transfere o buffer para o worker; passa uma cópia para manter o original.
  return pdfjsLib.getDocument({
    data: new Uint8Array(buf.slice(0)),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
}

const LIMIAR_ARRASTE = 8;        // px até um toque virar arraste
const S_MIN = 0.5;
const PAUSA_APOS_CANETA = 350;   // ms em que toques de dedo ainda são ignorados após a caneta subir
const JANELA_PALMA = 400;        // ms: gesto de dedo iniciado até aqui antes da caneta é desfeito
const PASSO_MIN_TRACO = 1.2;     // px de tela entre pontos gravados
const TRACO_MIN = 14;            // px de tela: traço mais curto que isso é descartado
const AREA_MIN_TELA = 120;       // px² de tela: região menor que isso é descartada

function liberarCanvas(c) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

export class Planta {
  constructor(raiz, eventos = {}) {
    this.ev = eventos;
    this.regioes = [];           // [{ id, pontos, cor, item, rotulo }]
    this.opacidade = 0.33;
    this.selecionadas = new Set();
    this.corTraco = '#000';
    this.mouseDesenha = false;   // teste no computador
    this.navegacaoTravada = false;
    this.s = 1;
    this.tx = 0;
    this.ty = 0;
    this.ponteiros = new Map();  // dedos/mouse ativos (navegação)
    this.ignorados = new Set();  // dedos ignorados (palma)
    this.gesto = null;
    this.traco = null;
    this.canetaSubiuEm = 0;

    this.vista = el('div', { class: 'planta-vista' });
    this.mundo = el('div', { class: 'planta-mundo' });
    this.canvasBase = el('canvas', { class: 'planta-base' });
    this.canvasDetalhe = null;
    this.canvasRegioes = el('canvas', { class: 'planta-camada' });
    this.canvasTraco = el('canvas', { class: 'planta-camada' });
    this.mundo.append(this.canvasBase);
    this.vista.append(this.mundo, this.canvasRegioes, this.canvasTraco);
    raiz.append(this.vista);

    this._ligarGestos();
    this.observador = new ResizeObserver(() => this._aoRedimensionar());
    this.observador.observe(this.vista);
  }

  async carregar(buf, numeroPagina) {
    this.pdf = await abrirPdf(buf);
    this.pagina = await this.pdf.getPage(Math.min(numeroPagina || 1, this.pdf.numPages));
    const vp = this.pagina.getViewport({ scale: 1 });
    this.pw = vp.width;
    this.ph = vp.height;
    this._medir();
    this.ajustar();
    await this._renderBase();
  }

  destruir() {
    this.observador.disconnect();
    clearTimeout(this.timerDetalhe);
    this.tarefaDetalhe?.cancel();
    liberarCanvas(this.canvasBase);
    liberarCanvas(this.canvasDetalhe);
    liberarCanvas(this.canvasRegioes);
    liberarCanvas(this.canvasTraco);
    this.pdf?.destroy();
    this.vista.remove();
  }

  // ---------- geometria ----------

  _medir() {
    const r = this.vista.getBoundingClientRect();
    this.vw = r.width;
    this.vh = r.height;
    this.ajuste = Math.min(this.vw / this.pw, this.vh / this.ph);
    this.bw = this.pw * this.ajuste;
    this.bh = this.ph * this.ajuste;
    // zoom máximo: 1 pt da prancha = 8 px na tela
    this.sMax = Math.max(4, 8 / this.ajuste);
    this.mundo.style.width = `${this.bw}px`;
    this.mundo.style.height = `${this.bh}px`;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    for (const c of [this.canvasRegioes, this.canvasTraco]) {
      c.width = Math.round(this.vw * this.dpr);
      c.height = Math.round(this.vh * this.dpr);
    }
  }

  _aoRedimensionar() {
    if (!this.pagina) return;
    const r = this.vista.getBoundingClientRect();
    if (r.width === this.vw && r.height === this.vh) return;
    if (!r.width || !r.height) return;
    const cx = (this.vw / 2 - this.tx) / (this.bw * this.s);
    const cy = (this.vh / 2 - this.ty) / (this.bh * this.s);
    this._medir();
    this.tx = this.vw / 2 - cx * this.bw * this.s;
    this.ty = this.vh / 2 - cy * this.bh * this.s;
    this._limitar();
    this._aplicar();
    this._posicionarDetalhe(null);
    this._agendarDetalhe();
  }

  ajustar() {
    this.s = 1;
    this.tx = (this.vw - this.bw) / 2;
    this.ty = (this.vh - this.bh) / 2;
    this._aplicar();
    this._agendarDetalhe();
  }

  zoomEm(x, y, fator) {
    const wx = (x - this.tx) / this.s;
    const wy = (y - this.ty) / this.s;
    this.s = Math.min(this.sMax, Math.max(S_MIN, this.s * fator));
    this.tx = x - wx * this.s;
    this.ty = y - wy * this.s;
    this._limitar();
    this._aplicar();
    this._agendarDetalhe();
  }

  zoomCentro(fator) {
    this.zoomEm(this.vw / 2, this.vh / 2, fator);
  }

  _limitar() {
    const mx = this.vw * 0.5;
    const my = this.vh * 0.5;
    this.tx = Math.min(mx, Math.max(mx - this.bw * this.s, this.tx));
    this.ty = Math.min(my, Math.max(my - this.bh * this.s, this.ty));
  }

  _aplicar() {
    this.mundo.style.transform = `translate3d(${this.tx}px, ${this.ty}px, 0) scale(${this.s})`;
    this._desenharRegioes();
  }

  _agendarAplicar() {
    if (this.quadro) return;
    this.quadro = requestAnimationFrame(() => {
      this.quadro = null;
      this._aplicar();
    });
  }

  // tela → pt
  paraPt(x, y) {
    const k = this.ajuste * this.s;
    return [(x - this.tx) / k, (y - this.ty) / k];
  }

  _local(e) {
    const r = this.vista.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------- render da prancha ----------

  async _renderBase() {
    const dpr = window.devicePixelRatio || 1;
    this.escalaBase = limitarEscala(this.pw, this.ph, this.ajuste * dpr * 2.5);
    const vp = this.pagina.getViewport({ scale: this.escalaBase });
    const c = this.canvasBase;
    c.width = Math.floor(vp.width);
    c.height = Math.floor(vp.height);
    await this.pagina.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }

  _agendarDetalhe() {
    clearTimeout(this.timerDetalhe);
    this.timerDetalhe = setTimeout(() => this._renderDetalhe(), 180);
  }

  async _renderDetalhe() {
    if (!this.pagina || this.gesto || this.traco) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const escalaTela = this.ajuste * this.s * dpr;
    this.tarefaDetalhe?.cancel();
    if (!this.escalaBase || escalaTela <= this.escalaBase * 1.05) {
      this._posicionarDetalhe(null);
      return;
    }
    const x0 = Math.max(0, -this.tx / this.s);
    const y0 = Math.max(0, -this.ty / this.s);
    const x1 = Math.min(this.bw, (this.vw - this.tx) / this.s);
    const y1 = Math.min(this.bh, (this.vh - this.ty) / this.s);
    if (x1 <= x0 || y1 <= y0) return;

    let w = (x1 - x0) * this.s * dpr;
    let h = (y1 - y0) * this.s * dpr;
    const k = Math.min(1, LIMITE_LADO / w, LIMITE_LADO / h, Math.sqrt((LIMITE_AREA * 0.98) / (w * h)));
    const escala = escalaTela * k;
    w = Math.floor(w * k);
    h = Math.floor(h * k);

    const viewport = this.pagina.getViewport({
      scale: escala,
      offsetX: -(x0 / this.ajuste) * escala,
      offsetY: -(y0 / this.ajuste) * escala,
    });
    const novo = el('canvas', { class: 'planta-detalhe' });
    novo.width = w;
    novo.height = h;
    const ficha = (this.fichaDetalhe = {});
    const tarefa = (this.tarefaDetalhe = this.pagina.render({ canvasContext: novo.getContext('2d'), viewport }));
    try {
      await tarefa.promise;
    } catch (e) {
      liberarCanvas(novo);
      return;
    }
    if (ficha !== this.fichaDetalhe) {
      liberarCanvas(novo);
      return;
    }
    this._posicionarDetalhe({ canvas: novo, x0, y0, x1, y1 });
  }

  _posicionarDetalhe(d) {
    if (this.canvasDetalhe) {
      this.canvasDetalhe.remove();
      liberarCanvas(this.canvasDetalhe);
      this.canvasDetalhe = null;
    }
    if (!d) return;
    Object.assign(d.canvas.style, {
      left: `${d.x0}px`,
      top: `${d.y0}px`,
      width: `${d.x1 - d.x0}px`,
      height: `${d.y1 - d.y0}px`,
    });
    this.mundo.append(d.canvas);
    this.canvasDetalhe = d.canvas;
  }

  // ---------- regiões ----------

  // lista na ordem de desenho: a última fica por cima
  setRegioes(lista) {
    const cache = new Map(this.regioes.map((r) => [r.id, r]));
    this.regioes = lista.map((r) => {
      const ant = cache.get(r.id);
      const rotulo = ant && ant.pontos === r.pontos ? ant.rotulo : pontoRotulo(r.pontos);
      return { ...r, rotulo };
    });
    this._desenharRegioes();
  }

  setOpacidade(v) {
    this.opacidade = v;
    this._desenharRegioes();
  }

  // id, lista de ids ou null (limpa)
  selecionar(ids) {
    this.selecionadas = new Set(ids == null ? [] : Array.isArray(ids) ? ids : [ids]);
    this._desenharRegioes();
  }

  // Aproxima a vista para mostrar estes pontos (pt) com folga.
  enquadrar(pontos) {
    if (!this.pagina || !pontos.length) return;
    const xs = pontos.map((p) => p[0]);
    const ys = pontos.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 1) * this.ajuste;
    const h = Math.max(y1 - y0, 1) * this.ajuste;
    this.s = Math.min(this.sMax, Math.max(1, 0.6 * Math.min(this.vw / w, this.vh / h)));
    this.tx = this.vw / 2 - ((x0 + x1) / 2) * this.ajuste * this.s;
    this.ty = this.vh / 2 - ((y0 + y1) / 2) * this.ajuste * this.s;
    this._limitar();
    this._aplicar();
    this._agendarDetalhe();
  }

  // região de cima no ponto (pt)
  regiaoEm(px, py) {
    for (let i = this.regioes.length - 1; i >= 0; i--) {
      if (contem(this.regioes[i].pontos, px, py)) return this.regioes[i];
    }
    return null;
  }

  _desenharRegioes() {
    const c = this.canvasRegioes;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this.pagina || !this.regioes.length) return;
    const k = this.ajuste * this.s;
    const d = this.dpr;
    ctx.setTransform(d * k, 0, 0, d * k, d * this.tx, d * this.ty);
    ctx.lineJoin = 'round';
    for (const r of this.regioes) {
      const p = r.pontos;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fillStyle = rgba(r.cor, this.opacidade);
      ctx.fill('nonzero');
      const sel = this.selecionadas.has(r.id);
      ctx.lineWidth = (sel ? 4 : 1.6) / k;
      ctx.strokeStyle = r.cor;
      ctx.setLineDash(sel ? [8 / k, 5 / k] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // números (tamanho fixo na tela)
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 15px 'Open Sans', Helvetica, Arial, sans-serif";
    for (const r of this.regioes) {
      const x = this.tx + r.rotulo[0] * k;
      const y = this.ty + r.rotulo[1] * k;
      if (x < -20 || y < -20 || x > this.vw + 20 || y > this.vh + 20) continue;
      const txt = String(r.item);
      const raio = txt.length > 1 ? 14 : 12;
      ctx.beginPath();
      ctx.arc(x, y, raio, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = r.cor;
      ctx.stroke();
      ctx.fillStyle = '#1A1A1A';
      ctx.fillText(txt, x, y + 0.5);
    }
  }

  // ---------- traço da caneta ----------

  _ehCaneta(e) {
    return e.pointerType === 'pen' || (this.mouseDesenha && e.pointerType === 'mouse');
  }

  _iniciarTraco(e) {
    if (!this.ev.podeDesenhar?.()) {
      this.ev.aoNaoPoderDesenhar?.();
      return;
    }
    // palma encostou antes da caneta: desfaz o que ela moveu e ignora esses dedos
    const g = this.gesto;
    if (g && (g.tipo === 'arraste' || g.tipo === 'pinca') && Date.now() - g.t0 < JANELA_PALMA) {
      this.s = g.sIni;
      this.tx = g.txIni;
      this.ty = g.tyIni;
      this._aplicar();
    }
    for (const id of this.ponteiros.keys()) this.ignorados.add(id);
    this.ponteiros.clear();
    this.gesto = null;
    clearTimeout(this.timerDetalhe);

    const pos = this._local(e);
    this.traco = { id: e.pointerId, tela: [pos], pts: [this.paraPt(pos.x, pos.y)], comprimento: 0 };
    capturar(this.vista, e.pointerId);
    const ctx = this.canvasTraco.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.corTraco;
  }

  _moverTraco(e) {
    const t = this.traco;
    const ctx = this.canvasTraco.getContext('2d');
    const eventos = e.getCoalescedEvents?.() || [];
    const lista = eventos.length ? eventos : [e];
    ctx.beginPath();
    let ult = t.tela[t.tela.length - 1];
    ctx.moveTo(ult.x, ult.y);
    let desenhou = false;
    for (const ev of lista) {
      const pos = this._local(ev);
      const dist = Math.hypot(pos.x - ult.x, pos.y - ult.y);
      if (dist < PASSO_MIN_TRACO) continue;
      t.comprimento += dist;
      t.tela.push(pos);
      t.pts.push(this.paraPt(pos.x, pos.y));
      ctx.lineTo(pos.x, pos.y);
      ult = pos;
      desenhou = true;
    }
    if (desenhou) ctx.stroke();
  }

  _limparTraco() {
    const ctx = this.canvasTraco.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasTraco.width, this.canvasTraco.height);
  }

  _fimTraco(cancelado) {
    const t = this.traco;
    this.traco = null;
    this.canetaSubiuEm = Date.now();
    this._agendarDetalhe();
    if (cancelado) {
      this._limparTraco();
      this.ev.aoDescartarTraco?.('cancelado');
      return;
    }
    const k = this.ajuste * this.s;
    // fecha o contorno: o último ponto liga ao primeiro (implícito no polígono)
    const pts = simplificar(t.pts, 0.6 / k);
    if (t.comprimento < TRACO_MIN || pts.length < 3 || area(pts) * k * k < AREA_MIN_TELA) {
      this._limparTraco();
      this.ev.aoDescartarTraco?.('pequeno');
      return;
    }
    // o canvas do traço só é limpo depois que a região nova é desenhada (sem piscar)
    Promise.resolve(this.ev.aoFecharContorno?.(pts.map(([x, y]) => [round2(x), round2(y)])))
      .finally(() => this._limparTraco());
  }

  // ---------- gestos ----------

  _ligarGestos() {
    const v = this.vista;
    v.addEventListener('pointerdown', (e) => this._baixo(e));
    v.addEventListener('pointermove', (e) => this._mover(e));
    v.addEventListener('pointerup', (e) => this._cima(e, false));
    v.addEventListener('pointercancel', (e) => this._cima(e, true));
    // bloqueia lupa, seleção e menu do iOS ao segurar a caneta/dedo
    const bloquear = (e) => { if (e.cancelable) e.preventDefault(); };
    v.addEventListener('touchstart', bloquear, { passive: false });
    v.addEventListener('touchmove', bloquear, { passive: false });
    v.addEventListener('contextmenu', bloquear);
    v.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.navegacaoTravada) return;
      const { x, y } = this._local(e);
      this.zoomEm(x, y, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  _baixo(e) {
    if (!this.pagina) return;
    if (e.cancelable) e.preventDefault();
    if (this._ehCaneta(e)) {
      if (!this.traco) this._iniciarTraco(e);
      return;
    }
    // dedo (ou mouse sem modo de desenho)
    if (this.traco || Date.now() - this.canetaSubiuEm < PAUSA_APOS_CANETA) {
      this.ignorados.add(e.pointerId);
      return;
    }
    capturar(this.vista, e.pointerId);
    const pos = this._local(e);
    this.ponteiros.set(e.pointerId, pos);
    clearTimeout(this.timerDetalhe);
    const ini = { t0: Date.now(), sIni: this.s, txIni: this.tx, tyIni: this.ty };

    if (this.ponteiros.size === 1) {
      this.gesto = { tipo: 'toque', x0: pos.x, y0: pos.y, tx0: this.tx, ty0: this.ty, ...ini };
    } else if (this.ponteiros.size === 2) {
      const [a, b] = [...this.ponteiros.values()];
      const ant = this.gesto || ini;
      this.gesto = {
        tipo: 'pinca',
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s0: this.s,
        mx0: (a.x + b.x) / 2,
        my0: (a.y + b.y) / 2,
        tx0: this.tx,
        ty0: this.ty,
        t0: ant.t0, sIni: ant.sIni, txIni: ant.txIni, tyIni: ant.tyIni,
      };
    }
  }

  _mover(e) {
    if (this.traco) {
      if (e.pointerId === this.traco.id) this._moverTraco(e);
      return;
    }
    if (!this.ponteiros.has(e.pointerId)) return;
    const pos = this._local(e);
    this.ponteiros.set(e.pointerId, pos);
    const g = this.gesto;
    if (!g) return;

    if (g.tipo === 'toque' || g.tipo === 'arraste') {
      const dx = pos.x - g.x0;
      const dy = pos.y - g.y0;
      if (g.tipo === 'toque' && Math.hypot(dx, dy) > LIMIAR_ARRASTE) g.tipo = 'arraste';
      if (g.tipo === 'arraste' && !this.navegacaoTravada) {
        this.tx = g.tx0 + dx;
        this.ty = g.ty0 + dy;
        this._limitar();
        this._agendarAplicar();
      }
    } else if (g.tipo === 'pinca' && this.ponteiros.size >= 2) {
      if (this.navegacaoTravada) return;
      const [a, b] = [...this.ponteiros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const s = Math.min(this.sMax, Math.max(S_MIN, (g.s0 * d) / g.d0));
      const wx = (g.mx0 - g.tx0) / g.s0;
      const wy = (g.my0 - g.ty0) / g.s0;
      this.s = s;
      this.tx = mx - wx * s;
      this.ty = my - wy * s;
      this._limitar();
      this._agendarAplicar();
    }
  }

  _cima(e, cancelado) {
    if (this.traco && e.pointerId === this.traco.id) {
      this._fimTraco(cancelado);
      return;
    }
    if (this.ignorados.delete(e.pointerId)) return;
    if (!this.ponteiros.has(e.pointerId)) return;
    this.ponteiros.delete(e.pointerId);
    const g = this.gesto;

    if (g?.tipo === 'pinca') {
      if (this.ponteiros.size === 1) {
        const [p] = [...this.ponteiros.values()];
        this.gesto = { ...g, tipo: 'arraste', x0: p.x, y0: p.y, tx0: this.tx, ty0: this.ty };
      } else {
        this.gesto = null;
        this._agendarDetalhe();
      }
      return;
    }
    if (this.ponteiros.size > 0) return;
    this.gesto = null;
    if (!g) return;
    if (!cancelado && g.tipo === 'toque' && Date.now() - g.t0 < 700) {
      const [px, py] = this.paraPt(g.x0, g.y0);
      this.ev.aoTocar?.(px, py);
    }
    this._agendarDetalhe();
  }
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// Mantém os eventos do ponteiro na vista mesmo se ele sair dela. Falha sem efeito se o ponteiro já sumiu.
function capturar(alvo, id) {
  try {
    alvo.setPointerCapture?.(id);
  } catch (e) { /* ponteiro já encerrado */ }
}
