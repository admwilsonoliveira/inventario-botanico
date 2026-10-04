import { beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import seedJson from "../seed/inventario_inicial.json";
import { BancoInventario, EPOCA, gravarMeta, lerMeta } from "./db";
import { carregarSeVazio, excluirDefinitivamente, type SeedJson } from "./carga";
import { aplicarMigracoes } from "./migracoes";
import type { Grupo } from "./types";

const seed = seedJson as unknown as SeedJson;
let banco: BancoInventario;
let n = 0;

beforeEach(async () => {
  banco = new BancoInventario(`teste-migracao-${++n}`);
  await banco.open();
  await carregarSeVazio(banco, seed);
});

/** Volta o banco ao estado de um aparelho que fez a carga antes de 04/10/2026. */
async function simularBancoAntigo() {
  for (const id of ["P46", "P47", "P48", "P49", "P50", "P51", "P52"]) await banco.plantas.update(id, { grupo: 4 });
  await banco.meta.delete("grupos");
  await gravarMeta(banco, "migracoes_aplicadas", []);
}

describe("M002 — carimbo de alteração dos dados da Fase 0", () => {
  it("o que é igual à carga fica com a data zero; o que foi editado fica com a hora atual", async () => {
    // simula a Fase 0 (nada tinha carimbo), abrindo o mesmo banco "por fora", sem os ganchos do app
    await gravarMeta(banco, "migracoes_aplicadas", ["M001-nomes-dos-grupos"]);
    banco.close();
    const cru = new Dexie(banco.name);
    await cru.open();
    for (const t of ["plantas", "eventos", "meta"]) {
      await cru.table(t).toCollection().modify((l: Record<string, unknown>) => {
        if (l.chave === "migracoes_aplicadas") return;
        delete l.atualizado_em;
        if (l.id === "P02") l.objetivo = "teste";
      });
    }
    await cru.table("eventos").add({ id: "uuid-revisao", planta_id: "P06", data: "2026-10-04", tipo: "revisao", produto: null, dose_g_l: null, volume_ml: null, observacao: "ok" });
    cru.close();
    await banco.open();

    await aplicarMigracoes(banco);

    expect((await banco.plantas.get("P01"))!.atualizado_em).toBe(EPOCA);
    expect((await banco.plantas.get("P02"))!.atualizado_em! > EPOCA).toBe(true);
    expect((await banco.eventos.get("E0001"))!.atualizado_em).toBe(EPOCA);
    expect((await banco.eventos.get("uuid-revisao"))!.atualizado_em! > EPOCA).toBe(true);
    expect((await banco.meta.get("proxima_ficha"))!.atualizado_em).toBe(EPOCA);
  });
});

describe("carimbo automático", () => {
  it("carga nova vem com data zero e qualquer edição recebe a hora atual", async () => {
    expect((await banco.plantas.get("P01"))!.atualizado_em).toBe(EPOCA);
    await banco.plantas.update("P01", { objetivo: "flores" });
    expect((await banco.plantas.get("P01"))!.atualizado_em! > EPOCA).toBe(true);
  });

  it("excluir definitivamente anota a exclusão da planta e dos eventos para a planilha", async () => {
    await excluirDefinitivamente(banco, "P41");
    const apagados = await banco.apagados.toArray();
    expect(apagados.some((a) => a.tabela === "plantas" && a.chave === "P41")).toBe(true);
    expect(apagados.filter((a) => a.tabela === "eventos").length).toBeGreaterThan(0);
  });
});

describe("M001 — nomes dos grupos", () => {
  it("carga nova já vem sem Grupo 4 e com os nomes", async () => {
    expect(await banco.plantas.where("grupo").equals(4).count()).toBe(0);
    const grupos = await lerMeta<Grupo[]>(banco, "grupos", []);
    expect(grupos.map((g) => g.numero)).toEqual([1, 2, 3, 4, 5]);
  });

  it("move as plantas do Grupo 4 num aparelho antigo e registra no histórico", async () => {
    await simularBancoAntigo();
    await aplicarMigracoes(banco);
    expect(await banco.plantas.where("grupo").equals(4).count()).toBe(0);
    expect((await banco.plantas.get("P47"))!.grupo).toBe(2);
    expect((await banco.plantas.get("P51"))!.grupo).toBe(2);
    expect((await banco.plantas.get("P46"))!.grupo).toBe(3);
    expect((await banco.plantas.get("P52"))!.grupo).toBe(3);
    expect((await lerMeta<Grupo[]>(banco, "grupos", [])).find((g) => g.numero === 3)!.nome).toBe("Floríferas");
    const ev = await banco.eventos.where("planta_id").equals("P46").filter((e) => e.tipo === "revisao").toArray();
    expect(ev[0].observacao).toMatch(/Grupo 3/);
  });

  it("roda uma vez só e respeita grupo já mudado à mão", async () => {
    await simularBancoAntigo();
    await banco.plantas.update("P46", { grupo: 1 });
    await aplicarMigracoes(banco);
    await banco.plantas.update("P47", { grupo: 5 });
    await aplicarMigracoes(banco);
    expect((await banco.plantas.get("P46"))!.grupo).toBe(1);
    expect((await banco.plantas.get("P47"))!.grupo).toBe(5);
  });
});
