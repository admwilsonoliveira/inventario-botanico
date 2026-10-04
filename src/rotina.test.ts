import { describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { prepararCarga, type SeedJson } from "./carga";
import { alertasDeClima, calcularBaixa, checkupsDoDia, diaDoCheckup, lembretesDeRotina } from "./rotina";
import type { Evento, Insumo } from "./types";

const carga = prepararCarga(seedJson as unknown as SeedJson);
const plantas = carga.plantas;
const ev = (e: Partial<Evento>): Evento =>
  ({ id: Math.random().toString(), planta_id: null, data: "2026-10-01", tipo: "observacao", produto: null, dose_g_l: null, volume_ml: null, observacao: null, ...e });

describe("check-up distribuído no mês", () => {
  it("toda planta ativa tem um dia, cerca de 2 por dia", () => {
    const dias = diaDoCheckup(plantas, "2026-10-04");
    expect(dias.size).toBe(62);
    const porDia = new Map<number, number>();
    for (const d of dias.values()) porDia.set(d, (porDia.get(d) ?? 0) + 1);
    expect(Math.max(...porDia.values())).toBeLessThanOrEqual(3);
    expect(Math.min(...porDia.values())).toBeGreaterThanOrEqual(2);
  });

  it("separa hoje e atrasados, e pula quem teve check-up recente", () => {
    const r = checkupsDoDia(plantas, [], "2026-10-04");
    expect(r.hoje.length).toBeGreaterThanOrEqual(2);
    expect(r.atrasados.length).toBeGreaterThanOrEqual(6);
    const alvo = r.hoje[0];
    const r2 = checkupsDoDia(plantas, [ev({ planta_id: alvo.id, tipo: "checkup", data: "2026-09-25" })], "2026-10-04");
    expect(r2.hoje.map((p) => p.id)).not.toContain(alvo.id);
  });
});

describe("lembretes das rotinas", () => {
  const eventos = carga.eventos as Evento[];

  it("lixiviação: a geral de 25/09 vence em 25/10", () => {
    expect(lembretesDeRotina(plantas, eventos, "2026-10-04", 14).map((l) => l.chave)).not.toContain("lixiviacao");
    const l = lembretesDeRotina(plantas, eventos, "2026-10-25", 14).find((x) => x.chave === "lixiviacao")!;
    expect(l.texto).toMatch(/25\/09/);
  });

  it("acidificação lista as acidófilas sem registro recente", () => {
    const l = lembretesDeRotina(plantas, eventos, "2026-10-04", 14).find((x) => x.chave === "acidificacao")!;
    expect(l.plantas.map((p) => p.id).sort()).toEqual(["P33", "P34", "P35"]);
    const feitos = [...eventos, ev({ planta_id: "P33", tipo: "acidificacao", data: "2026-10-01" })];
    const l2 = lembretesDeRotina(plantas, feitos, "2026-10-04", 14).find((x) => x.chave === "acidificacao")!;
    expect(l2.plantas.map((p) => p.id)).not.toContain("P33");
  });

  it("retomada da adubação só em outubro e sem a mangueira em dormência", () => {
    const l = lembretesDeRotina(plantas, eventos, "2026-10-04", 14).find((x) => x.chave === "retomada")!;
    expect(l.plantas.map((p) => p.id)).not.toContain("P61");
    expect(l.plantas.map((p) => p.id)).not.toContain("P47"); // a plantar
    expect(lembretesDeRotina(plantas, eventos, "2026-11-04", 14).map((x) => x.chave)).not.toContain("retomada");
  });
});

describe("alertas de clima", () => {
  const base = {
    datas: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"],
    tmax: [30, 31, 30, 33, 35, 29],
    umidadeMin: [40, 35, 33, 28, 25, 50],
    chuva: [0, 0, 1, 0, 0, 14],
    diasPassados: 3
  };
  it("calor, ar seco e início das chuvas", () => {
    const a = alertasDeClima(base, "2026-10-04");
    expect(a.map((x) => x.tipo)).toEqual(["calor", "ar_seco", "chuvas"]);
    expect(a[0].texto).toMatch(/35 °C em 05\/10/);
    expect(a[1].texto).toMatch(/25% em 05\/10/);
    expect(a[2].texto).toMatch(/14 mm previstos em 06\/10/);
  });
  it("não fala em início das chuvas se já vinha chovendo", () => {
    const a = alertasDeClima({ ...base, chuva: [8, 6, 1, 0, 0, 14] }, "2026-10-04");
    expect(a.map((x) => x.tipo)).not.toContain("chuvas");
  });
});

describe("baixa de estoque", () => {
  const ouroVerde = carga.insumos.find((i) => i.nome.startsWith("Ouro Verde"))! as Insumo; // 30 g
  it("dose × volume sai do estoque em gramas", () => {
    expect(calcularBaixa(ouroVerde, { dose_g_l: 1, volume_ml: 500 })).toEqual({ quantidade: 29.5, gasto: 0.5 });
    expect(calcularBaixa(ouroVerde, { dose_g_l: 2, volume_ml: 20_000 })!.quantidade).toBe(0); // não fica negativo
  });
  it("sem quantidade controlada ou sem dose, não baixa", () => {
    const basalto = carga.insumos.find((i) => i.nome === "Pó de basalto")!;
    expect(calcularBaixa(basalto, { dose_g_l: 1, volume_ml: 500 })).toBeNull();
    expect(calcularBaixa(ouroVerde, { dose_g_l: null, volume_ml: 500 })).toBeNull();
    expect(calcularBaixa({ ...ouroVerde, quantidade: 1, unidade: "kg" }, { dose_g_l: 1, volume_ml: 1000 })).toEqual({ quantidade: 0.999, gasto: 0.001 });
  });
});

describe("resumo da semana", () => {
  it("mostra máxima, ar e chuva dos próximos dias", async () => {
    const { resumoDaSemana } = await import("./rotina");
    expect(resumoDaSemana({ datas: ["2026-10-03", "2026-10-04", "2026-10-05"], tmax: [40, 26.3, 28.1], umidadeMin: [10, 59, 52], chuva: [50, 0, 1.6], diasPassados: 1 }, "2026-10-04"))
      .toBe("Próximos 2 dias: máxima de 28 °C, ar até 52%, 2 mm de chuva. Sem alertas.");
  });
});

describe("tempo de hoje", () => {
  it("agora, máxima/mínima e chuva", async () => {
    const { climaDeHoje } = await import("./rotina");
    const p = { datas: ["2026-10-03", "2026-10-04"], tmax: [30, 26.3], tmin: [15, 16.6], umidadeMin: [40, 59], chuva: [0, 0], probChuva: [0, 10], diasPassados: 1, agora: { temperatura: 22.4, umidade: 71 } };
    expect(climaDeHoje(p, "2026-10-04")).toBe("Hoje: agora 22 °C e ar 71% · máx. 26 °C / mín. 17 °C · sem chuva.");
    expect(climaDeHoje({ ...p, chuva: [0, 4.6], probChuva: [0, 80] }, "2026-10-04")).toMatch(/chuva 5 mm \(80%\)/);
    expect(climaDeHoje({ ...p, probChuva: [0, 45] }, "2026-10-04")).toMatch(/chance de chuva 45%/);
  });
});
