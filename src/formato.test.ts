import { describe, expect, it } from "vitest";
import { formatarData, formatarFaixa } from "./formato";

describe("formatarData", () => {
  it("mostra mês sem dia como out/2026", () => {
    expect(formatarData("2026-10")).toBe("out/2026");
    expect(formatarData("2026-06")).toBe("jun/2026");
  });
  it("mostra data completa como dd/mm/aaaa", () => {
    expect(formatarData("2026-09-28")).toBe("28/09/2026");
    expect(formatarData("2026-09-28T13:45:00.000Z")).toBe("28/09/2026");
  });
  it("mostra só o ano e trata vazio", () => {
    expect(formatarData("2027")).toBe("2027");
    expect(formatarData(null)).toBe("—");
  });
});

describe("formatarFaixa", () => {
  it("usa vírgula decimal e traço", () => {
    expect(formatarFaixa(6.5, 7.5)).toBe("6,5–7,5");
    expect(formatarFaixa(2, 2)).toBe("2");
    expect(formatarFaixa(null, null)).toBe("—");
  });
});
