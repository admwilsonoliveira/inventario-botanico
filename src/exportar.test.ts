import { describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { BancoInventario } from "./db";
import { carregarSeVazio, type SeedJson } from "./carga";
import { montarTabelas, paraCelula } from "./exportar";

describe("exportação .xlsx", () => {
  it("tem uma aba por tabela, com todas as plantas", async () => {
    const b = new BancoInventario("exportar");
    await b.open();
    await carregarSeVazio(b, seedJson as unknown as SeedJson);
    const t = await montarTabelas(b);
    expect(Object.keys(t)).toEqual(expect.arrayContaining(["Plantas", "Eventos", "Medições", "Pendências", "Insumos", "Regras"]));
    expect(t.Plantas).toHaveLength(62);
    expect(t.Plantas.find((p) => p.id === "P08")!.proibicoes).toBe("forth_flores");
  });

  it("converte valores para célula", () => {
    expect(paraCelula(["a", "b"])).toBe("a, b");
    expect(paraCelula(null)).toBe("");
    expect(paraCelula({ x: 1 })).toBe('{"x":1}');
    expect(paraCelula(6.5)).toBe(6.5);
  });
});
