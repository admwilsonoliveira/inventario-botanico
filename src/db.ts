import Dexie, { type EntityTable } from "dexie";
import type {
  Desejo, Evento, Foto, Insumo, Medicao, Meta, Pendencia, Planta, Projeto, Regra, Rotina, Zona
} from "./types";

/** Exclusão anotada para ser repassada à planilha na próxima sincronização. */
export interface Apagado {
  id?: number;
  tabela: string;
  chave: string;
  em: string;
}

/** Arquivo de foto guardado no aparelho: o original espera o envio ao Drive; a miniatura fica para exibir. */
export interface ArquivoFoto {
  id: string;
  original: Blob | null;
  miniatura: Blob | null;
}

/** Configurações só deste aparelho (não vão para a planilha). */
export interface ConfigLocal {
  chave: string;
  valor: unknown;
}

/** Data da carga inicial: qualquer alteração feita depois é mais nova que ela. */
export const EPOCA = "1970-01-01T00:00:00.000Z";

// Tabelas espelhadas na planilha Google, com o campo que identifica cada linha.
export const TABELAS_SYNC = {
  plantas: "id", fotos: "id", medicoes: "id", eventos: "id", pendencias: "id", projetos: "id",
  insumos: "nome", lista_desejos: "id", zonas: "id", regras: "id", rotinas: "id", meta: "chave"
} as const;
export type TabelaSync = keyof typeof TABELAS_SYNC;

// Valores de "meta" que são só deste aparelho.
export const META_LOCAL = new Set(["migracoes_aplicadas", "carga_importada_em", "carga_versao", "carga_gerada_em"]);

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
  apagados!: EntityTable<Apagado, "id">;
  arquivos_fotos!: EntityTable<ArquivoFoto, "id">;
  config_local!: EntityTable<ConfigLocal, "chave">;

  /** Chamado depois de qualquer alteração local (usado para agendar a sincronização). */
  aoAlterar: (() => void) | null = null;

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
    // Fase 1: carimbo de alteração para a sincronização, exclusões anotadas, fotos e configuração local
    this.version(2).stores({
      plantas: "id, ficha, grupo, status, nome_popular, atualizado_em",
      fotos: "id, planta_id, atualizado_em",
      medicoes: "id, planta_id, data_hora, atualizado_em",
      eventos: "id, planta_id, data, atualizado_em",
      pendencias: "id, planta_id, data_prevista, atualizado_em",
      projetos: "id, atualizado_em",
      insumos: "nome, atualizado_em",
      lista_desejos: "id, atualizado_em",
      zonas: "id, atualizado_em",
      regras: "id, atualizado_em",
      rotinas: "id, atualizado_em",
      meta: "chave, atualizado_em",
      apagados: "++id",
      arquivos_fotos: "id",
      config_local: "chave"
    });

    // Toda gravação recebe a hora da alteração, a menos que já venha com uma (dados vindos da planilha).
    for (const nomeTabela of Object.keys(TABELAS_SYNC)) {
      const t = this.table(nomeTabela);
      t.hook("creating", (_chave, obj) => {
        if (!obj.atualizado_em) obj.atualizado_em = new Date().toISOString();
        this.avisar();
      });
      t.hook("updating", (mods, _chave, antes) => {
        // o Dexie aponta listas como "alteradas" mesmo com o mesmo conteúdo: compara pelo conteúdo
        const m = mods as Record<string, unknown>, a = antes as Record<string, unknown>;
        const campos = Object.keys(m).filter((k) => JSON.stringify(m[k]) !== JSON.stringify(a[k]));
        if (campos.length === 0) return; // nada mudou de fato
        this.avisar();
        // só mantém o carimbo se ele veio junto (dados da planilha); senão, é edição daqui: hora atual
        if (!campos.includes("atualizado_em") || !m.atualizado_em) return { atualizado_em: new Date().toISOString() };
      });
      t.hook("deleting", () => this.avisar());
    }
  }

  private avisar() {
    if (this.aoAlterar) setTimeout(this.aoAlterar, 0);
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

export async function lerConfig<T>(banco: BancoInventario, chave: string, padrao: T): Promise<T> {
  const c = await banco.config_local.get(chave);
  return c === undefined ? padrao : (c.valor as T);
}

export function gravarConfig(banco: BancoInventario, chave: string, valor: unknown) {
  return banco.config_local.put({ chave, valor });
}

/** Anota uma exclusão para a planilha (chamar dentro da mesma transação da exclusão). */
export function anotarExclusao(banco: BancoInventario, tabela: TabelaSync, chave: string) {
  return banco.apagados.add({ tabela, chave, em: new Date().toISOString() });
}
