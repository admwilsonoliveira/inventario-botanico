import { describe, expect, it } from "vitest";
import { calcularDose, descreverDose } from "./calculadora";

describe("calcularDose", () => {
  it("massa = dose × volume quando dá para pesar", () => {
    const r = calcularDose(1, 2);
    expect(r.metodo).toBe("pesar");
    expect(r.massa_g).toBe(2);
    expect(calcularDose(0.3, 1).metodo).toBe("pesar");
  });

  it("exemplo do protocolo: 0,2 g/L em 1 L com mãe de 0,1 g/ml → 2,0 ml", () => {
    const r = calcularDose(0.2, 1, 0.1);
    expect(r.metodo).toBe("diluicao");
    expect(r.massa_g).toBe(0.2);
    expect(r.seringa_ml).toBe(2);
    expect(r.puxadas).toBe(1);
  });

  it("arredonda a seringa a 0,1 ml", () => {
    // 0,15 g/L × 0,7 L = 0,105 g ÷ 0,1 = 1,05 ml → 1,1 ml
    expect(calcularDose(0.15, 0.7, 0.1).seringa_ml).toBe(1.1);
  });

  it("acima de 3 ml divide em puxadas", () => {
    // 0,25 g/L × 1 L = 0,25 g ÷ 0,05 g/ml = 5 ml → 2 puxadas de 2,5 ml
    const r = calcularDose(0.25, 1, 0.05);
    expect(r.seringa_ml).toBe(5);
    expect(r.puxadas).toBe(2);
    expect(r.ml_por_puxada).toBe(2.5);
    // exatamente 3 ml cabe numa puxada
    const tres = calcularDose(0.15, 1, 0.05);
    expect(tres.seringa_ml).toBe(3);
    expect(tres.puxadas).toBe(1);
  });

  it("recusa valores inválidos", () => {
    expect(() => calcularDose(0, 1)).toThrow();
    expect(() => calcularDose(0.1, 1, 0)).toThrow();
  });

  it("descreve em português", () => {
    expect(descreverDose(calcularDose(1, 2))).toBe("Pese 2 g.");
    expect(descreverDose(calcularDose(0.2, 1, 0.1))).toMatch(/Puxe 2 ml/);
    expect(descreverDose(calcularDose(0.25, 1, 0.05))).toMatch(/2 puxadas de 2,5 ml/);
  });
});
