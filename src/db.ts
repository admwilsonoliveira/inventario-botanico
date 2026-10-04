import Dexie, { type EntityTable } from "dexie";
import type {
  Desejo, Evento, Foto, Insumo, Medicao, Meta, Pendencia, Planta, Projeto, Regra, Rotina, Zona
} from "./types";

// Banco local no próprio aparelho (IndexedDB). Funciona sem internet.
export class BancoInventario extends Dexie {
  plantas!: EntityTable<Planta, "id">;
  fotos!: EntityTable<Foto, "id">;
  medicoes!: EntityTable<Medicao, "id">;
  eventos!: EntityTable<Evento, "id">;
  pendencias!: EntityTable<Pendencia, "id">;
  projetos!: EntityTable<Projeto, "id">;
  insumos!: EntityTable<Insumo, "nome">;
  lista_desejos!: EntityTable<Desejo, "id">;
  zonas!: EntityTable<Zona, "id">;
  regras!: EntityTable<Regra, "id">;
  rotinas!: EntityTable<Rotina, "id">;
  meta!: EntityTable<Meta, "chave">;

  constructor(nome = "inventario-botanico") {
    super(nome);
    // Só os campos listados aqui viram índice (para busca/ordenação); os demais são guardados normalmente.
    this.version(1).stores({
      plantas: "id, ficha, grupo, status, nome_popular",
      fotos: "id, planta_id",
      medicoes: "id, planta_id, data_hora",
      eventos: "id, planta_id, data",
      pendencias: "id, planta_id, data_prevista",
      projetos: "id",
      insumos: "nome",
      lista_desejos: "id",
      zonas: "id",
      regras: "id",
      rotinas: "id",
      meta: "chave"
    });
  }
}

export const db = new BancoInventario();

export async function lerMeta<T>(banco: BancoInventario, chave: string, padrao: T): Promise<T> {
  const m = await banco.meta.get(chave);
  return m === undefined ? padrao : (m.valor as T);
}

export function gravarMeta(banco: BancoInventario, chave: string, valor: unknown) {
  return banco.meta.put({ chave, valor });
}
