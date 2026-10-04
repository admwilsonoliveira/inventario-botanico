// Correções aplicadas uma única vez em aparelhos que já tinham feito a carga inicial.
// A carga inicial (seed) já vem corrigida, então aparelhos novos só marcam estas migrações como feitas.
import { type BancoInventario, EPOCA, gravarMeta, lerMeta, TABELAS_SYNC } from "./db";
import { type Carga, prepararCarga } from "./carga";
import { seed } from "./seed";
import type { Grupo } from "./types";

interface Migracao {
  id: string;
  aplicar: (banco: BancoInventario) => Promise<void>;
}

export const MIGRACOES: Migracao[] = [
  {
    // 04/10/2026: grupos ganham nome; o Grupo 4 vira "Mudas" (começa vazio)
    id: "M001-nomes-dos-grupos",
    async aplicar(banco) {
      const grupos: Grupo[] = [
        { numero: 1, nome: "Deserto e suculentas" },
        { numero: 2, nome: "Tropicais de folhagem" },
        { numero: 3, nome: "Floríferas" },
        { numero: 4, nome: "Mudas" },
        { numero: 5, nome: "Frutíferas e horta" }
      ];
      await gravarMeta(banco, "grupos", grupos);
      const destino: Record<string, number> = { P47: 2, P48: 2, P49: 2, P50: 2, P51: 2, P46: 3, P52: 3 };
      const hoje = new Date().toISOString().slice(0, 10);
      for (const [id, g] of Object.entries(destino)) {
        const p = await banco.plantas.get(id);
        if (!p || p.grupo !== 4) continue; // já editada à mão: respeita a escolha
        // "data zero" e código fixo: é a mesma correção em todos os aparelhos, não uma edição nova
        await banco.plantas.update(id, { grupo: g, atualizado_em: EPOCA });
        await banco.eventos.put({
          id: `M001-${id}`, atualizado_em: EPOCA, planta_id: id, data: hoje, tipo: "revisao",
          produto: null, dose_g_l: null, volume_ml: null,
          observacao: `Reclassificada do antigo Grupo 4 para o Grupo ${g}.`
        });
      }
    }
  },
  {
    // Fase 1: registros criados na Fase 0 não tinham hora de alteração. O que está igual à carga
    // inicial recebe a "data zero"; o que o Wilson alterou recebe a hora atual (ganha na sincronização).
    id: "M002-carimbo-de-alteracao",
    async aplicar(banco) {
      const carga = prepararCarga(seed);
      const original: Record<string, Map<string, string>> = {};
      const porChave = (linhas: object[], chave: string) =>
        new Map(linhas.map((l) => [String((l as Record<string, unknown>)[chave]), estavel(l)]));
      for (const [tabela, chave] of Object.entries(TABELAS_SYNC)) {
        const linhas = tabela === "meta"
          ? Object.entries(carga.meta).map(([c, valor]) => ({ chave: c, valor }))
          : (carga[tabela as keyof Carga] as object[] | undefined) ?? [];
        original[tabela] = porChave(linhas, chave);
      }
      const agora = new Date().toISOString();
      for (const [tabela, chave] of Object.entries(TABELAS_SYNC)) {
        const t = banco.table(tabela);
        const semCarimbo = await t.filter((l) => !l.atualizado_em).toArray();
        for (const l of semCarimbo) {
          const k = String(l[chave]);
          const igual = original[tabela].get(k) === estavel(l);
          await t.update(k, { atualizado_em: igual ? EPOCA : agora });
        }
      }
    }
  }
];

/** JSON com as chaves em ordem, para comparar registros. */
function estavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).filter((k) => k !== "atualizado_em").sort()
      .map((k) => `${JSON.stringify(k)}:${estavel((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Roda as migrações que ainda não foram aplicadas neste aparelho. */
export async function aplicarMigracoes(banco: BancoInventario) {
  await banco.transaction("rw", Object.keys(TABELAS_SYNC).map((t) => banco.table(t)), async () => {
    const feitas = await lerMeta<string[]>(banco, "migracoes_aplicadas", []);
    for (const m of MIGRACOES) {
      if (feitas.includes(m.id)) continue;
      await m.aplicar(banco);
      feitas.push(m.id);
    }
    await gravarMeta(banco, "migracoes_aplicadas", feitas);
  });
}
