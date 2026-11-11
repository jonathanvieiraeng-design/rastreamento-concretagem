// Geometria das regiões. Pontos sempre em coordenadas da prancha: [x, y] em pt do PDF
// (viewport do pdf.js em escala 1, origem no canto superior esquerdo da página).

export function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return Math.abs(a / 2);
}

// Ponto dentro do contorno (contorno fechado implicitamente, regra par-ímpar).
export function contem(pts, x, y) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function distSegmento2(px, py, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx || dy) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

// Distância (com sinal) do ponto à borda: positiva dentro, negativa fora.
function distBorda(pts, x, y) {
  let min = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    min = Math.min(min, distSegmento2(x, y, pts[i], pts[j]));
  }
  return (contem(pts, x, y) ? 1 : -1) * Math.sqrt(min);
}

// Onde escrever o número: o ponto interno mais distante da borda
// (o centro geométrico pode cair fora em formas em "L" ou "U").
// Busca em grade com dois refinamentos — precisão de sobra para um rótulo.
export function pontoRotulo(pts) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  let melhor = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, d: -Infinity };
  let cx = melhor.x; let cy = melhor.y;
  let meiaL = (x1 - x0) / 2; let meiaA = (y1 - y0) / 2;
  const N = 20;
  for (let passo = 0; passo < 3; passo++) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = cx - meiaL + (2 * meiaL * i) / N;
        const y = cy - meiaA + (2 * meiaA * j) / N;
        const d = distBorda(pts, x, y);
        if (d > melhor.d) melhor = { x, y, d };
      }
    }
    cx = melhor.x; cy = melhor.y;
    meiaL /= N / 4; meiaA /= N / 4;
  }
  return [melhor.x, melhor.y];
}

// Ramer–Douglas–Peucker: tira pontos redundantes do traço sem mudar a forma
// além da tolerância (na mesma unidade dos pontos).
export function simplificar(pts, tol) {
  if (pts.length < 4) return pts.slice();
  const tol2 = tol * tol;
  const manter = new Uint8Array(pts.length);
  manter[0] = 1;
  manter[pts.length - 1] = 1;
  const pilha = [[0, pts.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    let maxD = 0; let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distSegmento2(pts[i][0], pts[i][1], pts[a], pts[b]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > tol2) {
      manter[idx] = 1;
      pilha.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => manter[i]);
}
