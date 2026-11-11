// Busca reversa: NF, Bet ou elemento → MR e caminhão.
import { normalizarElemento, compararNatural } from './mr.js';

const LIMITE = 60;

// Devolve [{ mr, caminhao|null, motivos: [texto] }], MR mais recente primeiro.
// caminhao null = elemento do MR de Pilares que ficou sem caminhão.
export function buscar(texto, mrs, caminhoes) {
  const q = normalizarElemento(texto);
  if (!q) return [];
  const soDigitos = /^\d+$/.test(q);
  const porId = new Map(mrs.map((m) => [m.id, m]));
  const achados = [];
  const usados = new Map(); // mrId → Set(elementos com caminhão)

  for (const c of caminhoes) {
    const mr = porId.get(c.mrId);
    if (!mr) continue;
    if (!usados.has(mr.id)) usados.set(mr.id, new Set());
    for (const e of c.elementos || []) usados.get(mr.id).add(e);
    const motivos = [];
    if (soDigitos && q.length >= 3 && c.nf != null && String(c.nf).includes(q)) motivos.push(`NF ${c.nf}`);
    if (c.bet && normalizarElemento(c.bet).includes(q)) motivos.push(`Bet ${c.bet}`);
    for (const e of c.elementos || []) {
      if (e === q || (q.length >= 2 && e.startsWith(q))) motivos.push(e);
    }
    if (motivos.length) achados.push({ mr, caminhao: c, motivos });
  }
  // elementos sem caminhão (Pilares)
  for (const mr of mrs) {
    const u = usados.get(mr.id) || new Set();
    const sem = (mr.elementos || []).filter((e) => !u.has(e) && (e === q || (q.length >= 2 && e.startsWith(q))));
    if (sem.length) achados.push({ mr, caminhao: null, motivos: sem });
  }
  achados.sort((a, b) => (b.mr.data || '').localeCompare(a.mr.data || '')
    || compararNatural(a.mr.local, b.mr.local)
    || (a.caminhao?.item ?? 9999) - (b.caminhao?.item ?? 9999));
  return achados.slice(0, LIMITE);
}
