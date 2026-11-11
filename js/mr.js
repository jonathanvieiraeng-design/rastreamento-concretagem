// Regras do MR: formatos, valores derivados (sem campo novo) e listas de elementos.

export const TIPOS = {
  pilares: { rotulo: 'Pilares', titulo: 'PILARES' },
  laje: { rotulo: 'Laje', titulo: 'LAJE' },
};

export const STATUS_MR = {
  campo: { rotulo: 'Em campo' },
  concluido: { rotulo: 'Concluído' },
  tcs: { rotulo: 'TCs completos' },
};

// Padrão informado pelo usuário; depois vale o último usado.
export const ESPECIFICACAO_PADRAO = 'CONCRETO USINADO FCK 40 12+-2';

const dois = (n) => String(n).padStart(2, '0');

export function horaAgora(d = new Date()) {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

// "HH:MM" → minutos do dia
export function minutos(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// HT − HI em minutos. Se HT < HI, considera que passou da meia-noite.
export function duracao(hi, ht) {
  const a = minutos(hi);
  const b = minutos(ht);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

export function fmtDuracao(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${dois(min % 60)} min`;
}

// Aceita vírgula ou ponto. Vazio → null.
export function lerNumero(txt) {
  const s = String(txt ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function fmtNumero(n, casas = null) {
  if (n == null || Number.isNaN(n)) return '';
  const op = casas == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: casas, maximumFractionDigits: casas };
  return n.toLocaleString('pt-BR', { useGrouping: false, ...op });
}

export const fmtTc = (n) => fmtNumero(n, 1);

export function fmtDataBr(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function hojeISO(d = new Date()) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

// Volume acumulado por Item (caminhões já em ordem).
export function acumulados(caminhoes) {
  let soma = 0;
  return caminhoes.map((c) => {
    soma += c.vol || 0;
    return Math.round(soma * 1000) / 1000;
  });
}

export function resumoMr(caminhoes) {
  const vol = caminhoes.reduce((s, c) => s + (c.vol || 0), 0);
  const his = caminhoes.map((c) => c.hi).filter((h) => minutos(h) != null);
  const hts = caminhoes.map((c) => c.ht).filter((h) => minutos(h) != null);
  return {
    caminhoes: caminhoes.length,
    volume: Math.round(vol * 1000) / 1000,
    inicio: his[0] || null,
    termino: hts.length ? hts[hts.length - 1] : null,
  };
}

// Nome de elemento como o usuário vê: espaços simples, maiúsculas. "P07" continua "P07".
export function normalizarElemento(nome) {
  return String(nome || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

// Lista colada no formato atual ("P11; P12; PA4") — aceita também quebra de linha.
// Remove vazios e repetidos, mantém a ordem.
export function lerListaElementos(texto) {
  const vistos = new Set();
  const lista = [];
  for (const parte of String(texto || '').split(/[;\n\r]+/)) {
    const n = normalizarElemento(parte);
    if (n && !vistos.has(n)) {
      vistos.add(n);
      lista.push(n);
    }
  }
  return lista;
}

export const juntarElementos = (lista) => (lista || []).join('; ');

export const compararNatural = (a, b) =>
  String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });

// elemento → [caminhões] (ordem do Item)
export function mapaElementos(caminhoes) {
  const m = new Map();
  for (const c of caminhoes) {
    for (const e of c.elementos || []) {
      if (!m.has(e)) m.set(e, []);
      m.get(e).push(c);
    }
  }
  return m;
}

export function naoVinculados(mr, caminhoes) {
  const usados = mapaElementos(caminhoes);
  return (mr.elementos || []).filter((e) => !usados.has(e));
}

// Nome seguro para arquivo: sem acentos, só A–Z, 0–9 e hífen; corta em ~40 caracteres.
export function slug(txt, max = 40) {
  const s = String(txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s.length > max ? s.slice(0, max).replace(/-[^-]*$/, '') || s.slice(0, max) : s;
}

export function nomeArquivoMr(mr, ext) {
  return `MR-${TIPOS[mr.tipo].titulo}-${slug(mr.local) || 'SEM-LOCAL'}-${mr.data}.${ext}`;
}

// ---------- TCs (MPa) ----------

export const IDADES_TC = [
  { campo: 'tc7', dias: 7, rotulo: 'TC 7d' },
  { campo: 'tc28', dias: 28, rotulo: 'TC 28d' },
  { campo: 'tc60', dias: 60, rotulo: 'TC 60d' },
];

// Data da concretagem + dias (ISO). Só informativo: data prevista do rompimento.
export function somarDias(iso, dias) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return hojeISO(new Date(a, m - 1, d + dias));
}

// Regra do usuário: "TCs completos" quando todos os caminhões têm 7 e 28 dias.
export function tcsCompletos(caminhoes) {
  return caminhoes.length > 0 && caminhoes.every((c) => c.tc7 != null && c.tc28 != null);
}

// Status após mudança nos TCs. "Em campo" não muda; Concluído ↔ TCs completos.
export function statusComTcs(status, caminhoes) {
  if (status === 'campo') return status;
  return tcsCompletos(caminhoes) ? 'tcs' : 'concluido';
}
