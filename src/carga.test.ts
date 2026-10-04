import { beforeEach, describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { BancoInventario, lerMeta } from "./db";
import {
  carregarSeVazio, confirmarRevisao, definirFicha, excluirDefinitivamente, numerarPendentes, planejarNumeracao,
  precisaRevisao, prepararCarga, removerPlanta, reservarProximaFicha, restaurarCarga, type SeedJson, validarFicha
} from "./carga";

const seed = seedJson as unknown as SeedJson;
let banco: BancoInventario;
let n = 0;

beforeEach(async () => {
  banco = new BancoInventario(`teste-${++n}`);
  await banco.open();
});

describe("prepararCarga", () => {
  const carga = prepararCarga(seed);

  it("importa todas as seções do JSON", () => {
    expect(carga.plantas).toHaveLength(62);
    expect(carga.lista_desejos).toHaveLength(seed.lista_desejos.length);
    expect(carga.eventos).toHaveLength(seed.eventos.length);
    expect(carga.pendencias).toHaveLength(seed.pendencias.length);
    expect(carga.projetos).toHaveLength(6);
    expect(carga.zonas).toHaveLength(5);
    expect(carga.insumos).toHaveLength(seed.insumos.length);
    expect(carga.regras).toHaveLength(18);
    expect(carga.rotinas).toHaveLength(4);
    expect(carga.meta.proxima_ficha).toBe(53);
  });

  it("não altera os dados das plantas e acrescenta o link do QR", () => {
    const p01 = carga.plantas.find((p) => p.id === "P01")!;
    expect(p01.nome_popular).toBe("Rosa-do-deserto");
    expect(p01.ficha).toBeNull();
    expect(p01.ph_min).toBe(6.5);
    expect(p01.qr_code).toBe("#/planta/P01");
    expect(p01.excluida_em).toBeNull();
    expect(carga.plantas.find((p) => p.id === "P31")!.ficha).toBe(47);
  });

  it("gera ids únicos para eventos, pendências e rotinas e ativa todas as regras", () => {
    expect(new Set(carga.eventos.map((e) => e.id)).size).toBe(carga.eventos.length);
    expect(new Set(carga.pendencias.map((e) => e.id)).size).toBe(carga.pendencias.length);
    expect(carga.regras.every((r) => r.ativa)).toBe(true);
  });

  it("separa para revisão as plantas com alerta ou pendentes de confirmação", () => {
    const ids = carga.plantas.filter(precisaRevisao).map((p) => p.id);
    expect(ids).toContain("P06"); // conflito de grupo
    expect(ids).toContain("P38"); // conflito de sol
    expect(ids).toContain("P41"); // conflito de adubação
    expect(ids).toContain("P51"); // pendente de confirmação
    expect(ids).toContain("P52");
    expect(ids).not.toContain("P01");
  });
});

describe("carregarSeVazio", () => {
  it("importa na primeira abertura", async () => {
    expect(await carregarSeVazio(banco, seed)).toBe(true);
    expect(await banco.plantas.count()).toBe(62);
    expect(await lerMeta(banco, "proxima_ficha", 0)).toBe(53);
  });

  it("nunca roda de novo se já houver dados", async () => {
    await carregarSeVazio(banco, seed);
    await banco.plantas.update("P01", { nome_popular: "Editada" });
    expect(await carregarSeVazio(banco, seed)).toBe(false);
    expect((await banco.plantas.get("P01"))!.nome_popular).toBe("Editada");
  });

  it("restaurar apaga as edições e volta à carga original", async () => {
    await carregarSeVazio(banco, seed);
    await banco.plantas.update("P01", { nome_popular: "Editada" });
    await banco.medicoes.add({ id: "M1", planta_id: "P01", data_hora: "2026-10-04", umidade: 2, ph: null, luz: null, temperatura: null, local_sonda: "colo" });
    await restaurarCarga(banco, seed);
    expect((await banco.plantas.get("P01"))!.nome_popular).toBe("Rosa-do-deserto");
    expect(await banco.medicoes.count()).toBe(0);
  });
});

describe("numeração das fichas", () => {
  beforeEach(() => carregarSeVazio(banco, seed));

  it("nova planta recebe a próxima ficha e incrementa", async () => {
    expect(await reservarProximaFicha(banco)).toBe(53);
    expect(await reservarProximaFicha(banco)).toBe(54);
  });

  it("não aceita número já usado por outra planta", async () => {
    expect(await validarFicha(banco, "P01", 47)).toMatch(/Filodendro/);
    expect(await validarFicha(banco, "P31", 47)).toBeNull();
    expect(await validarFicha(banco, "P01", 0)).not.toBeNull();
  });

  it("preencher um número acima da próxima ficha empurra a próxima", async () => {
    await definirFicha(banco, "P01", 12);
    expect((await banco.plantas.get("P01"))!.ficha).toBe(12);
    expect(await lerMeta(banco, "proxima_ficha", 0)).toBe(53);
    await definirFicha(banco, "P02", 60);
    expect(await lerMeta(banco, "proxima_ficha", 0)).toBe(61);
  });

  it("nunca reutiliza número de ficha excluída", async () => {
    await removerPlanta(banco, "P31");
    await excluirDefinitivamente(banco, "P31");
    expect(await validarFicha(banco, "P01", 47)).toMatch(/excluída/);
    await expect(definirFicha(banco, "P01", 47)).rejects.toThrow();
  });
});

describe("numeração automática", () => {
  beforeEach(() => carregarSeVazio(banco, seed));

  it("preenche os números livres, sem repetir e sem reaproveitar ficha excluída", async () => {
    await definirFicha(banco, "P02", 1); // já numerada à mão
    await removerPlanta(banco, "P31");
    await excluirDefinitivamente(banco, "P31"); // ficha 47 nunca mais
    await removerPlanta(banco, "P46"); // removida: não recebe número

    const qtd = await numerarPendentes(banco);
    const plantas = await banco.plantas.toArray();
    const ativas = plantas.filter((p) => p.status !== "removida");
    expect(ativas.every((p) => p.ficha !== null)).toBe(true);
    expect((await banco.plantas.get("P46"))!.ficha).toBeNull();
    expect((await banco.plantas.get("P02"))!.ficha).toBe(1);
    expect((await banco.plantas.get("P01"))!.ficha).toBe(2); // grupo 1, primeiro livre depois do 1
    const numeros = ativas.map((p) => p.ficha);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(numeros).not.toContain(47);
    expect(qtd).toBe(ativas.length - 6); // P02 + as 5 que já vieram numeradas (48–52)
    const maior = Math.max(...(numeros as number[]));
    expect(await lerMeta(banco, "proxima_ficha", 0)).toBe(maior + 1);
  });

  it("segue a ordem dos grupos", () => {
    const plano = planejarNumeracao(
      [
        { id: "P10", ficha: null, grupo: 2, status: "ativa" },
        { id: "P2", ficha: null, grupo: 1, status: "ativa" },
        { id: "P9", ficha: 1, grupo: 1, status: "ativa" }
      ],
      []
    );
    expect(plano).toEqual([{ id: "P2", ficha: 2 }, { id: "P10", ficha: 3 }]);
  });
});

describe("exclusão e revisão", () => {
  beforeEach(() => carregarSeVazio(banco, seed));

  it("remover marca a planta e guarda a data", async () => {
    await removerPlanta(banco, "P46");
    const p = (await banco.plantas.get("P46"))!;
    expect(p.status).toBe("removida");
    expect(p.excluida_em).not.toBeNull();
    expect(await banco.eventos.where("planta_id").equals("P46").count()).toBeGreaterThan(0);
  });

  it("excluir definitivamente apaga a planta, eventos e pendências e tira dos projetos", async () => {
    await excluirDefinitivamente(banco, "P41");
    expect(await banco.plantas.get("P41")).toBeUndefined();
    expect(await banco.eventos.where("planta_id").equals("P41").count()).toBe(0);
    expect(await banco.pendencias.where("planta_id").equals("P41").count()).toBe(0);
    expect((await banco.projetos.get("PR01"))!.plantas).toEqual([]);
  });

  it("confirmar a revisão limpa os alertas, ativa a pendente e registra no histórico", async () => {
    await confirmarRevisao(banco, "P51");
    const p = (await banco.plantas.get("P51"))!;
    expect(p.status).toBe("ativa");
    expect(p.alertas).toEqual([]);
    expect(precisaRevisao(p)).toBe(false);
    const ev = await banco.eventos.where("planta_id").equals("P51").filter((e) => e.tipo === "revisao").toArray();
    expect(ev).toHaveLength(1);
    expect(ev[0].observacao).toMatch(/Inclusão no inventário ainda não confirmada/);
  });
});
