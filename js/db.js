// Persistência em IndexedDB. Cada alteração é gravada na hora (sem botão "salvar").
// Lojas: obras, cadastros (listas de elementos), mrs, caminhoes, regioes, pranchas (PDF), meta.
// PDFs são gravados como ArrayBuffer (mais estável no Safari que Blob).

const NOME_BD = 'rastreamento-concretagem';
export const VERSAO_SCHEMA = 2;

let bdPromessa;

function abrir() {
  if (!bdPromessa) {
    bdPromessa = new Promise((resolve, rejeitar) => {
      const req = indexedDB.open(NOME_BD, VERSAO_SCHEMA);
      req.onupgradeneeded = () => {
        const bd = req.result;
        const criar = (nome, chave, indices = []) => {
          if (bd.objectStoreNames.contains(nome)) return;
          const s = bd.createObjectStore(nome, { keyPath: chave });
          for (const i of indices) s.createIndex(i, i);
        };
        criar('pranchas', 'id');
        criar('mrs', 'id');
        criar('caminhoes', 'id', ['mrId']);
        criar('regioes', 'id', ['mrId']);
        criar('meta', 'chave');
        criar('obras', 'id');
        criar('cadastros', 'id');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => rejeitar(req.error);
    });
  }
  return bdPromessa;
}

function pedido(req) {
  return new Promise((resolve, rejeitar) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => rejeitar(req.error);
  });
}

function fimTransacao(tx) {
  return new Promise((resolve, rejeitar) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error || new Error('Transação cancelada'));
  });
}

async function loja(nome, modo = 'readonly') {
  const bd = await abrir();
  return bd.transaction(nome, modo).objectStore(nome);
}

export async function obter(nomeLoja, id) {
  return pedido((await loja(nomeLoja)).get(id));
}

export async function listar(nomeLoja) {
  return pedido((await loja(nomeLoja)).getAll());
}

export async function gravar(nomeLoja, obj) {
  obj.atualizadoEm = new Date().toISOString();
  await pedido((await loja(nomeLoja, 'readwrite')).put(obj));
  return obj;
}

// Grava vários objetos da mesma loja numa transação (ex.: renumerar caminhões).
export async function gravarVarios(nomeLoja, objs) {
  const bd = await abrir();
  const tx = bd.transaction(nomeLoja, 'readwrite');
  const s = tx.objectStore(nomeLoja);
  const quando = new Date().toISOString();
  for (const o of objs) {
    o.atualizadoEm = quando;
    s.put(o);
  }
  return fimTransacao(tx);
}

export async function excluir(nomeLoja, id) {
  return pedido((await loja(nomeLoja, 'readwrite')).delete(id));
}

export async function listarDoMr(nomeLoja, mrId) {
  const s = await loja(nomeLoja);
  return pedido(s.index('mrId').getAll(IDBKeyRange.only(mrId)));
}

// Apaga caminhões e regiões de um MR (e o próprio MR, se pedido) numa única transação.
export async function limparMr(mrId, { excluirMr = false } = {}) {
  const bd = await abrir();
  const tx = bd.transaction(['mrs', 'caminhoes', 'regioes'], 'readwrite');
  for (const nome of ['caminhoes', 'regioes']) {
    const s = tx.objectStore(nome);
    const req = s.index('mrId').openKeyCursor(IDBKeyRange.only(mrId));
    req.onsuccess = () => {
      const c = req.result;
      if (c) { s.delete(c.primaryKey); c.continue(); }
    };
  }
  if (excluirMr) tx.objectStore('mrs').delete(mrId);
  return fimTransacao(tx);
}

export async function obterMeta(chave) {
  const r = await obter('meta', chave);
  return r ? r.valor : undefined;
}

export async function salvarMeta(chave, valor) {
  return pedido((await loja('meta', 'readwrite')).put({ chave, valor }));
}

// Restauração de backup: grava como veio (mantém o "atualizadoEm" original), numa transação.
export async function gravarComoVeio(nomeLoja, objs) {
  if (!objs.length) return;
  const bd = await abrir();
  const tx = bd.transaction(nomeLoja, 'readwrite');
  const s = tx.objectStore(nomeLoja);
  for (const o of objs) s.put(o);
  return fimTransacao(tx);
}
