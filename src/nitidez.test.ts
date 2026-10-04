import { describe, expect, it } from "vitest";
import { paraCinza, varianciaLaplaciano } from "./nitidez";

/** Imagem de teste: tabuleiro de xadrez com casas de `casa` px. */
function tabuleiro(w: number, h: number, casa: number) {
  const px = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = (Math.floor(x / casa) + Math.floor(y / casa)) % 2 ? 230 : 25;
  return px;
}

/** Desfoque simples (média 5×5), simulando foto tremida. */
function desfocar(px: Float32Array, w: number, h: number, raio = 2) {
  const out = new Float32Array(px.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -raio; dy <= raio; dy++) {
        for (let dx = -raio; dx <= raio; dx++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx));
          s += px[yy * w + xx];
          n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

describe("variância do Laplaciano", () => {
  it("imagem lisa dá zero", () => {
    expect(varianciaLaplaciano(new Float32Array(100).fill(128), 10, 10)).toBe(0);
  });

  it("foto nítida mede bem mais que a mesma foto desfocada", () => {
    const w = 120, h = 90;
    const nitida = tabuleiro(w, h, 6);
    const borrada = desfocar(desfocar(nitida, w, h), w, h);
    const vn = varianciaLaplaciano(nitida, w, h);
    const vb = varianciaLaplaciano(borrada, w, h);
    // o valor absoluto depende da foto (por isso o limiar é calibrável); o que importa é a queda
    expect(vn).toBeGreaterThan(vb * 10);
  });

  it("converte RGBA para cinza", () => {
    expect(Array.from(paraCinza([255, 255, 255, 255, 0, 0, 0, 255])).map(Math.round)).toEqual([255, 0]);
  });
});
