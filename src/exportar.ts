// Exportação para Excel (.xlsx) com todas as tabelas, uma aba cada.
import { type BancoInventario, TABELAS_SYNC } from "./db";

const NOMES_ABAS: Record<string, string> = {
  plantas: "Plantas", eventos: "Eventos", medicoes: "Medições", pendencias: "Pendências", fotos: "Fotos",
  projetos: "Projetos", insumos: "Insumos", lista_desejos: "Lista de desejos", zonas: "Zonas",
  regras: "Regras", rotinas: "Rotinas", meta: "Configurações"
};

/** Valor de célula: listas de texto viram "a, b"; objetos viram JSON; vazio fica vazio. */
export function paraCelula(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v) && v.every((x) => typeof x !== "object")) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return v as string | number | boolean;
}

/** Linhas de cada aba (função separada para poder testar sem gerar o arquivo). */
export async function montarTabelas(banco: BancoInventario): Promise<Record<string, Record<string, unknown>[]>> {
  const saida: Record<string, Record<string, unknown>[]> = {};
  for (const tabela of Object.keys(TABELAS_SYNC)) {
    const linhas = (await banco.table(tabela).toArray()) as Record<string, unknown>[];
    saida[NOMES_ABAS[tabela] ?? tabela] = linhas.map((l) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l)) o[k] = paraCelula(v);
      return o;
    });
  }
  return saida;
}

export async function exportarXlsx(banco: BancoInventario) {
  const XLSX = await import("xlsx"); // carregado só quando usado
  const tabelas = await montarTabelas(banco);
  const livro = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(tabelas)) {
    const aba = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{}]);
    XLSX.utils.book_append_sheet(livro, aba, nome.slice(0, 31));
  }
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  XLSX.writeFile(livro, `inventario-botanico-${hoje}.xlsx`, { compression: true });
}
