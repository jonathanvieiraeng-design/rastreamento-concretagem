// Backup e restauração de todos os dados do app em um arquivo .json (pranchas incluídas, em base64).
// Restaurar JUNTA com o que está no aparelho: registro novo entra; registro existente fica com a
// versão mais recente (campo "atualizadoEm"); nada é apagado.
import * as db from './db.js';
import { el, bufParaBase64 } from './util.js';
import { alerta, confirmar, carregando, oferecerArquivo, toast } from './ui.js';

const APP = 'rastreamento-concretagem';
const FORMATO = 1;
const LOJAS = ['obras', 'cadastros', 'mrs', 'caminhoes', 'regioes', 'pranchas', 'meta'];
const ROTULOS = {
  obras: ['obra', 'obras'], cadastros: ['cadastro', 'cadastros'], mrs: ['MR', 'MRs'], caminhoes: ['caminhão', 'caminhões'],
  regioes: ['região', 'regiões'], pranchas: ['prancha', 'pranchas'],
};
export const DIAS_LEMBRETE = 30;

const dois = (n) => String(n).padStart(2, '0');

function base64ParaBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

export async function gerarBackup() {
  const dados = {};
  for (const loja of LOJAS) {
    let lista = await db.listar(loja);
    if (loja === 'pranchas') lista = lista.map(({ pdf, ...resto }) => ({ ...resto, pdfBase64: bufParaBase64(pdf) }));
    if (loja === 'meta') lista = lista.filter((m) => m.chave !== 'ultimoBackup');
    dados[loja] = lista;
  }
  const agora = new Date();
  const conteudo = { app: APP, formato: FORMATO, schema: db.VERSAO_SCHEMA, geradoEm: agora.toISOString(), dados };
  const nome = `BACKUP-MR-${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}-${dois(agora.getHours())}h${dois(agora.getMinutes())}.json`;
  return new File([JSON.stringify(conteudo)], nome, { type: 'application/json' });
}

export async function fazerBackup() {
  const fim = carregando('Preparando o backup…');
  let arquivo;
  try {
    arquivo = await gerarBackup();
  } catch (e) {
    console.error(e);
    alerta(`Não foi possível gerar o backup: ${e.message}`, 'Erro');
    return false;
  } finally {
    fim();
  }
  const r = await oferecerArquivo(arquivo, {
    titulo: 'Backup pronto',
    texto: 'Toque em Compartilhar → "Salvar em Arquivos" → pasta do OneDrive da construtora. Guarde o arquivo: ele restaura todos os MRs, caminhões, desenhos e pranchas.',
  });
  if (r === 'compartilhado' || r === 'baixado') {
    await db.salvarMeta('ultimoBackup', new Date().toISOString());
    toast('Backup feito.');
    return true;
  }
  return false;
}

export async function ultimoBackup() {
  const iso = await db.obterMeta('ultimoBackup');
  if (!iso) return { iso: null, dias: null };
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return { iso, dias };
}

export function fmtDataHoraIso(iso) {
  const d = new Date(iso);
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

// Chamada depois de concluir uma concretagem.
export async function oferecerBackupAoConcluir() {
  if (await confirmar('Concretagem concluída. Fazer o backup agora e salvar no OneDrive?', { titulo: 'Backup', rotuloOk: 'Fazer backup' })) {
    await fazerBackup();
  }
}

// ---------- restauração ----------

function escolherArquivo() {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

function validar(conteudo) {
  if (!conteudo || conteudo.app !== APP || !conteudo.dados) throw new Error('este arquivo não é um backup deste app.');
  if (conteudo.formato > FORMATO) throw new Error('backup feito por uma versão mais nova do app. Atualize o app e tente de novo.');
  for (const loja of LOJAS) {
    const lista = conteudo.dados[loja] || [];
    if (!Array.isArray(lista)) throw new Error(`parte "${loja}" do arquivo está corrompida.`);
    const chave = loja === 'meta' ? 'chave' : 'id';
    if (lista.some((r) => !r || typeof r[chave] !== 'string')) throw new Error(`registro sem identificação em "${loja}".`);
  }
}

export async function restaurarBackup() {
  const arq = await escolherArquivo();
  if (!arq) return false;
  let conteudo;
  try {
    conteudo = JSON.parse(await arq.text());
    validar(conteudo);
  } catch (e) {
    await alerta(`Não foi possível ler o backup: ${e.message}`, 'Restaurar backup');
    return false;
  }
  const d = conteudo.dados;
  const resumo = LOJAS.filter((l) => l !== 'meta' && d[l]?.length).map((l) => `${d[l].length} ${ROTULOS[l][d[l].length === 1 ? 0 : 1]}`).join(', ');
  if (!(await confirmar(
    `Backup de ${fmtDataHoraIso(conteudo.geradoEm)} com ${resumo || 'nenhum dado'}. `
    + 'Os dados serão JUNTADOS aos deste iPad: o que for novo entra; o que existir nos dois fica com a versão mais recente. Nada é apagado. Continuar?',
    { titulo: 'Restaurar backup', rotuloOk: 'Restaurar' },
  ))) return false;

  const fim = carregando('Restaurando…');
  const cont = { novos: 0, atualizados: 0, mantidos: 0 };
  try {
    for (const loja of LOJAS) {
      const vindos = d[loja] || [];
      if (!vindos.length) continue;
      const chave = loja === 'meta' ? 'chave' : 'id';
      const locais = new Map((await db.listar(loja)).map((r) => [r[chave], r]));
      const gravar = [];
      for (const r of vindos) {
        const local = locais.get(r[chave]);
        if (loja === 'meta') {
          // preferências: as deste aparelho valem; do backup só entra o que não existe aqui
          if (!local && r.chave !== 'ultimoBackup') gravar.push(r);
          continue;
        }
        let novo = r;
        if (loja === 'pranchas') {
          const { pdfBase64, ...resto } = r;
          novo = { ...resto, pdf: base64ParaBuf(pdfBase64 || '') };
        }
        if (!local) { cont.novos++; gravar.push(novo); }
        else if ((r.atualizadoEm || '') > (local.atualizadoEm || '')) { cont.atualizados++; gravar.push(novo); }
        else cont.mantidos++;
      }
      await db.gravarComoVeio(loja, gravar);
    }
  } catch (e) {
    console.error(e);
    fim();
    await alerta(`Erro ao restaurar: ${e.message}. O que já tinha sido gravado continua no iPad.`, 'Erro');
    return false;
  }
  fim();
  await alerta(`Restauração concluída: ${cont.novos} registro(s) novo(s), ${cont.atualizados} atualizado(s), ${cont.mantidos} mantido(s) como estavam (já eram iguais ou mais recentes neste iPad).`, 'Backup restaurado');
  return true;
}

