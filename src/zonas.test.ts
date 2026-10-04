import { describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { horasDeSol, luzDaZona, necessidadeDeLuz, zonasCompativeis } from "./zonas";
import type { Zona } from "./types";

const zonas = (seedJson as unknown as { zonas: Zona[] }).zonas;

describe("horas de sol das zonas", () => {
  it("lê os textos da carga inicial", () => {
    expect(horasDeSol("a partir das 12h30")).toBeCloseTo(5.5);
    expect(horasDeSol("16h30–18h")).toBeCloseTo(1.5);
    expect(horasDeSol("17h–18h")).toBe(1);
    expect(horasDeSol("luz difusa")).toBe(0);
    expect(horasDeSol("sol pleno")).toBe(8);
    expect(horasDeSol(null)).toBeNull();
  });
  it("classifica as zonas", () => {
    expect(zonas.map((z) => luzDaZona(z))).toEqual(["sol_pleno", "luz_filtrada", "luz_filtrada", "luz_filtrada", "sol_pleno"]);
  });
});

describe("necessidade de luz da planta", () => {
  it("entende textos livres e a nota do medidor", () => {
    expect(necessidadeDeLuz("Luz filtrada, umidade alta")).toBe("luz_filtrada");
    expect(necessidadeDeLuz("Sol pleno")).toBe("sol_pleno");
    expect(necessidadeDeLuz("Sol da manhã")).toBe("meia_sombra");
    expect(necessidadeDeLuz("", 8)).toBe("sol_pleno");
    expect(necessidadeDeLuz("")).toBeNull();
  });
  it("Alocasia 'Polly' (luz filtrada) cabe nas varandas sombreadas e na sala", () => {
    const ok = zonasCompativeis(zonas, necessidadeDeLuz("Luz filtrada")).map((z) => z.id);
    expect(ok).toEqual(["Z02", "Z03", "Z04"]);
  });
});
