// Cabeçalho do MR: obra, tipo, local, data, especificação, elementos (Pilares) e assinaturas.
import * as db from './db.js';
import { montar, ir } from './nav.js';
import { el, uid } from './util.js';
import { icone, alerta, confirmar, pedirTexto, toast } from './ui.js';
import {
  ESPECIFICACAO_PADRAO, hojeISO, lerListaElementos, juntarElementos, mapaElementos, compararNatural,
} from './mr.js';

const LOGO = 'assets/logo-arcoirismar.png';

export async function telaFormMr(id) {
  const mr = id ? await db.obter('mrs', id) : null;
  if (id && !mr) return ir('#/');
  const [obras, cadastros, ultimaEsp, ultimaObra, ultimasAss] = await Promise.all([
    db.listar('obras'), db.listar('cadastros'),
    db.obterMeta('ultimaEspecificacao'), db.obterMeta('ultimaObraId'), db.obterMeta('ultimasAssinaturas'),
  ]);
  const caminhoes = mr ? await db.listarDoMr('caminhoes', mr.id) : [];
  obras.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  cadastros.sort((a, b) => compararNatural(a.nome, b.nome));

  let tipo = mr?.tipo || 'pilares';

  // ---- campos ----
  const cObra = el('select', { class: 'campo' });
  function preencherObras(selecionada) {
    cObra.replaceChildren(
      el('option', { value: '' }, 'Escolha a obra…'),
      ...obras.map((o) => el('option', { value: o.id, selected: o.id === selecionada }, o.nome)));
  }
  preencherObras(mr?.obraId || ultimaObra || '');
  const btNovaObra = el('button', { type: 'button', class: 'btn', onclick: novaObra }, icone('mais'), 'Nova obra');

  const segTipo = el('div', { class: 'segmentado segmentado-grande' });
  function desenharTipo() {
    segTipo.replaceChildren(
      el('button', { type: 'button', class: `seg-btn${tipo === 'pilares' ? ' ativo' : ''}`, disabled: !!mr, onclick: () => { tipo = 'pilares'; desenharTipo(); } }, 'Pilares'),
      el('button', { type: 'button', class: `seg-btn${tipo === 'laje' ? ' ativo' : ''}`, disabled: true, title: 'Entra na Etapa 4' }, 'Laje (Etapa 4)'));
    blocoElementos.hidden = tipo !== 'pilares';
  }

  const cLocal = el('input', { class: 'campo', value: mr?.local || '', placeholder: 'Ex.: Pilares P2 ao P35 — térreo' });
  const cData = el('input', { class: 'campo', type: 'date', value: mr?.data || hojeISO() });
  const cEsp = el('input', { class: 'campo', value: mr?.especificacao ?? (ultimaEsp || ESPECIFICACAO_PADRAO) });

  // elementos (Pilares)
  const cCadastro = el('select', { class: 'campo' });
  function preencherCadastros() {
    const obraId = cObra.value;
    const doObra = cadastros.filter((c) => !obraId || c.obraId === obraId);
    cCadastro.replaceChildren(
      el('option', { value: '' }, doObra.length ? 'Preencher a partir de um cadastro…' : 'Nenhum cadastro desta obra'),
      ...doObra.map((c) => el('option', { value: c.id }, `${c.nome} (${c.elementos.length})`)));
  }
  cObra.addEventListener('change', preencherCadastros);
  preencherCadastros();
  const cElementos = el('textarea', {
    class: 'campo', rows: '4', placeholder: 'Cole a lista separada por ponto e vírgula. Ex.: P11; P12; P8; PA4; PR2',
    autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false',
  });
  cElementos.value = juntarElementos(mr?.elementos);
  const contagem = el('p', { class: 'nota' });
  const atualizarContagem = () => {
    const n = lerListaElementos(cElementos.value).length;
    contagem.textContent = n ? `${n} elemento(s) na lista.` : 'Lista vazia: dá para adicionar elementos livres na hora.';
  };
  cElementos.addEventListener('input', atualizarContagem);
  atualizarContagem();
  cCadastro.addEventListener('change', async () => {
    const c = cadastros.find((x) => x.id === cCadastro.value);
    cCadastro.value = '';
    if (!c) return;
    if (cElementos.value.trim() && !(await confirmar(`Substituir a lista atual pelos ${c.elementos.length} elementos de "${c.nome}"?`, { rotuloOk: 'Substituir' }))) return;
    cElementos.value = juntarElementos(c.elementos);
    cadastroEscolhido = c.id;
    atualizarContagem();
  });
  let cadastroEscolhido = mr?.cadastroId || null;

  const blocoElementos = el('fieldset', { class: 'grupo' },
    el('legend', {}, 'Elementos a concretar'),
    cCadastro,
    cElementos,
    contagem,
    el('p', { class: 'nota' }, 'A lista fica guardada neste MR. Alterar o cadastro depois não muda MRs já feitos.'));

  const ass = mr || ultimasAss || {};
  const cInsp = el('input', { class: 'campo', value: ass.inspecionadoPor || '' });
  const cVisto = el('input', { class: 'campo', value: ass.visto || '' });
  const cAprov = el('input', { class: 'campo', value: ass.aprovacaoFinal || '' });

  desenharTipo();

  async function novaObra() {
    const nome = await pedirTexto({
      titulo: 'Nova obra',
      rotulo: 'Nome da obra',
      placeholder: 'Ex.: Residencial Monte Fuji',
      validar: (v) => (!v.trim() ? 'Informe o nome.' : obras.some((o) => o.nome.toLowerCase() === v.trim().toLowerCase()) ? 'Já existe uma obra com esse nome.' : null),
    });
    if (nome == null) return;
    const o = { id: uid(), nome: nome.trim(), criadoEm: new Date().toISOString() };
    await db.gravar('obras', o);
    obras.push(o);
    obras.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    preencherObras(o.id);
    preencherCadastros();
  }

  async function salvar() {
    if (!cObra.value) return alerta('Escolha a obra (ou crie uma em "Nova obra").');
    if (!cLocal.value.trim()) return alerta('Informe o local da concretagem.');
    if (!cData.value) return alerta('Informe a data.');
    let elementos = tipo === 'pilares' ? lerListaElementos(cElementos.value) : [];
    if (mr && tipo === 'pilares') {
      // elementos já vinculados a caminhões não podem sumir da lista
      const usados = [...mapaElementos(caminhoes).keys()].filter((e) => !elementos.includes(e));
      if (usados.length) {
        await alerta(`Estes elementos estão vinculados a caminhões e foram mantidos na lista: ${usados.join('; ')}.`);
        elementos = [...elementos, ...usados];
      }
    }
    const m = mr ? { ...mr } : { id: uid(), tipo, status: 'campo', criadoEm: new Date().toISOString() };
    Object.assign(m, {
      obraId: cObra.value,
      local: cLocal.value.trim(),
      data: cData.value,
      especificacao: cEsp.value.trim(),
      elementos,
      cadastroId: cadastroEscolhido,
      inspecionadoPor: cInsp.value.trim(),
      visto: cVisto.value.trim(),
      aprovacaoFinal: cAprov.value.trim(),
    });
    await db.gravar('mrs', m);
    await Promise.all([
      db.salvarMeta('ultimaEspecificacao', m.especificacao),
      db.salvarMeta('ultimaObraId', m.obraId),
      db.salvarMeta('ultimasAssinaturas', { inspecionadoPor: m.inspecionadoPor, visto: m.visto, aprovacaoFinal: m.aprovacaoFinal }),
    ]);
    toast(mr ? 'MR atualizado' : 'MR criado');
    ir(`#/mr/${m.id}`);
  }

  async function excluir() {
    const v = await pedirTexto({
      titulo: 'Excluir MR',
      rotulo: `Isso apaga o MR "${mr.local}" e os ${caminhoes.length} caminhão(ões) registrados. Não dá para desfazer. Digite EXCLUIR para confirmar.`,
      rotuloOk: 'Excluir',
      perigo: true,
      maiusculas: true,
      validar: (x) => (x.trim().toUpperCase() === 'EXCLUIR' ? null : 'Digite EXCLUIR.'),
    });
    if (v == null) return;
    await db.limparMr(mr.id, { excluirMr: true });
    toast('MR excluído');
    ir('#/');
  }

  const campo = (rotulo, c, extra) => el('label', { class: 'rotulo-campo' }, el('span', {}, rotulo), c, extra);
  const voltar = mr ? `#/mr/${mr.id}` : '#/';
  const raiz = el('div', { class: 'tela' },
    el('header', { class: 'topo' },
      el('a', { class: 'btn-icone', href: voltar, 'aria-label': 'Voltar' }, icone('voltar')),
      el('div', { class: 'topo-titulo' }, el('strong', {}, mr ? 'Editar MR' : 'Novo MR')),
      el('img', { class: 'logo-topo', src: LOGO, alt: 'Construtora Arco-Íris-Mar' })),
    el('div', { class: 'rolavel form' },
      el('div', { class: 'rotulo-campo' }, el('span', {}, 'Obra'), el('div', { class: 'linha-campo' }, cObra, btNovaObra)),
      el('div', { class: 'rotulo-campo' }, el('span', {}, 'Tipo de MR'), segTipo),
      campo('Local da concretagem', cLocal),
      el('div', { class: 'grade-2' }, campo('Data', cData), campo('Especificação do concreto recebido', cEsp)),
      blocoElementos,
      el('fieldset', { class: 'grupo' },
        el('legend', {}, 'Assinaturas'),
        el('div', { class: 'grade-3' }, campo('Inspecionado por', cInsp), campo('Visto', cVisto), campo('Aprovação Final', cAprov)),
        el('p', { class: 'nota' }, 'Pode deixar em branco e preencher depois.')),
      el('button', { type: 'button', class: 'btn btn-primario btn-grande', onclick: salvar }, mr ? 'Salvar' : 'Criar MR'),
      mr ? el('button', { type: 'button', class: 'btn btn-texto-perigo', onclick: excluir }, icone('lixo'), 'Excluir MR') : null));
  montar(raiz);
}
