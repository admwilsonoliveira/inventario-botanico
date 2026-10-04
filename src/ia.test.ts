import { describe, expect, it } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { prepararCarga, type SeedJson } from "./carga";
import {
  chaveEspecie, conferirResposta, emEstoque, type FichaIA, type Laudo, montarInstrucoes, orgaoDaFoto,
  plantasDaEspecie, rascunhoDaFicha, resumirClima, resumoLaudo
} from "./ia";

const carga = prepararCarga(seedJson as unknown as SeedJson);
const planta = (id: string) => carga.plantas.find((p) => p.id === id)!;
const grupos = (seedJson as unknown as SeedJson).grupos;

const laudo = (acoes: Laudo["acoes"]): Laudo => ({
  nota: 7,
  subnotas: { vigor: 7, nutricao_cor: 6, pragas_doencas: 8, estrutura: 7, vaso_substrato: 6 },
  sinais_vistos: [{ sinal: "folhas basais amarelas", onde: "base" }],
  hipoteses: [{ causa: "excesso de água", mecanismo: "raiz sem oxigênio", probabilidade: "média" }],
  perguntas_confirmacao: ["Qual a leitura de umidade no colo?"],
  acoes
});

describe("fotos e órgãos do Pl@ntNet", () => {
  it("mapeia os tipos de foto", () => {
    expect(orgaoDaFoto({ tipo: 1 })).toBe("habit");
    expect(orgaoDaFoto({ tipo: 2 })).toBe("leaf");
    expect(orgaoDaFoto({ tipo: 3 })).toBe("leaf");
    expect(orgaoDaFoto({ tipo: 5 })).toBe("flower");
    expect(orgaoDaFoto({ tipo: 5, fruto: true })).toBe("fruit");
    expect(orgaoDaFoto({ tipo: 6 })).toBeNull();
  });
});

describe("mesma espécie no inventário", () => {
  it("compara gênero + espécie, ignorando autor e variedade", () => {
    expect(chaveEspecie("Monstera deliciosa Liebm.")).toBe("monstera deliciosa");
    expect(chaveEspecie("Begonia maculata 'Wightii'")).toBe("begonia maculata");
    expect(plantasDaEspecie(carga.plantas, "Crassula ovata (Mill.) Druce").map((p) => p.id)).toEqual(["P08"]);
    expect(plantasDaEspecie(carga.plantas, "Caladium bicolor").length).toBe(4);
    expect(plantasDaEspecie(carga.plantas, "Philodendron")).toEqual([]); // só o gênero não basta
  });
});

describe("insumo em estoque", () => {
  const insumos = carga.insumos;
  it("reconhece os nomes do estoque", () => {
    expect(emEstoque("Pó de basalto", insumos)).toBe(true);
    expect(emEstoque("Forth Jardim 13-05-13", insumos)).toBe(true);
    expect(emEstoque("óleo de neem", insumos)).toBe(true);
    expect(emEstoque("detergente neutro", insumos)).toBe(true);
    expect(emEstoque("", insumos)).toBe(true);
  });
  it("aponta o que precisa comprar", () => {
    expect(emEstoque("Perlita", insumos)).toBe(false); // sem estoque
    expect(emEstoque("Fertilizante Osmocote", insumos)).toBe(false);
  });
});

describe("regras sobre a resposta da IA", () => {
  it("barra Forth Flores na Jade, marca compra e alerta quarentena", () => {
    const l = laudo([
      { acao: "Adubar para florir", quando: "esta semana", insumo: "Forth Flores 06-18-12" },
      { acao: "Melhorar drenagem", quando: "em outubro", insumo: "Perlita" },
      { acao: "Pulverizar à noite", quando: "hoje", insumo: "Óleo de neem" }
    ]);
    const r = conferirResposta(l, JSON.stringify(l) + " deixar em quarentena", carga.regras, carga.insumos, planta("P08"));
    expect(r.acoes[0].bloqueio).toMatch(/Forth Flores é proibido/);
    expect(r.acoes[1].bloqueio).toBeNull();
    expect(r.acoes[1].precisa_comprar).toBe(true);
    expect(r.acoes[2].precisa_comprar).toBe(false);
    expect(r.avisosGerais.map((d) => d.regra.id)).toContain("R16");
    expect(resumoLaudo(l, r.acoes)).not.toMatch(/Adubar para florir/);
  });
});

describe("instruções para o Gemini", () => {
  it("leva protocolos, estoque, proibições e pede só JSON", () => {
    const t = montarInstrucoes({
      modo: "checkup", planta: planta("P08"), grupos, insumosEstoque: ["Pó de basalto"],
      data: new Date("2026-10-04T12:00:00Z"), clima: "agora 28 °C.", tiposFotos: [1, 2]
    });
    expect(t).toMatch(/SOMENTE com um objeto JSON/);
    expect(t).toMatch(/outubro/);
    expect(t).toMatch(/PROIBIDO para esta planta: forth_flores/);
    expect(t).toMatch(/Insumos EM ESTOQUE: Pó de basalto/);
    expect(t).toMatch(/Sem quarentena/);
    expect(t).toMatch(/CHECK-UP/);
    expect(t).toMatch(/porte inteiro; folha madura/);
  });
});

describe("ficha da IA vira rascunho de planta", () => {
  it("preenche parâmetros sugeridos", () => {
    const f: FichaIA = {
      identificacao: { nome_popular: "Alocasia Polly", nome_cientifico: "Alocasia × amazonica", familia: "Araceae", variedade_provavel: "Polly" },
      origem_historia: "", habito: "", paisagismo: "", toxicidade: "Tóxica se ingerida (oxalato de cálcio).",
      parametros: { ph_min: 5.5, ph_max: 6.5, rega_gatilho_min: 2, rega_gatilho_max: 3, luz_1a9: 4, temperatura: "18–30 °C" },
      substrato_percentual: [{ insumo: "Terra vegetal", percentual: 50 }, { insumo: "Casca de pinus", percentual: 50 }],
      adubacao: [{ produto: "Forth Jardim 13-05-13", dose_g_l: 0.5, fase: "vegetativa" }],
      propagacao: "", pragas_comuns: [], grupo_sugerido: 2, laudo: laudo([])
    };
    const r = rascunhoDaFicha(f, null, grupos);
    expect(r.grupo).toBe(2);
    expect(r.params_origem).toBe("sugerido");
    expect(r.substrato).toBe("50% Terra vegetal, 50% Casca de pinus");
    expect(r.adubacao).toMatch(/0,5 g\/L/);
    expect(r.luz).toMatch(/Meia-sombra/);
    expect(r.tags).toEqual(["toxica"]);
    expect(rascunhoDaFicha({ ...f, grupo_sugerido: 9 }, null, grupos).grupo).toBeNull();
  });
});

describe("clima", () => {
  it("resume a resposta do Open-Meteo", () => {
    expect(resumirClima({
      current: { temperature_2m: 29.4, relative_humidity_2m: 31 },
      daily: { temperature_2m_max: [30, 33], temperature_2m_min: [17, 15], precipitation_sum: [0, 12.4] }
    })).toBe("agora 29 °C; umidade do ar 31%; próximos 7 dias: máximas até 33 °C, mínimas de 15 °C; chuva prevista 12 mm.");
  });
});
