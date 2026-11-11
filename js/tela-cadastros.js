// Cadastros de elementos por obra/pavimento (listas reaproveitáveis nos MRs de Pilares).
import * as db from './db.js';
import { montar, ir } from './nav.js';
import { el, uid } from './util.js';
import { icone, alerta, confirmar, toast } from './ui.js';
import { lerListaElementos, juntarElementos, compararNatural } from './mr.js';

const LOGO = 'assets/logo-arcoirismar.png';

function topo(titulo, voltar) {
  return el('header', { class: 'topo' },
    el('a', { class: 'btn-icone', href: voltar, 'aria-label': 'Voltar' }, icone('voltar')),
    el('div', { class: 'topo-titulo' }, el('strong', {}, titulo)),
    el('img', { class: 'logo-topo', src: LOGO, alt: 'Construtora Arco-Íris-Mar' }));
}

export async function telaCadastros() {
  const [cadastros, obras] = await Promise.all([db.listar('cadastros'), db.listar('obras')]);
  const nomeObra = new Map(obras.map((o) => [o.id, o.nome]));
  cadastros.sort((a, b) => (nomeObra.get(a.obraId) || '').localeCompare(nomeObra.get(b.obraId) || '', 'pt-BR') || compararNatural(a.nome, b.nome));

  const lista = cadastros.length
    ? el('div', { class: 'lista-mrs' }, cadastros.map((c) => el('a', { class: 'cartao-mr', href: `#/cadastros/${c.id}` },
      el('h2', {}, c.nome),
      el('p', { class: 'sub' }, `${nomeObra.get(c.obraId) || 'Sem obra'} · ${c.elementos.length} elemento(s)`),
      el('p', { class: 'previa-elementos' }, juntarElementos(c.elementos.slice(0, 24)) + (c.elementos.length > 24 ? '; …' : '')))))
    : el('div', { class: 'vazio' },
      el('p', {}, 'Nenhum cadastro ainda.'),
      el('p', { class: 'nota' }, 'Cadastre a lista de pilares e elementos de cada pavimento para escolher por chips no MR.'));

  montar(el('div', { class: 'tela' },
    topo('Cadastros de elementos', '#/'),
    el('div', { class: 'rolavel form' },
      el('a', { class: 'btn btn-primario btn-grande', href: '#/cadastros/novo' }, icone('mais'), 'Novo cadastro'),
      lista)));
}

export async function telaFormCadastro(id) {
  const cad = id ? await db.obter('cadastros', id) : null;
  if (id && !cad) return ir('#/cadastros');
  const obras = (await db.listar('obras')).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const ultimaObra = await db.obterMeta('ultimaObraId');

  const cObra = el('select', { class: 'campo' },
    el('option', { value: '' }, obras.length ? 'Escolha a obra…' : 'Crie a obra em "Novo MR" primeiro'),
    obras.map((o) => el('option', { value: o.id, selected: o.id === (cad?.obraId || ultimaObra) }, o.nome)));
  const cNome = el('input', { class: 'campo', value: cad?.nome || '', placeholder: 'Ex.: Pilares do térreo (P2 ao P35)' });
  const cLista = el('textarea', {
    class: 'campo', rows: '6', placeholder: 'P11; P12; P8; PA4; PR2',
    autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false',
  });
  cLista.value = juntarElementos(cad?.elementos);
  const previa = el('div', { class: 'chips-previa' });
  const contagem = el('p', { class: 'nota' });
  const atualizar = () => {
    const l = lerListaElementos(cLista.value);
    contagem.textContent = `${l.length} elemento(s). Separe por ponto e vírgula (ou um por linha). Repetidos são ignorados.`;
    previa.replaceChildren(...l.map((e) => el('span', { class: 'chip-el' }, e)));
  };
  cLista.addEventListener('input', atualizar);
  atualizar();

  async function salvar() {
    if (!cObra.value) return alerta('Escolha a obra.');
    if (!cNome.value.trim()) return alerta('Dê um nome ao cadastro (ex.: o pavimento).');
    const elementos = lerListaElementos(cLista.value);
    if (!elementos.length) return alerta('A lista está vazia.');
    const c = cad ? { ...cad } : { id: uid(), criadoEm: new Date().toISOString() };
    Object.assign(c, { obraId: cObra.value, nome: cNome.value.trim(), elementos });
    await db.gravar('cadastros', c);
    toast('Cadastro salvo');
    ir('#/cadastros');
  }

  async function excluir() {
    if (!(await confirmar(`Excluir o cadastro "${cad.nome}"? MRs já criados com ele não mudam.`, { rotuloOk: 'Excluir', perigo: true }))) return;
    await db.excluir('cadastros', cad.id);
    toast('Cadastro excluído');
    ir('#/cadastros');
  }

  montar(el('div', { class: 'tela' },
    topo(cad ? 'Editar cadastro' : 'Novo cadastro', '#/cadastros'),
    el('div', { class: 'rolavel form' },
      el('label', { class: 'rotulo-campo' }, el('span', {}, 'Obra'), cObra),
      el('label', { class: 'rotulo-campo' }, el('span', {}, 'Nome (pavimento / grupo)'), cNome),
      el('label', { class: 'rotulo-campo' }, el('span', {}, 'Elementos'), cLista, contagem),
      previa,
      el('button', { type: 'button', class: 'btn btn-primario btn-grande', onclick: salvar }, 'Salvar'),
      cad ? el('button', { type: 'button', class: 'btn btn-texto-perigo', onclick: excluir }, icone('lixo'), 'Excluir cadastro') : null)));
}
