// Correções aplicadas uma única vez em aparelhos que já tinham feito a carga inicial.
// A carga inicial (seed) já vem corrigida, então aparelhos novos só marcam estas migrações como feitas.
import { type BancoInventario, gravarMeta, lerMeta } from "./db";
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
        await banco.plantas.update(id, { grupo: g });
        await banco.eventos.add({
          id: crypto.randomUUID(), planta_id: id, data: hoje, tipo: "revisao",
          produto: null, dose_g_l: null, volume_ml: null,
          observacao: `Reclassificada do antigo Grupo 4 para o Grupo ${g}.`
        });
      }
    }
  }
];

/** Roda as migrações que ainda não foram aplicadas neste aparelho. */
export async function aplicarMigracoes(banco: BancoInventario) {
  await banco.transaction("rw", banco.plantas, banco.eventos, banco.meta, async () => {
    const feitas = await lerMeta<string[]>(banco, "migracoes_aplicadas", []);
    for (const m of MIGRACOES) {
      if (feitas.includes(m.id)) continue;
      await m.aplicar(banco);
      feitas.push(m.id);
    }
    await gravarMeta(banco, "migracoes_aplicadas", feitas);
  });
}
