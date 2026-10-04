// Fase 3 — saúde e rotina: check-up distribuído no mês, lembretes das rotinas, alertas de clima e baixa de estoque.
// Tudo aqui é cálculo puro (sem banco), para poder testar.
import type { Evento, Insumo, Planta } from "./types";

const dia = (iso: string) => iso.slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(dia(b)) - Date.parse(dia(a))) / 86_400_000);
const diasNoMes = (hoje: string) => new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0)).getUTCDate();
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Último evento de um tipo, por planta (planta_id nulo = evento geral, chave ""). */
export function ultimosPorPlanta(eventos: Evento[], tipo: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of eventos) {
    if (e.tipo !== tipo || !/^\d{4}-\d{2}-\d{2}/.test(e.data)) continue;
    const k = e.planta_id ?? "";
    if (!m.has(k) || m.get(k)! < dia(e.data)) m.set(k, dia(e.data));
  }
  return m;
}

// ---------- Check-up distribuído no mês (~2 plantas por dia) ----------

export const ativaParaRotina = (p: Planta) => p.status !== "removida";

/** Dia do mês (1…N) em que cada planta faz o check-up. Ordem estável pela ficha, espalhando as plantas pelo mês. */
export function diaDoCheckup(plantas: Planta[], hoje: string): Map<string, number> {
  const n = diasNoMes(hoje);
  const ordem = plantas.filter(ativaParaRotina)
    .sort((a, b) => (a.ficha ?? 9999) - (b.ficha ?? 9999) || a.id.localeCompare(b.id, "pt-BR", { numeric: true }));
  return new Map(ordem.map((p, i) => [p.id, (i % n) + 1]));
}

/**
 * Check-ups de hoje e os atrasados do mês (dia já passou e a planta não teve check-up desde então).
 * Uma planta com check-up nos últimos 15 dias não entra.
 */
export function checkupsDoDia(plantas: Planta[], eventos: Evento[], hoje: string): { hoje: Planta[]; atrasados: Planta[] } {
  const dias = diaDoCheckup(plantas, hoje);
  const ultimos = ultimosPorPlanta(eventos, "checkup");
  const diaHoje = Number(hoje.slice(8, 10));
  const recente = (id: string) => {
    const u = ultimos.get(id);
    return !!u && diasEntre(u, hoje) < 15;
  };
  const out = { hoje: [] as Planta[], atrasados: [] as Planta[] };
  for (const p of plantas.filter(ativaParaRotina)) {
    const d = dias.get(p.id)!;
    if (recente(p.id)) continue;
    if (d === diaHoje) out.hoje.push(p);
    else if (d < diaHoje) out.atrasados.push(p);
  }
  return out;
}

// ---------- Lembretes das rotinas ----------

export interface Lembrete {
  chave: string;
  titulo: string;
  texto: string;
  /** Plantas envolvidas (para os links). Vazio = evento geral. */
  plantas: Planta[];
  tipoEvento: string;
}

/**
 * Rotinas do protocolo: lixiviação mensal (todas), acidificação periódica (tag acidofila)
 * e retomada da adubação em outubro (todas, exceto sem_adubacao).
 */
export function lembretesDeRotina(plantas: Planta[], eventos: Evento[], hoje: string, intervaloAcidificacao: number): Lembrete[] {
  const ativas = plantas.filter((p) => p.status !== "removida");
  const out: Lembrete[] = [];

  // Lixiviação mensal: vale o evento geral mais recente
  const lix = ultimosPorPlanta(eventos, "lixiviacao").get("");
  if (!lix || diasEntre(lix, hoje) >= 30) {
    out.push({
      chave: "lixiviacao", titulo: "Lixiviação mensal", tipoEvento: "lixiviacao", plantas: [],
      texto: lix ? `A última foi em ${br(lix)} (há ${diasEntre(lix, hoje)} dias).` : "Ainda não há registro de lixiviação geral."
    });
  }

  // Acidificação das acidófilas
  const acid = ultimosPorPlanta(eventos, "acidificacao");
  const devendo = ativas.filter((p) => p.tags.includes("acidofila")).filter((p) => {
    const u = acid.get(p.id);
    return !u || diasEntre(u, hoje) >= intervaloAcidificacao;
  });
  if (devendo.length) {
    out.push({
      chave: "acidificacao", titulo: "Acidificação das acidófilas", tipoEvento: "acidificacao", plantas: devendo,
      texto: `Água de rega com vinagre (só na rega, nunca na folha). A cada ${intervaloAcidificacao} dias.`
    });
  }

  // Retomada da adubação em outubro
  if (hoje.slice(5, 7) === "10") {
    const inicioMes = `${hoje.slice(0, 7)}-01`;
    const adubadas = new Set(eventos.filter((e) => e.tipo === "adubacao" && e.planta_id && dia(e.data) >= inicioMes).map((e) => e.planta_id!));
    const faltam = ativas.filter((p) =>
      !adubadas.has(p.id) && !p.tags.includes("sem_adubacao") && !p.proibicoes.includes("adubacao") && p.status !== "a_plantar" && p.status !== "a_semear");
    if (faltam.length) {
      out.push({
        chave: "retomada", titulo: "Retomada da adubação (outubro)", tipoEvento: "adubacao", plantas: faltam,
        texto: `${faltam.length} plantas ainda sem adubação neste mês.`
      });
    }
  }
  return out;
}

// ---------- Alertas de clima (Open-Meteo) ----------

export interface Previsao {
  datas: string[];
  tmax: number[];
  umidadeMin: number[];
  chuva: number[];
  /** Quantos dos primeiros dias são passados (para ver se vinha de seca). */
  diasPassados: number;
}

export interface AlertaClima {
  tipo: "calor" | "ar_seco" | "chuvas";
  texto: string;
}

export const LIMITE_CALOR = 32;
export const LIMITE_AR_SECO = 30;

export function alertasDeClima(p: Previsao, hoje: string): AlertaClima[] {
  const out: AlertaClima[] = [];
  const futuro = p.datas.map((d, i) => ({ d, i })).filter(({ d }) => d >= hoje);
  const quente = futuro.filter(({ i }) => p.tmax[i] >= LIMITE_CALOR);
  if (quente.length) {
    const pico = quente.reduce((a, b) => (p.tmax[b.i] > p.tmax[a.i] ? b : a));
    out.push({
      tipo: "calor",
      texto: `Calor: máxima de ${Math.round(p.tmax[pico.i])} °C em ${br(pico.d)}. Meça a umidade com mais frequência, principalmente vasos pequenos e plantas ao sol da tarde.`
    });
  }
  const seco = futuro.filter(({ i }) => p.umidadeMin[i] <= LIMITE_AR_SECO);
  if (seco.length) {
    const pior = seco.reduce((a, b) => (p.umidadeMin[b.i] < p.umidadeMin[a.i] ? b : a));
    out.push({
      tipo: "ar_seco",
      texto: `Ar seco: umidade do ar chega a ${Math.round(p.umidadeMin[pior.i])}% em ${br(pior.d)}. Tropicais e samambaias sofrem mais; a terra seca mais rápido.`
    });
  }
  // Início das chuvas: vinha seco (menos de 5 mm nos dias passados) e há dia com 10 mm ou mais pela frente
  const passado = p.chuva.slice(0, p.diasPassados).reduce((a, b) => a + b, 0);
  const primeira = futuro.find(({ i }) => p.chuva[i] >= 10);
  if (p.diasPassados > 0 && passado < 5 && primeira) {
    out.push({
      tipo: "chuvas",
      texto: `Início das chuvas: ${Math.round(p.chuva[primeira.i])} mm previstos em ${br(primeira.d)}. É a época das grandes intervenções; confira as regas das plantas que ficam ao tempo.`
    });
  }
  return out;
}

// ---------- Baixa automática de estoque ----------

/**
 * Quanto sai do estoque num evento com dose: massa (g) = dose (g/L) × volume (L).
 * Só baixa quando o insumo tem quantidade controlada em g ou kg. Devolve null se não houver baixa.
 */
export function calcularBaixa(insumo: Insumo, evento: Pick<Evento, "dose_g_l" | "volume_ml">): { quantidade: number; gasto: number } | null {
  if (insumo.quantidade === null || insumo.quantidade === undefined) return null;
  if (!evento.dose_g_l || !evento.volume_ml) return null;
  const unidade = (insumo.unidade ?? "").toLowerCase().trim();
  const fator = unidade === "g" ? 1 : unidade === "kg" ? 1000 : null;
  if (fator === null) return null;
  const gasto = (evento.dose_g_l * evento.volume_ml) / 1000 / fator;
  const quantidade = Math.max(0, Math.round((insumo.quantidade - gasto) * 1000) / 1000);
  return { quantidade, gasto: Math.round(gasto * 1000) / 1000 };
}
