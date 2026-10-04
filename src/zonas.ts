// Compatibilidade de luz entre o que a planta pede e o sol de cada zona da casa.
import type { Zona } from "./types";

export type NecessidadeLuz = "sol_pleno" | "meia_sombra" | "luz_filtrada";

export const ROTULO_LUZ: Record<NecessidadeLuz, string> = {
  sol_pleno: "sol pleno (5 h ou mais de sol direto)",
  meia_sombra: "meia-sombra (2 a 5 h de sol direto)",
  luz_filtrada: "luz filtrada/indireta (até 2 h de sol direto)"
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lê a necessidade de luz de um texto livre ("Luz filtrada, umidade alta", "Sol pleno", nota 1–9 do medidor). */
export function necessidadeDeLuz(texto: string | null | undefined, nota1a9?: number | null): NecessidadeLuz | null {
  const t = norm(texto ?? "");
  if (/sol pleno|sol intenso|sol direto o dia|pleno sol/.test(t)) return "sol_pleno";
  if (/meia[- ]sombra|sol da manha|sol de fim de tarde|sol suave/.test(t)) return "meia_sombra";
  if (/filtrad|indiret|difus|sombra|sem sol/.test(t)) return "luz_filtrada";
  if (typeof nota1a9 === "number") return nota1a9 >= 7 ? "sol_pleno" : nota1a9 >= 4 ? "meia_sombra" : "luz_filtrada";
  return null;
}

const horaDe = (h: string, m?: string) => Number(h) + (m ? Number(m) / 60 : 0);
const FIM_DO_SOL = 18; // pôr do sol aproximado em Patrocínio

/** Horas de sol direto de uma zona a partir do texto ("16h30–18h", "a partir das 12h30", "sol pleno", "luz difusa"). */
export function horasDeSol(solDireto: string | null | undefined): number | null {
  const t = norm(solDireto ?? "");
  if (!t) return null;
  if (/sol pleno/.test(t)) return 8;
  if (/difusa|sem sol|indireta/.test(t)) return 0;
  const faixa = /(\d{1,2})h(\d{2})?\s*[–-]\s*(\d{1,2})h(\d{2})?/.exec(t);
  if (faixa) return Math.max(0, horaDe(faixa[3], faixa[4]) - horaDe(faixa[1], faixa[2]));
  const desde = /a partir d[ae]s?\s*(\d{1,2})h(\d{2})?/.exec(t);
  if (desde) return Math.max(0, FIM_DO_SOL - horaDe(desde[1], desde[2]));
  return null;
}

export function luzDaZona(z: Pick<Zona, "sol_direto">): NecessidadeLuz | null {
  const h = horasDeSol(z.sol_direto);
  if (h === null) return null;
  return h >= 5 ? "sol_pleno" : h >= 2 ? "meia_sombra" : "luz_filtrada";
}

/** Zonas onde a planta caberia pela luz. */
export function zonasCompativeis(zonas: Zona[], necessidade: NecessidadeLuz | null): Zona[] {
  if (!necessidade) return [];
  return zonas.filter((z) => luzDaZona(z) === necessidade);
}
