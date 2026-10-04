// Carga inicial (CLAUDE.md, seção 6) e numeração das fichas (seção 5).
import { anotarExclusao, type BancoInventario, EPOCA, gravarMeta, lerMeta } from "./db";
import { MIGRACOES } from "./migracoes";
import type {
  Desejo, Evento, Grupo, Insumo, Pendencia, Planta, Projeto, Regra, Rotina, Zona
} from "./types";

export interface SeedJson {
  versao: number;
  gerado_em: string;
  local: unknown;
  escalas: unknown;
  proxima_ficha: number;
  observacao_numeracao?: string;
  grupos: Grupo[];
  plantas: Omit<Planta, "qr_code" | "excluida_em">[];
  lista_desejos: Desejo[];
  eventos: Omit<Evento, "id">[];
  pendencias: Omit<Pendencia, "id">[];
  projetos: Projeto[];
  zonas: Zona[];
  insumos: Insumo[];
  ferramentas: string[];
  regras: Omit<Regra, "ativa">[];
  rotinas: Omit<Rotina, "id">[];
}

export interface Carga {
  plantas: Planta[];
  lista_desejos: Desejo[];
  eventos: Evento[];
  pendencias: Pendencia[];
  projetos: Projeto[];
  zonas: Zona[];
  insumos: Insumo[];
  regras: Regra[];
  rotinas: Rotina[];
  meta: Record<string, unknown>;
}

const num = (n: number, casas: number) => String(n).padStart(casas, "0");

export const linkPlanta = (id: string) => `#/planta/${id}`;

/** Converte o JSON da carga inicial nas linhas das tabelas. Função pura (não toca no banco). */
export function prepararCarga(seed: SeedJson): Carga {
  return {
    plantas: seed.plantas.map((p) => ({
      ...p,
      tags: p.tags ?? [],
      proibicoes: p.proibicoes ?? [],
      alertas: p.alertas ?? [],
      historico: p.historico ?? "",
      qr_code: linkPlanta(p.id),
      excluida_em: null
    })),
    lista_desejos: seed.lista_desejos,
    // eventos, pendências e rotinas não têm id no JSON: numeramos na ordem em que aparecem
    eventos: seed.eventos.map((e, i) => ({ id: `E${num(i + 1, 4)}`, ...e })),
    pendencias: seed.pendencias.map((p, i) => ({ id: `PD${num(i + 1, 3)}`, ...p })),
    projetos: seed.projetos,
    zonas: seed.zonas,
    insumos: seed.insumos,
    regras: seed.regras.map((r) => ({ ...r, ativa: true })),
    rotinas: seed.rotinas.map((r, i) => ({ id: `RT${num(i + 1, 2)}`, ...r })),
    meta: {
      proxima_ficha: seed.proxima_ficha,
      fichas_excluidas: [] as number[],
      grupos: seed.grupos,
      // a carga já vem com as correções das migrações (ver migracoes.ts)
      migracoes_aplicadas: MIGRACOES.map((m) => m.id),
      local: seed.local,
      escalas: seed.escalas,
      ferramentas: seed.ferramentas,
      observacao_numeracao: seed.observacao_numeracao ?? null,
      carga_versao: seed.versao,
      carga_gerada_em: seed.gerado_em
    }
  };
}

const TABELAS = [
  "plantas", "fotos", "medicoes", "eventos", "pendencias", "projetos",
  "insumos", "lista_desejos", "zonas", "regras", "rotinas", "meta", "apagados", "arquivos_fotos"
] as const;

/** Linhas da carga com o carimbo "data zero": qualquer edição posterior é mais nova que elas. */
const carimbar = <T extends object>(linhas: T[]): T[] => linhas.map((l) => ({ ...l, atualizado_em: EPOCA }));

async function gravarCarga(banco: BancoInventario, carga: Carga) {
  await banco.plantas.bulkAdd(carimbar(carga.plantas));
  await banco.lista_desejos.bulkAdd(carimbar(carga.lista_desejos));
  await banco.eventos.bulkAdd(carimbar(carga.eventos));
  await banco.pendencias.bulkAdd(carimbar(carga.pendencias));
  await banco.projetos.bulkAdd(carimbar(carga.projetos));
  await banco.zonas.bulkAdd(carimbar(carga.zonas));
  await banco.insumos.bulkAdd(carimbar(carga.insumos));
  await banco.regras.bulkAdd(carimbar(carga.regras));
  await banco.rotinas.bulkAdd(carimbar(carga.rotinas));
  await banco.meta.bulkAdd(carimbar(Object.entries(carga.meta).map(([chave, valor]) => ({ chave, valor }))));
  await gravarMeta(banco, "carga_importada_em", new Date().toISOString());
}

/** Importa a carga só se o banco estiver vazio. Devolve true se importou. */
export async function carregarSeVazio(banco: BancoInventario, seed: SeedJson): Promise<boolean> {
  return banco.transaction("rw", TABELAS.map((t) => banco.table(t)), async () => {
    const jaTemDados = (await banco.plantas.count()) > 0 || (await banco.meta.count()) > 0;
    if (jaTemDados) return false;
    await gravarCarga(banco, prepararCarga(seed));
    return true;
  });
}

/** Apaga tudo e importa a carga de novo (botão em Configurações, com dupla confirmação). */
export async function restaurarCarga(banco: BancoInventario, seed: SeedJson) {
  await banco.transaction("rw", TABELAS.map((t) => banco.table(t)), async () => {
    for (const t of TABELAS) await banco.table(t).clear();
    await gravarCarga(banco, prepararCarga(seed));
  });
}

// ---------- Numeração das fichas ----------

/** Confere se um número de ficha pode ser usado nesta planta. Devolve a mensagem de erro ou null. */
export async function validarFicha(banco: BancoInventario, plantaId: string, numero: number): Promise<string | null> {
  if (!Number.isInteger(numero) || numero < 1) return "Use um número inteiro a partir de 1.";
  const excluidas = await lerMeta<number[]>(banco, "fichas_excluidas", []);
  if (excluidas.includes(numero)) return `A ficha nº ${numero} pertenceu a uma planta excluída e não pode ser reutilizada.`;
  const outra = await banco.plantas.where("ficha").equals(numero).first();
  if (outra && outra.id !== plantaId) return `A ficha nº ${numero} já é da planta "${outra.nome_popular}".`;
  return null;
}

/** Grava o número da ficha. Se o número passar da próxima ficha, a próxima avança para não colidir. */
export async function definirFicha(banco: BancoInventario, plantaId: string, numero: number | null) {
  return banco.transaction("rw", banco.plantas, banco.meta, async () => {
    if (numero !== null) {
      const erro = await validarFicha(banco, plantaId, numero);
      if (erro) throw new Error(erro);
      const proxima = await lerMeta<number>(banco, "proxima_ficha", 1);
      if (numero >= proxima) await gravarMeta(banco, "proxima_ficha", numero + 1);
    }
    await banco.plantas.update(plantaId, { ficha: numero });
  });
}

/**
 * Plano de numeração automática: cada planta sem número (fora as removidas), em ordem de grupo e código,
 * recebe o menor número livre — nunca um já usado nem um de ficha excluída. Função pura.
 */
export function planejarNumeracao(
  plantas: Pick<Planta, "id" | "ficha" | "grupo" | "status">[],
  excluidas: number[]
): { id: string; ficha: number }[] {
  const ocupados = new Set<number>([...excluidas, ...plantas.filter((p) => p.ficha !== null).map((p) => p.ficha!)]);
  const pendentes = plantas
    .filter((p) => p.ficha === null && p.status !== "removida")
    .sort((a, b) => (a.grupo ?? 99) - (b.grupo ?? 99) || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
  const plano: { id: string; ficha: number }[] = [];
  let n = 1;
  for (const p of pendentes) {
    while (ocupados.has(n)) n++;
    plano.push({ id: p.id, ficha: n });
    ocupados.add(n);
  }
  return plano;
}

/** Aplica a numeração automática e avança a próxima ficha. Devolve quantas fichas foram numeradas. */
export async function numerarPendentes(banco: BancoInventario): Promise<number> {
  return banco.transaction("rw", banco.plantas, banco.meta, async () => {
    const plano = planejarNumeracao(await banco.plantas.toArray(), await lerMeta<number[]>(banco, "fichas_excluidas", []));
    for (const { id, ficha } of plano) await banco.plantas.update(id, { ficha });
    if (plano.length) {
      const maior = Math.max(...plano.map((p) => p.ficha));
      const proxima = await lerMeta<number>(banco, "proxima_ficha", 1);
      if (maior >= proxima) await gravarMeta(banco, "proxima_ficha", maior + 1);
    }
    return plano.length;
  });
}

/** Próximo código de planta (P63, P64…), contando também os já excluídos/removidos. */
export function proximoIdPlanta(ids: string[]): string {
  const maior = ids.reduce((m, id) => {
    const n = /^P(\d+)$/.exec(id);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `P${String(maior + 1).padStart(2, "0")}`;
}

/** Cria uma planta nova com a próxima ficha. Campos não informados ficam vazios (não inventa dados). */
export async function criarPlanta(banco: BancoInventario, dados: Partial<Planta>): Promise<string> {
  return banco.transaction("rw", banco.plantas, banco.meta, async () => {
    const ultimo = await lerMeta<string | null>(banco, "ultimo_id_planta", null);
    const usados = [...((await banco.plantas.toCollection().primaryKeys()) as string[]), ...(ultimo ? [ultimo] : [])];
    const id = proximoIdPlanta(usados);
    await gravarMeta(banco, "ultimo_id_planta", id);
    const ficha = await reservarProximaFicha(banco);
    const planta: Planta = {
      id, ficha, nome_popular: "", nome_cientifico: null, grupo: null, quantidade: 1, status: "ativa",
      data_entrada: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
      origem: null, zona: null, ph_min: null, ph_max: null, rega_gatilho_min: null, rega_gatilho_max: null,
      luz: null, vaso: null, substrato: null, adubacao: null, objetivo: null, tags: [], proibicoes: [],
      historico: "", params_origem: "inventario", alertas: [],
      ...dados,
      qr_code: linkPlanta(id),
      excluida_em: null
    };
    await banco.plantas.add(planta);
    return id;
  });
}

/** Reserva o próximo número de ficha para uma planta nova. */
export async function reservarProximaFicha(banco: BancoInventario): Promise<number> {
  return banco.transaction("rw", banco.meta, async () => {
    const proxima = await lerMeta<number>(banco, "proxima_ficha", 1);
    await gravarMeta(banco, "proxima_ficha", proxima + 1);
    return proxima;
  });
}

// ---------- Exclusão ----------

/** Primeiro passo: marca como removida (some das listas, fica no histórico). */
export async function removerPlanta(banco: BancoInventario, plantaId: string) {
  await banco.plantas.update(plantaId, { status: "removida", excluida_em: new Date().toISOString() });
}

/** Desfaz a remoção, voltando a planta para "ativa". */
export async function reativarPlanta(banco: BancoInventario, plantaId: string) {
  await banco.plantas.update(plantaId, { status: "ativa", excluida_em: null });
}

/** Segundo passo: apaga ficha, eventos, medições, fotos e pendências da planta. O número da ficha nunca volta a ser usado. */
export async function excluirDefinitivamente(banco: BancoInventario, plantaId: string) {
  await banco.transaction(
    "rw",
    [banco.plantas, banco.eventos, banco.medicoes, banco.fotos, banco.pendencias, banco.projetos, banco.meta,
      banco.apagados, banco.arquivos_fotos],
    async () => {
      const planta = await banco.plantas.get(plantaId);
      if (!planta) return;
      if (planta.ficha !== null) {
        const excluidas = await lerMeta<number[]>(banco, "fichas_excluidas", []);
        await gravarMeta(banco, "fichas_excluidas", [...excluidas, planta.ficha]);
      }
      // o código também nunca volta a ser usado
      const ultimo = await lerMeta<string | null>(banco, "ultimo_id_planta", null);
      const maior = proximoIdPlanta([plantaId, ...(ultimo ? [ultimo] : [])]);
      await gravarMeta(banco, "ultimo_id_planta", `P${String(Number(maior.slice(1)) - 1).padStart(2, "0")}`);
      for (const tabela of ["eventos", "medicoes", "fotos", "pendencias"] as const) {
        const ids = (await banco[tabela].where("planta_id").equals(plantaId).primaryKeys()) as string[];
        for (const id of ids) await anotarExclusao(banco, tabela, id);
        await banco[tabela].bulkDelete(ids);
        if (tabela === "fotos") await banco.arquivos_fotos.bulkDelete(ids);
      }
      await anotarExclusao(banco, "plantas", plantaId);
      await banco.projetos.toCollection().modify((pr) => {
        pr.plantas = pr.plantas.filter((id) => id !== plantaId);
      });
      await banco.plantas.delete(plantaId);
    }
  );
}

// ---------- Revisão da carga inicial ----------

export const precisaRevisao = (p: Planta) =>
  p.status !== "removida" && (p.alertas.length > 0 || p.status === "pendente_confirmacao");

/**
 * Confirma a planta na revisão: os alertas resolvidos vão para o histórico de eventos
 * (nada se perde) e "pendente de confirmação" passa a "ativa".
 */
export async function confirmarRevisao(banco: BancoInventario, plantaId: string) {
  await banco.transaction("rw", banco.plantas, banco.eventos, async () => {
    const p = await banco.plantas.get(plantaId);
    if (!p) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const partes: string[] = [];
    if (p.status === "pendente_confirmacao") partes.push("Inclusão no inventário confirmada.");
    for (const a of p.alertas) partes.push(`Alerta resolvido: ${a}`);
    if (partes.length) {
      await banco.eventos.add({
        id: crypto.randomUUID(), planta_id: plantaId, data: hoje, tipo: "revisao",
        produto: null, dose_g_l: null, volume_ml: null, observacao: partes.join(" ")
      });
    }
    await banco.plantas.update(plantaId, {
      alertas: [],
      status: p.status === "pendente_confirmacao" ? "ativa" : p.status
    });
  });
}

/** Tira o selo "parâmetros sugeridos" depois que o Wilson confere pH, rega e luz. */
export async function confirmarParametros(banco: BancoInventario, plantaId: string) {
  await banco.plantas.update(plantaId, { params_origem: "confirmado" });
}
