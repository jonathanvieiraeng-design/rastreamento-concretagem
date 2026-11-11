// Paleta dos caminhões, atribuída pela ordem do Item (1 → primeira cor).
// Tons médios: com o preenchimento a ~33% de opacidade ficam claros sobre a prancha,
// e o contorno opaco continua visível no papel branco.
// A ordem alterna quente/frio para que caminhões consecutivos fiquem bem diferentes.
// Acima de 12 caminhões a paleta se repete; o número do Item diferencia.
export const PALETA = [
  '#E53935', // vermelho
  '#1E88E5', // azul
  '#43A047', // verde
  '#FB8C00', // laranja
  '#8E24AA', // roxo
  '#00ACC1', // ciano
  '#D81B60', // rosa
  '#7CB342', // verde-claro
  '#3949AB', // índigo
  '#8D6E63', // marrom
  '#00897B', // verde-azulado
  '#FFB300', // âmbar
];

export function corDoItem(item) {
  return PALETA[(Math.max(1, item) - 1) % PALETA.length];
}

export function rgba(hex, alfa) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
