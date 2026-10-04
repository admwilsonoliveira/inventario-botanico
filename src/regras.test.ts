import { describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { prepararCarga, type SeedJson } from "./carga";
import { avaliar, CONDICOES, condicoesDesconhecidas, temBloqueio, type Contexto } from "./regras";
import type { Evento } from "./types";

const carga = prepararCarga(seedJson as unknown as SeedJson);
const regras = carga.regras;
const planta = (id: string) => carga.plantas.find((p) => p.id === id)!;
const ev = (e: Partial<Evento>): Partial<Evento> => ({ id: "novo", data: "2026-10-04", ...e });
const ids = (ctx: Contexto) => avaliar(regras, ctx).map((d) => d.regra.id);

describe("cada condição do JSON tem uma função", () => {
  it("nenhuma regra da carga usa condição desconhecida", () => {
    for (const r of regras) expect(condicoesDesconhecidas(r), r.id).toEqual([]);
  });
});

describe("regras da carga inicial", () => {
  it("R01 bloqueia Forth Flores em planta com proibição (Jade)", () => {
    const ctx = { planta: planta("P08"), evento: ev({ tipo: "adubacao", produto: "Forth Flores 06-18-12" }) };
    expect(ids(ctx)).toContain("R01");
    expect(temBloqueio(avaliar(regras, ctx))).toBe(true);
    // na Ixora (sem proibição) passa
    expect(ids({ planta: planta("P35"), evento: ev({ tipo: "adubacao", produto: "Forth Flores 06-18-12" }) })).not.toContain("R01");
  });

  it("R02 bloqueia vermiculita na lavanda (inclusive como insumo do transplante)", () => {
    expect(ids({ planta: planta("P03"), evento: ev({ tipo: "transplante", insumos: ["Terra vegetal", "Vermiculita"] }) })).toContain("R02");
    expect(ids({ planta: planta("P03"), evento: ev({ tipo: "transplante", insumos: ["Terra vegetal"] }) })).not.toContain("R02");
  });

  it("R03 alerta adubação de jun a set, exceto excecao_pausa", () => {
    expect(ids({ planta: planta("P35"), evento: ev({ tipo: "adubacao", data: "2026-07-10" }) })).toContain("R03");
    expect(ids({ planta: planta("P35"), evento: ev({ tipo: "adubacao", data: "2026-10-10" }) })).not.toContain("R03");
    expect(ids({ planta: planta("P37"), evento: ev({ tipo: "adubacao", data: "2026-07-10" }) })).not.toContain("R03");
  });

  it("R04 bloqueia farinha de osso até 30 dias depois de Forth Flores na mesma planta", () => {
    const historico = [{ id: "h1", planta_id: "P35", data: "2026-09-20", tipo: "adubacao", produto: "Forth Flores 06-18-12" } as Evento];
    const base = { planta: planta("P35"), historico };
    expect(ids({ ...base, evento: ev({ tipo: "adubacao", produto: "Farinha de osso", data: "2026-10-04" }) })).toContain("R04");
    expect(ids({ ...base, evento: ev({ tipo: "adubacao", produto: "Farinha de osso", data: "2026-11-30" }) })).not.toContain("R04");
  });

  it("R05 bloqueia acidificação fora das acidófilas", () => {
    expect(ids({ planta: planta("P01"), evento: ev({ tipo: "acidificacao" }) })).toContain("R05");
    expect(ids({ planta: planta("P33"), evento: ev({ tipo: "acidificacao" }) })).not.toContain("R05");
  });

  it("R06 bloqueia vinagre na folha", () => {
    expect(ids({ planta: planta("P33"), evento: ev({ tipo: "acidificacao", produto: "Vinagre branco", aplicacao: "foliar" }) })).toContain("R06");
    expect(ids({ planta: planta("P33"), evento: ev({ tipo: "acidificacao", produto: "Vinagre branco", aplicacao: "rega" }) })).not.toContain("R06");
  });

  it("R07 bloqueia produtos proibidos", () => {
    expect(ids({ planta: planta("P23"), evento: ev({ tipo: "tratamento", produto: "K-Othrine" }) })).toContain("R07");
    expect(ids({ planta: planta("P23"), evento: ev({ tipo: "tratamento", produto: "Óleo de neem" }) })).not.toContain("R07");
  });

  it("R08 bloqueia água de chuva e R09 alerta anticloro", () => {
    expect(ids({ planta: planta("P23"), evento: ev({ tipo: "rega", agua: "chuva" }) })).toContain("R08");
    expect(ids({ planta: planta("P23"), evento: ev({ tipo: "rega", agua: "torneira" }) })).not.toContain("R08");
    expect(ids({ planta: planta("P21"), evento: ev({ tipo: "rega", produto: "Anticloro" }) })).toContain("R09");
  });

  it("R10 alerta poda acima de 1/3 da área foliar", () => {
    expect(ids({ planta: planta("P41"), evento: ev({ tipo: "poda", percentual_area_foliar: 40 }) })).toContain("R10");
    expect(ids({ planta: planta("P41"), evento: ev({ tipo: "poda", percentual_area_foliar: 30 }) })).not.toContain("R10");
  });

  it("R11 alerta grandes intervenções fora de outubro", () => {
    expect(ids({ planta: planta("P58"), evento: ev({ tipo: "transplante", data: "2026-12-01" }) })).toContain("R11");
    expect(ids({ planta: planta("P58"), evento: ev({ tipo: "transplante", data: "2026-10-15" }) })).not.toContain("R11");
  });

  it("R12 bloqueia adubo junto com a rega em planta de período seco", () => {
    expect(ids({ planta: planta("P01"), evento: ev({ tipo: "adubacao", aplicacao: "rega" }) })).toContain("R12");
    expect(ids({ planta: planta("P01"), evento: ev({ tipo: "adubacao", aplicacao: "substrato" }) })).not.toContain("R12");
  });

  it("R13 bloqueia qualquer adubação na mangueira em dormência", () => {
    expect(ids({ planta: planta("P61"), evento: ev({ tipo: "adubacao", produto: "Forth Jardim 13-05-13" }) })).toContain("R13");
  });

  it("R14 alerta segundo transplante da lavanda", () => {
    expect(ids({ planta: planta("P03"), evento: ev({ tipo: "transplante" }) })).toContain("R14");
  });

  it("R15 alerta decapitação no mesmo dia do transplante", () => {
    const historico = [{ id: "h1", planta_id: "P14", data: "2026-10-04", tipo: "transplante" } as Evento];
    expect(ids({ planta: planta("P14"), historico, evento: ev({ tipo: "decapitacao" }) })).toContain("R15");
    expect(ids({ planta: planta("P14"), historico, evento: ev({ tipo: "decapitacao", data: "2026-10-20" }) })).not.toContain("R15");
  });

  it("R16 alerta recomendação com quarentena e R17 cor impossível", () => {
    expect(ids({ recomendacao: "Faça Quarentena de 14 dias" })).toContain("R16");
    expect(ids({ desejo: "Caládio azul raro" })).toContain("R17");
    expect(ids({ desejo: "Caládio rosa" })).not.toContain("R17");
  });

  it("R18 alerta Forth Flores na hortênsia", () => {
    expect(ids({ planta: planta("P36"), evento: ev({ tipo: "adubacao", produto: "Forth Flores 06-18-12" }) })).toContain("R18");
  });

  it("regra desativada não dispara e bloqueio vem antes do alerta", () => {
    const ctx = { planta: planta("P08"), evento: ev({ tipo: "adubacao", produto: "Forth Flores 06-18-12", data: "2026-07-01" }) };
    const d = avaliar(regras, ctx);
    expect(d[0].tipo).toBe("bloquear");
    const semR01 = regras.map((r) => (r.id === "R01" ? { ...r, ativa: false } : r));
    expect(avaliar(semR01, ctx).map((x) => x.regra.id)).not.toContain("R01");
  });

  it("condições isoladas", () => {
    expect(CONDICOES.produto("Forth Flores", { evento: { produto: "forth flores 06-18-12" } })).toBe(true);
    expect(CONDICOES.mes_fora_de([10], { evento: {} })).toBe(false);
  });
});
