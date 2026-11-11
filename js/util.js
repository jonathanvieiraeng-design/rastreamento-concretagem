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

export function bufParaBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(s);
}

export function hexParaRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function tamanhoLegivel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// Precisa ser chamada direto do toque do usuário, antes de qualquer await:
// o iOS só abre o menu de compartilhar com gesto ativo.
export async function compartilharArquivo(arquivo) {
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo] });
      return 'compartilhado';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelado';
      throw e;
    }
  }
  baixarArquivo(arquivo);
  return 'baixado';
}

export function baixarArquivo(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const PROPRIEDADES =new Set(['value', 'checked', 'disabled', 'hidden', 'selected']);

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
