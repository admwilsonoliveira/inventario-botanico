// Teste de nitidez (CLAUDE.md, seção 7): variância do Laplaciano.
// Foto nítida tem bordas marcadas → o Laplaciano varia muito; foto tremida/desfocada → varia pouco.

/** Limiar padrão; pode ser ajustado em Configurações (o valor medido aparece em cada foto, para calibrar). */
export const LIMIAR_NITIDEZ_PADRAO = 60;

/** Lado maior usado na medição (a medida depende da escala, então é sempre feita no mesmo tamanho). */
export const LADO_MEDICAO = 640;

/**
 * Variância do Laplaciano (núcleo 0 1 0 / 1 −4 1 / 0 1 0) numa imagem em tons de cinza.
 * @param cinza valores 0–255, linha por linha
 */
export function varianciaLaplaciano(cinza: ArrayLike<number>, largura: number, altura: number): number {
  if (largura < 3 || altura < 3) return 0;
  let soma = 0, soma2 = 0, n = 0;
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const i = y * largura + x;
      const l = cinza[i - largura] + cinza[i + largura] + cinza[i - 1] + cinza[i + 1] - 4 * cinza[i];
      soma += l;
      soma2 += l * l;
      n++;
    }
  }
  const media = soma / n;
  return soma2 / n - media * media;
}

/** RGBA → cinza (luminância). */
export function paraCinza(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return out;
}

/** Mede a nitidez de uma foto (no navegador). */
export async function medirNitidez(foto: Blob): Promise<number> {
  const img = await createImageBitmap(foto);
  const escala = Math.min(1, LADO_MEDICAO / Math.max(img.width, img.height));
  const w = Math.max(3, Math.round(img.width * escala)), h = Math.max(3, Math.round(img.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  img.close();
  return varianciaLaplaciano(paraCinza(ctx.getImageData(0, 0, w, h).data), w, h);
}
