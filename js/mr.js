// Regras do MR: formatos, valores derivados (sem campo novo) e listas de elementos.

export const TIPOS = {
  pilares: { rotulo: 'Pilares', titulo: 'PILARES' },
  laje: { rotulo: 'Laje', titulo: 'LAJE' },
};

export const STATUS_MR = {
  campo: { rotulo: 'Em campo' },
  concluido: { rotulo: 'Concluído' },
  tcs: { rotulo: 'TCPs completos' },
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

// ---------- TCP: teste de corpo de prova (MPa) ----------

export const IDADES_TC = [
  { campo: 'tc7', dias: 7, rotulo: 'TCP 7d' },
  { campo: 'tc28', dias: 28, rotulo: 'TCP 28d' },
  { campo: 'tc60', dias: 60, rotulo: 'TCP 60d' },
];

// Data da concretagem + dias (ISO). Só informativo: data prevista do rompimento.
export function somarDias(iso, dias) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return hojeISO(new Date(a, m - 1, d + dias));
}

// Regra do usuário: "TCPs completos" quando todos os caminhões têm 7 e 28 dias.
export function tcsCompletos(caminhoes) {
  return caminhoes.length > 0 && caminhoes.every((c) => c.tc7 != null && c.tc28 != null);
}

// Status após mudança nos TCPs. "Em campo" não muda; Concluído ↔ TCPs completos.
export function statusComTcs(status, caminhoes) {
  if (status === 'campo') return status;
  return tcsCompletos(caminhoes) ? 'tcs' : 'concluido';
}

// ---------- dimensões dos pilares (só MR de Pilares) ----------
// Medidas informadas pelo usuário (m). Altura fixa.
export const LADOS_A = [0.20, 0.25, 1.25, 1.40, 1.45, 1.50, 1.60, 1.70, 1.80, 2.00, 2.30, 2.34];
export const LADOS_B = [0.20, 0.25, 0.30, 0.40, 0.50];
export const ALTURA_PILAR = 2.70;

// d = { a, b } em m → m³ (ou null se faltar medida)
export function volumePilar(d) {
  if (!d || !(d.a > 0) || !(d.b > 0)) return null;
  return Math.round(d.a * d.b * ALTURA_PILAR * 1000) / 1000;
}

// Total dos elementos com medida; "concretado" = já ligado a algum caminhão.
// outrosConcretados: elementos concretados fora deste MR (ex.: junto com a laje)
export function resumoPilares(mr, caminhoes, outrosConcretados = new Set()) {
  const dims = mr.dimensoes || {};
  const usados = mapaElementos(caminhoes);
  let total = 0;
  let concretado = 0;
  let volLaje = 0;
  const comLaje = new Set(mr.comLaje || []); // marcados para concretar junto com a laje
  const semMedida = [];
  for (const e of mr.elementos || []) {
    const v = volumePilar(dims[e]);
    if (v == null) { semMedida.push(e); continue; }
    total += v;
    if (usados.has(e) || outrosConcretados.has(e)) concretado += v;
    else if (comLaje.has(e)) volLaje += v;
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return { total: r3(total), concretado: r3(concretado), comLaje: r3(volLaje), falta: r3(total - concretado - volLaje), comMedida: (mr.elementos || []).length - semMedida.length, semMedida };
}

// Pilares sem caminhão que foram marcados para concretar junto com a laje (mr.comLaje, opcional).
export function marcadosComLaje(mr, caminhoes) {
  const usados = mapaElementos(caminhoes);
  return (mr.comLaje || []).filter((e) => (mr.elementos || []).includes(e) && !usados.has(e));
}
