// Persistência em IndexedDB. Cada alteração é gravada na hora (sem botão "salvar").
// Lojas: pranchas (PDF), mrs, caminhoes, regioes, meta.
// PDFs são gravados como ArrayBuffer (mais estável no Safari que Blob).

const NOME_BD = 'rastreamento-concretagem';
export const VERSAO_SCHEMA = 1;

let bdPromessa;

function abrir() {
  if (!bdPromessa) {
    bdPromessa = new Promise((resolve, rejeitar) => {
      const req = indexedDB.open(NOME_BD, VERSAO_SCHEMA);
      req.onupgradeneeded = () => {
        const bd = req.result;
        if (!bd.objectStoreNames.contains('pranchas')) bd.createObjectStore('pranchas', { keyPath: 'id' });
        if (!bd.objectStoreNames.contains('mrs')) bd.createObjectStore('mrs', { keyPath: 'id' });
        if (!bd.objectStoreNames.contains('caminhoes')) {
          bd.createObjectStore('caminhoes', { keyPath: 'id' }).createIndex('mrId', 'mrId');
        }
        if (!bd.objectStoreNames.contains('regioes')) {
          bd.createObjectStore('regioes', { keyPath: 'id' }).createIndex('mrId', 'mrId');
        }
        if (!bd.objectStoreNames.contains('meta')) bd.createObjectStore('meta', { keyPath: 'chave' });
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

async function loja(nome, modo = 'readonly') {
  const bd = await abrir();
  return bd.transaction(nome, modo).objectStore(nome);
}

export async function obter(nomeLoja, id) {
  return pedido((await loja(nomeLoja)).get(id));
}

export async function gravar(nomeLoja, obj) {
  obj.atualizadoEm = new Date().toISOString();
  await pedido((await loja(nomeLoja, 'readwrite')).put(obj));
  return obj;
}

export async function excluir(nomeLoja, id) {
  return pedido((await loja(nomeLoja, 'readwrite')).delete(id));
}

export async function listarDoMr(nomeLoja, mrId) {
  const s = await loja(nomeLoja);
  return pedido(s.index('mrId').getAll(IDBKeyRange.only(mrId)));
}

// Apaga caminhões e regiões de um MR numa única transação.
export async function limparMr(mrId) {
  const bd = await abrir();
  const tx = bd.transaction(['caminhoes', 'regioes'], 'readwrite');
  for (const nome of ['caminhoes', 'regioes']) {
    const s = tx.objectStore(nome);
    const req = s.index('mrId').openKeyCursor(IDBKeyRange.only(mrId));
    req.onsuccess = () => {
      const c = req.result;
      if (c) { s.delete(c.primaryKey); c.continue(); }
    };
  }
  return new Promise((resolve, rejeitar) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => rejeitar(tx.error);
  });
}

export async function obterMeta(chave) {
  const r = await obter('meta', chave);
  return r ? r.valor : undefined;
}

export async function salvarMeta(chave, valor) {
  return pedido((await loja('meta', 'readwrite')).put({ chave, valor }));
}
