import { describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { prepararCarga, type SeedJson } from "./carga";
import {
  avancarFase, emPropagacao, mapaDeZonas, metodoDe, paraComparar, porEspecie, porMetodo, registrarMarco, taxasDeSucesso
} from "./evolucao";
import type { Evento } from "./types";

const carga = prepararCarga(seedJson as unknown as SeedJson);
const ev = (e: Partial<Evento>): Evento =>
  ({ id: Math.random().toString(), planta_id: null, data: "2026-10-01", tipo: "observacao", produto: null, dose_g_l: null, volume_ml: null, observacao: null, ...e });

describe("projetos", () => {
  const morganville = carga.projetos.find((p) => p.id === "PR01")!;
  it("avançar fase guarda a passagem como marco", () => {
    const p = avancarFase(morganville, "Formação dos braços", "Mar/2027: primeira floração", "2026-10-20");
    expect(p.fase_atual).toBe("Formação dos braços");
    expect(p.proximo_marco).toBe("Mar/2027: primeira floração");
    expect(p.marcos).toEqual([{ data: "2026-10-20", texto: "Fase: Engrossamento do tronco → Formação dos braços" }]);
  });
  it("registrar marco não muda a fase", () => {
    const p = registrarMarco(morganville, "Poda estrutural feita", null, "2026-10-15");
    expect(p.fase_atual).toBe("Engrossamento do tronco");
    expect(p.marcos![0].texto).toBe("Poda estrutural feita");
  });
});

describe("propagação", () => {
  it("reconhece o método pela origem", () => {
    expect(metodoDe("Estaca")).toBe("estaca");
    expect(metodoDe("Estaquia de 90 cm")).toBe("estaca");
    expect(metodoDe("Sementes compradas em set/2026")).toBe("semente");
    expect(metodoDe("Muda basal separada")).toBe("divisao");
    expect(metodoDe(null)).toBe("outro");
  });
  it("lista os lotes em propagação da carga", () => {
    expect(carga.plantas.filter(emPropagacao).map((p) => p.id)).toEqual(["P42", "P43", "P44", "P45"]);
  });
  it("calcula a taxa por método e por espécie", () => {
    const eventos = [
      ev({ tipo: "propagacao_resultado", produto: "Estaca", especie: "Bougainvillea sp.", tentadas: 2, pegaram: 1 }),
      ev({ tipo: "propagacao_resultado", produto: "Estaca", especie: "Lantana camara", tentadas: 1, pegaram: 1 }),
      ev({ tipo: "propagacao_resultado", produto: "Semente", especie: "Capsicum baccatum", tentadas: 10, pegaram: 7 }),
      ev({ tipo: "rega" })
    ];
    const m = taxasDeSucesso(eventos, porMetodo);
    expect(m).toEqual([
      { chave: "semente", tentadas: 10, pegaram: 7, taxa: 0.7 },
      { chave: "estaca", tentadas: 3, pegaram: 2, taxa: 2 / 3 }
    ]);
    expect(taxasDeSucesso(eventos, porEspecie).find((t) => t.chave === "Bougainvillea sp.")!.taxa).toBe(0.5);
  });
});

describe("mapa das zonas", () => {
  it("põe cada planta na sua zona e marca conflito de luz", () => {
    const plantas = carga.plantas.map((p) => (p.id === "P01" ? { ...p, zona: "Sala" } : p)); // Rosa-do-deserto (sol pleno) na sala
    const mapa = mapaDeZonas(carga.zonas, plantas);
    const varanda = mapa.find((s) => s.zona?.id === "Z03")!;
    expect(varanda.plantas.map((x) => x.planta.id)).toEqual(["P15", "P16", "P17", "P18"]);
    expect(varanda.plantas.every((x) => !x.conflito)).toBe(true);
    const sala = mapa.find((s) => s.zona?.id === "Z04")!;
    expect(sala.plantas.find((x) => x.planta.id === "P01")!.conflito).toBe(true);
    const semZona = mapa.find((s) => s.zona === null)!;
    expect(semZona.plantas.some((x) => x.planta.id === "P41")).toBe(true); // "Estrutura/pilastra" não é nome exato de zona
  });
});

describe("linha do tempo", () => {
  it("compara a primeira e a última foto do mesmo tipo", () => {
    const fotos = [
      { id: "a", data: "2026-08-01", tipo: 1 }, { id: "b", data: "2026-09-01", tipo: 2 },
      { id: "c", data: "2026-10-01", tipo: 1 }
    ];
    expect(paraComparar(fotos)!.map((f) => f.id)).toEqual(["a", "c"]);
    expect(paraComparar([fotos[0]])).toBeNull();
  });
});
