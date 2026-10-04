const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Mostra datas completas ou parciais: "2026-10" → "out/2026", "2026-09-28" → "28/09/2026",
 * "2026" → "2026". Data/hora ISO completa mostra só o dia.
 */
export function formatarData(d: string | null | undefined): string {
  if (!d) return "—";
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(d);
  if (!m) return d;
  const [, ano, mes, dia] = m;
  if (!mes) return ano;
  if (!dia) return `${MESES[Number(mes) - 1]}/${ano}`;
  return `${dia}/${mes}/${ano}`;
}

/** Faixa numérica: "6,5–7,5", "2" (quando min = max) ou "—". */
export function formatarFaixa(min: number | null, max: number | null): string {
  const f = (n: number) => String(n).replace(".", ",");
  if (min === null && max === null) return "—";
  if (min === null) return `até ${f(max!)}`;
  if (max === null || min === max) return f(min);
  return `${f(min)}–${f(max)}`;
}

/** Ordena fichas pelo número (pendentes no fim) e depois pelo nome. */
export function compararFichas(
  a: { ficha: number | null; nome_popular: string },
  b: { ficha: number | null; nome_popular: string }
) {
  if (a.ficha !== null && b.ficha !== null) return a.ficha - b.ficha;
  if (a.ficha !== null) return -1;
  if (b.ficha !== null) return 1;
  return a.nome_popular.localeCompare(b.nome_popular, "pt-BR");
}

export const textoLista = (lista: string[]) => (lista.length ? lista.join(", ") : "—");

/** Tags e proibições são guardadas como "forth_flores"; na tela aparecem como "forth flores". */
export const rotuloTag = (t: string) => t.replace(/_/g, " ");
