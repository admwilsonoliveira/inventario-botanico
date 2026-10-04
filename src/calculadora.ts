// Calculadora de doses (CLAUDE.md, seção 9).

/** Abaixo desta massa a balança não é confiável: usa-se o método de diluição. */
export const LIMITE_BALANCA_G = 0.3;
/** Seringa de 3 ml graduada em 0,1 ml. */
export const SERINGA_ML = 3;

export interface ResultadoDose {
  /** Massa total de produto (g) = dose (g/L) × volume (L). */
  massa_g: number;
  metodo: "pesar" | "diluicao";
  /** Só no método de diluição: volume total de solução-mãe (ml), arredondado a 0,1 ml. */
  seringa_ml?: number;
  /** Quantas puxadas de seringa (cada uma até 3 ml). */
  puxadas?: number;
  /** Volume de cada puxada (ml), arredondado a 0,1 ml. */
  ml_por_puxada?: number;
}

const arred = (n: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(n * f + Number.EPSILON) / f;
};

/**
 * @param dose_g_l dose do produto em g/L
 * @param volume_l volume de rega em litros
 * @param mae_g_ml concentração da solução-mãe em g/ml (só usada no método de diluição)
 */
export function calcularDose(dose_g_l: number, volume_l: number, mae_g_ml = 0.1): ResultadoDose {
  if (!(dose_g_l > 0) || !(volume_l > 0)) throw new Error("Dose e volume precisam ser maiores que zero.");
  const massa = dose_g_l * volume_l;
  if (massa >= LIMITE_BALANCA_G) return { massa_g: arred(massa, 2), metodo: "pesar" };

  if (!(mae_g_ml > 0)) throw new Error("A concentração da solução-mãe precisa ser maior que zero.");
  // arredonda primeiro a 9 casas para o erro de ponto flutuante (1,0499999…) não virar 1,0 em vez de 1,1
  const ml = arred(arred(massa / mae_g_ml, 9), 1);
  const puxadas = Math.max(1, Math.ceil(ml / SERINGA_ML - 1e-9));
  return {
    massa_g: arred(massa, 3),
    metodo: "diluicao",
    seringa_ml: ml,
    puxadas,
    ml_por_puxada: arred(ml / puxadas, 1)
  };
}

const br = (n: number) => String(n).replace(".", ",");

/** Texto curto para mostrar na tela. */
export function descreverDose(r: ResultadoDose): string {
  if (r.metodo === "pesar") return `Pese ${br(r.massa_g)} g.`;
  const base = `${br(r.massa_g)} g é pouco para a balança: use a solução-mãe.`;
  if (r.puxadas === 1) return `${base} Puxe ${br(r.seringa_ml!)} ml na seringa.`;
  return `${base} Total ${br(r.seringa_ml!)} ml: ${r.puxadas} puxadas de ${br(r.ml_por_puxada!)} ml.`;
}
