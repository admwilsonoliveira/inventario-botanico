// Carga inicial (CLAUDE.md, seção 6) e numeração das fichas (seção 5).
import { type BancoInventario, gravarMeta, lerMeta } from "./db";
import type {
  Desejo, Evento, Insumo, Pendencia, Planta, Projeto, Regra, Rotina, Zona
} from "./types";

export interface SeedJson {
  versao: number;
  gerado_em: string;
  local: unknown;
  escalas: unknown;
  proxima_ficha: number;
  observacao_numeracao?: string;
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
  "insumos", "lista_desejos", "zonas", "regras", "rotinas", "meta"
] as const;

async function gravarCarga(banco: BancoInventario, carga: Carga) {
  await banco.plantas.bulkAdd(carga.plantas);
  await banco.lista_desejos.bulkAdd(carga.lista_desejos);
  await banco.eventos.bulkAdd(carga.eventos);
  await banco.pendencias.bulkAdd(carga.pendencias);
  await banco.projetos.bulkAdd(carga.projetos);
  await banco.zonas.bulkAdd(carga.zonas);
  await banco.insumos.bulkAdd(carga.insumos);
  await banco.regras.bulkAdd(carga.regras);
  await banco.rotinas.bulkAdd(carga.rotinas);
  await banco.meta.bulkAdd(Object.entries(carga.meta).map(([chave, valor]) => ({ chave, valor })));
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
    [banco.plantas, banco.eventos, banco.medicoes, banco.fotos, banco.pendencias, banco.projetos, banco.meta],
    async () => {
      const planta = await banco.plantas.get(plantaId);
      if (!planta) return;
      if (planta.ficha !== null) {
        const excluidas = await lerMeta<number[]>(banco, "fichas_excluidas", []);
        await gravarMeta(banco, "fichas_excluidas", [...excluidas, planta.ficha]);
      }
      await banco.eventos.where("planta_id").equals(plantaId).delete();
      await banco.medicoes.where("planta_id").equals(plantaId).delete();
      await banco.fotos.where("planta_id").equals(plantaId).delete();
      await banco.pendencias.where("planta_id").equals(plantaId).delete();
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
