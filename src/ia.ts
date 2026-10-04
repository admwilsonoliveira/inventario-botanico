// Escaneamento e IA (CLAUDE.md, seções 7, 8 e 10). As chamadas passam pelo Apps Script (chaves ficam lá).
import type { BancoInventario } from "./db";
import { avaliar, type Disparo } from "./regras";
import { blobParaBase64, chamar, lerConfigNuvem } from "./sync";
import type { Evento, Grupo, Insumo, Medicao, Planta, Regra } from "./types";

// ---------- Tipos ----------

export interface Candidato {
  score: number;
  nome_cientifico: string;
  nome_cientifico_autor?: string;
  genero?: string;
  familia?: string;
  nomes_populares: string[];
}

export interface Acao {
  acao: string;
  quando: string;
  insumo: string;
}

export interface Laudo {
  nota: number;
  subnotas: { vigor: number; nutricao_cor: number; pragas_doencas: number; estrutura: number; vaso_substrato: number };
  sinais_vistos: { sinal: string; onde: string }[];
  hipoteses: { causa: string; mecanismo: string; probabilidade: string }[];
  perguntas_confirmacao: string[];
  acoes: Acao[];
}

export interface FichaIA {
  identificacao: { nome_popular: string; nome_cientifico: string; familia: string; variedade_provavel: string };
  origem_historia: string;
  habito: string;
  paisagismo: string;
  toxicidade: string;
  parametros: { ph_min: number; ph_max: number; rega_gatilho_min: number; rega_gatilho_max: number; luz_1a9: number; temperatura: string };
  substrato_percentual: { insumo: string; percentual: number }[];
  adubacao: { produto: string; dose_g_l: number; fase: string }[];
  propagacao: string;
  pragas_comuns: string[];
  grupo_sugerido: number;
  laudo: Laudo;
}

/** Foto capturada no escaneamento. */
export interface FotoEscaneada {
  tipo: number; // 1 a 7 (seção 7)
  original: Blob; // vai para o Drive
  reduzida: Blob; // 1568 px, JPEG ~80%, vai para a análise
  nitidez: number;
  fruto?: boolean; // tipo 5: fruto em vez de flor
}

// ---------- Fotos → órgãos do Pl@ntNet ----------

/** 1 → habit, 2 e 3 → leaf, 5 → flower ou fruit. Os demais tipos não vão para a identificação. */
export function orgaoDaFoto(f: Pick<FotoEscaneada, "tipo" | "fruto">): string | null {
  if (f.tipo === 1) return "habit";
  if (f.tipo === 2 || f.tipo === 3) return "leaf";
  if (f.tipo === 5) return f.fruto ? "fruit" : "flower";
  return null;
}

export const TIPOS_OBRIGATORIOS = [1, 2];
export const CONFIANCA_MINIMA = 0.8;

// ---------- Esquemas de resposta (JSON) ----------

const S = { type: "string" } as const;
const N = { type: "number" } as const;
const obj = (props: Record<string, unknown>) => ({ type: "object", properties: props, required: Object.keys(props) });
const arr = (items: unknown) => ({ type: "array", items });

export const ESQUEMA_LAUDO = obj({
  nota: N,
  subnotas: obj({ vigor: N, nutricao_cor: N, pragas_doencas: N, estrutura: N, vaso_substrato: N }),
  sinais_vistos: arr(obj({ sinal: S, onde: S })),
  hipoteses: arr(obj({ causa: S, mecanismo: S, probabilidade: S })),
  perguntas_confirmacao: arr(S),
  acoes: arr(obj({ acao: S, quando: S, insumo: S }))
});

export const ESQUEMA_FICHA = obj({
  identificacao: obj({ nome_popular: S, nome_cientifico: S, familia: S, variedade_provavel: S }),
  origem_historia: S,
  habito: S,
  paisagismo: S,
  toxicidade: S,
  parametros: obj({ ph_min: N, ph_max: N, rega_gatilho_min: N, rega_gatilho_max: N, luz_1a9: N, temperatura: S }),
  substrato_percentual: arr(obj({ insumo: S, percentual: N })),
  adubacao: arr(obj({ produto: S, dose_g_l: N, fase: S })),
  propagacao: S,
  pragas_comuns: arr(S),
  grupo_sugerido: N,
  laudo: ESQUEMA_LAUDO
});

// ---------- Contexto e instruções ----------

const PROTOCOLOS = [
  "Só água de torneira. Anticloro não é rotina.",
  "Gatilho de rega pelo medidor no colo (escala 1 = muito seco … 5 = muito molhado): nível 2 na maioria; 3 para hortênsia e cebolinha; 1–2 para deserto/suculentas.",
  "Pausa de adubação de junho a setembro; retomada em outubro (exceções têm a tag excecao_pausa).",
  "Adubo líquido vai junto com a rega: concentração fixa, volume proporcional ao vaso.",
  "Grandes intervenções (transplante, poda estrutural, renovação de substrato) em outubro.",
  "Sem quarentena: inspeção → transplante com escarificação do torrão → integração.",
  "Remédios permitidos: óleo de neem, sabão de potássio/detergente neutro (aplicar à noite), canela em pó.",
  "Recomende só insumos da lista EM ESTOQUE. Se precisar de outro, escreva no campo insumo o nome dele seguido de \"(precisa comprar)\"."
];

export interface ContextoIA {
  modo: "ficha" | "checkup";
  candidato?: Candidato | null;
  planta?: Planta | null;
  grupos: Grupo[];
  insumosEstoque: string[];
  data: Date;
  clima?: string | null;
  medicao?: Medicao | null;
  eventos?: Evento[];
  tiposFotos: number[];
}

const NOMES_FOTOS: Record<number, string> = {
  1: "porte inteiro", 2: "folha madura", 3: "verso da folha", 4: "colo e substrato",
  5: "flor ou fruto", 6: "sintoma", 7: "visor do medidor 4-em-1"
};

/** Texto enviado ao Gemini: só o contexto necessário (seção 10). */
export function montarInstrucoes(c: ContextoIA): string {
  const mes = c.data.toLocaleDateString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
  const l: string[] = [];
  l.push("Você é um agrônomo que ajuda o Wilson a cuidar das plantas dele em vasos, em Patrocínio – MG (cerrado de altitude: seca e calor de abril a setembro; chuvas de outubro a março).");
  l.push("Responda SOMENTE com um objeto JSON válido, em português do Brasil, seguindo exatamente o esquema pedido. Sem texto fora do JSON.");
  l.push(`\nMês atual: ${mes}.`);
  if (c.clima) l.push(`Clima em Patrocínio: ${c.clima}`);
  l.push(`\nFotos enviadas, na ordem: ${c.tiposFotos.map((t) => NOMES_FOTOS[t] ?? `tipo ${t}`).join("; ")}.`);
  if (c.candidato) {
    l.push(`Identificação pelo Pl@ntNet: ${c.candidato.nome_cientifico} (${c.candidato.familia ?? ""}), confiança ${Math.round(c.candidato.score * 100)}%` +
      (c.candidato.nomes_populares.length ? `, nomes populares: ${c.candidato.nomes_populares.slice(0, 4).join(", ")}` : "") + ".");
  }
  if (c.planta) {
    const p = c.planta;
    l.push(`\nPlanta do inventário: ficha nº ${p.ficha ?? "pendente"}, ${p.nome_popular} (${p.nome_cientifico ?? "?"}), grupo ${p.grupo ?? "?"}.`);
    l.push(`Parâmetros atuais: pH ${p.ph_min ?? "?"}–${p.ph_max ?? "?"}; regar no nível ${p.rega_gatilho_min ?? "?"}–${p.rega_gatilho_max ?? "?"}; luz: ${p.luz ?? "?"}; vaso: ${p.vaso ?? "?"}; substrato: ${p.substrato ?? "?"}; adubação: ${p.adubacao ?? "?"}.`);
    if (p.tags.length) l.push(`Tags: ${p.tags.join(", ")}.`);
    if (p.proibicoes.length) l.push(`PROIBIDO para esta planta: ${p.proibicoes.join(", ")}.`);
    if (p.historico) l.push(`Histórico: ${p.historico}`);
  }
  if (c.medicao) {
    const m = c.medicao;
    l.push(`Última leitura do medidor (${m.data_hora.slice(0, 10)}, sonda no ${m.local_sonda ?? "colo"}): umidade ${m.umidade ?? "?"}, pH ${m.ph ?? "?"}, luz ${m.luz ?? "?"}, ${m.temperatura ?? "?"} °C.`);
  }
  if (c.eventos?.length) {
    l.push("Últimos registros: " + c.eventos.slice(0, 8).map((e) => `${e.data} ${e.tipo}${e.produto ? ` (${e.produto})` : ""}${e.observacao ? `: ${e.observacao}` : ""}`).join(" | "));
  }
  l.push(`\nGrupos do inventário: ${c.grupos.map((g) => `${g.numero} = ${g.nome}`).join("; ")}.`);
  l.push(`Insumos EM ESTOQUE: ${c.insumosEstoque.join("; ")}.`);
  l.push("\nProtocolos fixos do Wilson (obrigatórios):");
  PROTOCOLOS.forEach((p) => l.push(`- ${p}`));
  l.push("\nRegras do laudo:");
  l.push("- Notas de 0 a 10.");
  l.push("- Em sinais_vistos, só o que aparece de fato nas fotos, dizendo onde. Em hipoteses, as suspeitas, com o mecanismo e a probabilidade (alta, média ou baixa). Não misture os dois.");
  l.push("- Foto não mostra raiz, pH nem umidade interna: quando isso importar, peça a leitura do medidor em perguntas_confirmacao.");
  l.push("- Em acoes, diga quando fazer (ex.: hoje, esta semana, em outubro) e o insumo (vazio se não usar).");
  if (c.modo === "ficha") {
    l.push("\nTarefa: gere a FICHA DA ESPÉCIE e o LAUDO DE SAÚDE desta planta.");
    l.push("- parametros: pH ideal; gatilho de rega na escala 1–5 do medidor no colo; luz_1a9 na escala do medidor (1 = escuro … 9 = sol pleno); temperatura como texto.");
    l.push("- substrato_percentual: mistura com os insumos de estrutura em estoque, somando 100.");
    l.push("- adubacao: produtos em estoque com dose em g/L e a fase (vegetativa, floração…).");
    l.push("- grupo_sugerido: o número de um dos grupos do inventário.");
  } else {
    l.push("\nTarefa: faça só o CHECK-UP (laudo de saúde) desta planta do inventário, considerando os parâmetros, o histórico e as proibições dela.");
  }
  return l.join("\n");
}

// ---------- Clima (Open-Meteo, sem chave) ----------

export async function climaPatrocinio(): Promise<string | null> {
  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=-18.94&longitude=-46.99" +
      "&current=temperature_2m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum" +
      "&timezone=America%2FSao_Paulo&forecast_days=7";
    const r = await fetch(url);
    if (!r.ok) return null;
    return resumirClima(await r.json());
  } catch {
    return null;
  }
}

interface RespostaClima {
  current?: { temperature_2m?: number; relative_humidity_2m?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] };
}

export function resumirClima(j: RespostaClima): string | null {
  const c = j.current, d = j.daily;
  if (!c && !d) return null;
  const partes: string[] = [];
  if (c?.temperature_2m !== undefined) partes.push(`agora ${Math.round(c.temperature_2m)} °C`);
  if (c?.relative_humidity_2m !== undefined) partes.push(`umidade do ar ${Math.round(c.relative_humidity_2m)}%`);
  if (d?.temperature_2m_max?.length) {
    partes.push(`próximos 7 dias: máximas até ${Math.round(Math.max(...d.temperature_2m_max))} °C, mínimas de ${Math.round(Math.min(...(d.temperature_2m_min ?? [0])))} °C`);
  }
  if (d?.precipitation_sum?.length) {
    const chuva = d.precipitation_sum.reduce((a, b) => a + (b ?? 0), 0);
    partes.push(chuva > 0 ? `chuva prevista ${Math.round(chuva)} mm` : "sem chuva prevista");
  }
  return partes.join("; ") + ".";
}

// ---------- Inventário ----------

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "Monstera deliciosa Liebm." → "monstera deliciosa" (gênero + espécie). */
export function chaveEspecie(nome: string | null | undefined): string {
  const palavras = norm(nome).replace(/[()'"]/g, " ").split(/\s+/).filter((p) => p && p !== "x" && p !== "×");
  return palavras.slice(0, 2).join(" ");
}

/** Plantas do inventário da mesma espécie (ignora removidas). */
export function plantasDaEspecie(plantas: Planta[], nomeCientifico: string): Planta[] {
  const alvo = chaveEspecie(nomeCientifico);
  if (!alvo.includes(" ")) return [];
  return plantas.filter((p) => p.status !== "removida" && chaveEspecie(p.nome_cientifico) === alvo);
}

// ---------- Regras sobre a resposta da IA (seção 8, item b) ----------

export interface AcaoConferida extends Acao {
  bloqueio: string | null; // motivo, quando o motor de regras barra a ação
  alertas: string[];
  precisa_comprar: boolean;
}

/** Palavras que identificam um insumo ("Pó de basalto" → basalto; "Forth Jardim 13-05-13" → forth, jardim). */
const palavrasChave = (s: string) =>
  norm(s).replace(/\(.*?\)/g, " ").split(/[^a-z]+/).filter((p) => p.length > 2 && p !== "com" && p !== "para").slice(0, 2);

/** O insumo citado pela IA está em estoque? Casa pelas palavras principais ("Sabão de potássio / detergente neutro" vale pelos dois nomes). */
export function emEstoque(insumo: string, insumos: Insumo[]): boolean {
  const citado = new Set(palavrasChave(insumo.replace(/precisa comprar/i, "")).concat(norm(insumo).split(/[^a-z]+/)));
  if (!palavrasChave(insumo.replace(/precisa comprar/i, "")).length) return true;
  return insumos.some((i) => i.em_estoque && i.nome.split("/").some((alt) => {
    const chave = palavrasChave(alt);
    return chave.length > 0 && chave.every((p) => citado.has(p));
  }));
}

/** Passa cada ação e o texto todo da resposta pelo motor de regras. */
export function conferirResposta(
  laudo: Laudo,
  textoCompleto: string,
  regras: Regra[],
  insumos: Insumo[],
  planta: Planta | null
): { acoes: AcaoConferida[]; avisosGerais: Disparo[] } {
  const acoes = laudo.acoes.map((a) => {
    const d = avaliar(regras, {
      planta,
      evento: { produto: a.insumo || null, tipo: undefined },
      recomendacao: `${a.acao} ${a.insumo}`
    });
    const bloqueio = d.find((x) => x.tipo === "bloquear");
    return {
      ...a,
      bloqueio: bloqueio ? bloqueio.mensagem : null,
      alertas: d.filter((x) => x.tipo === "alertar").map((x) => x.mensagem),
      precisa_comprar: !!a.insumo && (/precisa comprar/i.test(a.insumo) || !emEstoque(a.insumo, insumos))
    };
  });
  const avisosGerais = avaliar(regras, { recomendacao: textoCompleto });
  return { acoes, avisosGerais };
}

// ---------- Ficha da IA → rascunho de planta ----------

export function rascunhoDaFicha(f: FichaIA, candidato: Candidato | null, grupos: Grupo[]): Partial<Planta> {
  const p = f.parametros;
  const grupoValido = grupos.some((g) => g.numero === f.grupo_sugerido) ? f.grupo_sugerido : null;
  const luz = p.luz_1a9 >= 7 ? "Sol pleno" : p.luz_1a9 >= 4 ? "Meia-sombra" : "Luz filtrada";
  return {
    nome_popular: f.identificacao.nome_popular || candidato?.nomes_populares[0] || candidato?.nome_cientifico || "",
    nome_cientifico: f.identificacao.nome_cientifico || candidato?.nome_cientifico || null,
    grupo: grupoValido,
    ph_min: p.ph_min || null,
    ph_max: p.ph_max || null,
    rega_gatilho_min: p.rega_gatilho_min || null,
    rega_gatilho_max: p.rega_gatilho_max || null,
    luz: `${luz} (luz ${p.luz_1a9}/9)${p.temperatura ? `; ${p.temperatura}` : ""}`,
    substrato: f.substrato_percentual.length ? f.substrato_percentual.map((s) => `${s.percentual}% ${s.insumo}`).join(", ") : null,
    adubacao: f.adubacao.length ? f.adubacao.map((a) => `${a.produto} ${String(a.dose_g_l).replace(".", ",")} g/L (${a.fase})`).join("; ") : null,
    tags: /toxic|venen|irritan/.test(norm(f.toxicidade)) && !/nao (e )?toxic|atoxic/.test(norm(f.toxicidade)) ? ["toxica"] : [],
    proibicoes: [],
    historico: "",
    params_origem: "sugerido",
    alertas: [],
    status: "ativa"
  };
}

/** Resumo do laudo para o histórico da planta. */
export function resumoLaudo(l: Laudo, acoes: AcaoConferida[]): string {
  const partes = [`Check-up (IA): nota ${l.nota}/10.`];
  if (l.sinais_vistos.length) partes.push(`Visto: ${l.sinais_vistos.map((s) => `${s.sinal} (${s.onde})`).join("; ")}.`);
  if (l.hipoteses.length) partes.push(`Suspeitas: ${l.hipoteses.map((h) => `${h.causa} [${h.probabilidade}]`).join("; ")}.`);
  const validas = acoes.filter((a) => !a.bloqueio);
  if (validas.length) partes.push(`Ações: ${validas.map((a) => `${a.acao} (${a.quando})`).join("; ")}.`);
  return partes.join(" ");
}

// ---------- Chamadas ao Apps Script ----------

async function nuvem(banco: BancoInventario) {
  const cfg = await lerConfigNuvem(banco);
  if (!cfg) throw new Error("Ligue a nuvem em Configurações para usar o escaneamento.");
  if (!navigator.onLine) throw new Error("Sem internet. O escaneamento precisa de conexão.");
  return cfg;
}

export async function identificarFotos(banco: BancoInventario, fotos: FotoEscaneada[]): Promise<Candidato[]> {
  const cfg = await nuvem(banco);
  const usar = fotos.filter((f) => orgaoDaFoto(f)).slice(0, 5);
  if (!usar.length) throw new Error("Para identificar, tire pelo menos a foto do porte inteiro ou da folha.");
  const imagens = await Promise.all(usar.map(async (f) => ({ base64: await blobParaBase64(f.reduzida), mime: "image/jpeg", orgao: orgaoDaFoto(f) })));
  const r = await chamar(cfg, { acao: "identificar", imagens }, 120_000);
  return r.candidatos as Candidato[];
}

export async function analisarFotos<T>(banco: BancoInventario, instrucoes: string, fotos: FotoEscaneada[], esquema: object): Promise<T> {
  const cfg = await nuvem(banco);
  const imagens = await Promise.all(fotos.slice(0, 6).map(async (f) => ({ base64: await blobParaBase64(f.reduzida), mime: "image/jpeg" })));
  const r = await chamar(cfg, { acao: "analisar", instrucoes, imagens, esquema }, 330_000); // com as tentativas de reserva pode demorar
  return r.resultado as T;
}

export interface UsoIA {
  plantnet: { usado: number; limite: number; teto: number };
  gemini: { usado: number; limite: number; teto: number; tokens: number };
  modelo: string;
}

export async function lerUsoIA(banco: BancoInventario): Promise<UsoIA> {
  const cfg = await nuvem(banco);
  const r = await chamar(cfg, { acao: "uso_ia" }, 30_000);
  return r.uso as UsoIA;
}
