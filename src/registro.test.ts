import { describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { BancoInventario } from "./db";
import { carregarSeVazio, type SeedJson } from "./carga";
import { agruparPendencias, avaliarPh, conferirEvento, periodoDe, vereditoRega } from "./registro";
import type { Pendencia } from "./types";

describe("medição: regar ou aguardar", () => {
  it("suculenta (gatilho 1–2): regar em 2, aguardar em 3", () => {
    const p = { rega_gatilho_min: 1, rega_gatilho_max: 2 };
    expect(vereditoRega(p, 2).acao).toBe("regar");
    expect(vereditoRega(p, 1).acao).toBe("regar");
    expect(vereditoRega(p, 3).acao).toBe("aguardar");
  });
  it("hortênsia (gatilho 3): regar em 3", () => {
    expect(vereditoRega({ rega_gatilho_min: 3, rega_gatilho_max: 3 }, 3).acao).toBe("regar");
    expect(vereditoRega({ rega_gatilho_min: 3, rega_gatilho_max: 3 }, 4).acao).toBe("aguardar");
  });
  it("sem gatilho avisa", () => {
    expect(vereditoRega({ rega_gatilho_min: null, rega_gatilho_max: null }, 2).acao).toBe("sem_gatilho");
  });
  it("pH fora da faixa", () => {
    expect(avaliarPh({ ph_min: 6.5, ph_max: 7.5 }, 5)).toMatch(/abaixo/);
    expect(avaliarPh({ ph_min: 6.5, ph_max: 7.5 }, 7)).toBeNull();
    expect(avaliarPh({ ph_min: 6.5, ph_max: 7.5 }, 8)).toMatch(/acima/);
  });
});

describe("pendências por período", () => {
  const hoje = "2026-10-04";
  it("classifica datas completas e parciais", () => {
    expect(periodoDe("2026-10-01", hoje)).toBe("atrasadas");
    expect(periodoDe("2026-10-04", hoje)).toBe("hoje");
    expect(periodoDe("2026-10-07", hoje)).toBe("semana");
    expect(periodoDe("2026-10-15", hoje)).toBe("mes");
    expect(periodoDe("2026-10", hoje)).toBe("mes");
    expect(periodoDe("2026-09", hoje)).toBe("atrasadas");
    expect(periodoDe("2027-03", hoje)).toBe("depois");
    expect(periodoDe("2026-11-01", hoje)).toBe("depois");
  });
  it("ignora concluídas", () => {
    const lista = [
      { id: "1", planta_id: null, data_prevista: "2026-10-04", acao: "a", concluida_em: null },
      { id: "2", planta_id: null, data_prevista: "2026-10-04", acao: "b", concluida_em: "2026-10-04" }
    ] as Pendencia[];
    expect(agruparPendencias(lista, hoje).hoje.map((p) => p.id)).toEqual(["1"]);
  });
});

describe("conferir evento antes de salvar", () => {
  it("bloqueia Forth Flores na Jade usando as regras do banco", async () => {
    const b = new BancoInventario("registro");
    await b.open();
    await carregarSeVazio(b, seedJson as unknown as SeedJson);
    const d = await conferirEvento(b, { planta_id: "P08", tipo: "adubacao", produto: "Forth Flores 06-18-12", data: "2026-10-04" });
    expect(d.map((x) => x.regra.id)).toContain("R01");
    await b.regras.update("R01", { ativa: false });
    const d2 = await conferirEvento(b, { planta_id: "P08", tipo: "adubacao", produto: "Forth Flores 06-18-12", data: "2026-10-04" });
    expect(d2.map((x) => x.regra.id)).not.toContain("R01");
  });
});
