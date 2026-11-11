// Utilidades gerais: DOM, ids, datas e limites de canvas do iOS.

// Limites de canvas do Safari no iOS. Acima disso o canvas fica em branco sem erro.
export const LIMITE_LADO = 4096;
export const LIMITE_AREA = 16777216;

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const dois = (n) => String(n).padStart(2, '0');

export function dataISO(d = new Date()) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export function limitarEscala(larguraPt, alturaPt, escala) {
  let e = Math.min(escala, LIMITE_LADO / larguraPt, LIMITE_LADO / alturaPt);
  const area = larguraPt * e * alturaPt * e;
  if (area > LIMITE_AREA * 0.98) e *= Math.sqrt((LIMITE_AREA * 0.98) / area);
  return e;
}

const PROPRIEDADES = new Set(['value', 'checked', 'disabled', 'hidden', 'selected']);

export function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      // variáveis CSS (--cor) só funcionam com setProperty
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) e.style.setProperty(p, val);
        else e.style[p] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (PROPRIEDADES.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    e.append(f instanceof Node ? f : String(f));
  }
  return e;
}
