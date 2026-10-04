// Fase 4 — formação e evolução: projetos com fases e marcos, propagação com taxa de sucesso e mapa das zonas de luz.
// Cálculos puros (sem banco), para poder testar.
import type { Evento, Planta, Projeto, Zona } from "./types";
import { luzDaZona, necessidadeDeLuz, type NecessidadeLuz } from "./zonas";

// ---------- Projetos ----------

export interface Marco {
  data: string;
  texto: string;
}

/** Avança a fase de um projeto, guardando a passagem como marco. */
export function avancarFase(p: Projeto, novaFase: string, proximoMarco: string | null, hoje: string): Projeto {
  const marcos = [...(p.marcos ?? []), { data: hoje, texto: `Fase: ${p.fase_atual ?? "—"} → ${novaFase}` }];
  return { ...p, fase_atual: novaFase, proximo_marco: proximoMarco, marcos };
}

/** Registra um marco atingido (sem mudar a fase). */
export function registrarMarco(p: Projeto, texto: string, proximoMarco: string | null, hoje: string): Projeto {
  return { ...p, proximo_marco: proximoMarco, marcos: [...(p.marcos ?? []), { data: hoje, texto }] };
}

// ---------- Propagação ----------

export type Metodo = "estaca" | "semente" | "alporquia" | "divisao" | "outro";

export const ROTULO_METODO: Record<Metodo, string> = {
  estaca: "Estaquia", semente: "Semente", alporquia: "Alporquia", divisao: "Divisão/muda", outro: "Outro"
};

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Método de propagação a partir do texto de origem ("Estaca", "Semente", "Muda basal separada"…). */
export function metodoDe(origem: string | null | undefined): Metodo {
  const t = norm(origem);
  if (/estac|estaqu/.test(t)) return "estaca";
  if (/sement|semead/.test(t)) return "semente";
  if (/alporq/.test(t)) return "alporquia";
  if (/divis|muda basal|touceira/.test(t)) return "divisao";
  return "outro";
}

/** Lotes em propagação: status em_propagacao ou tag propagacao (ignora removidos). */
export const emPropagacao = (p: Planta) => p.status !== "removida" && (p.status === "em_propagacao" || p.tags.includes("propagacao"));

export interface Taxa {
  chave: string;
  tentadas: number;
  pegaram: number;
  taxa: number; // 0–1
}

/** Taxa de sucesso a partir dos resultados registrados (eventos "propagacao_resultado"). */
export function taxasDeSucesso(eventos: Evento[], agruparPor: (e: Evento) => string): Taxa[] {
  const m = new Map<string, { tentadas: number; pegaram: number }>();
  for (const e of eventos) {
    if (e.tipo !== "propagacao_resultado" || !e.tentadas) continue;
    const k = agruparPor(e);
    const a = m.get(k) ?? { tentadas: 0, pegaram: 0 };
    a.tentadas += e.tentadas;
    a.pegaram += Math.min(e.pegaram ?? 0, e.tentadas);
    m.set(k, a);
  }
  return [...m.entries()]
    .map(([chave, a]) => ({ chave, ...a, taxa: a.tentadas ? a.pegaram / a.tentadas : 0 }))
    .sort((x, y) => y.tentadas - x.tentadas || x.chave.localeCompare(y.chave, "pt-BR"));
}

export const porMetodo = (e: Evento) => metodoDe(e.produto);
/** Espécie: gênero + espécie do nome científico guardado no evento (observação começa com ele). */
export const porEspecie = (e: Evento) => e.especie || "—";

// ---------- Mapa das zonas de luz ----------

export interface SituacaoZona {
  zona: Zona | null; // null = plantas sem zona
  luz: NecessidadeLuz | null;
  plantas: { planta: Planta; precisa: NecessidadeLuz | null; conflito: boolean }[];
}

const normZona = (s: string) => norm(s).replace(/\s+/g, " ").trim();

/** Agrupa as plantas por zona e marca as que pedem luz diferente da que a zona tem. */
export function mapaDeZonas(zonas: Zona[], plantas: Planta[]): SituacaoZona[] {
  const ativas = plantas.filter((p) => p.status !== "removida");
  const out: SituacaoZona[] = zonas.map((z) => {
    const luz = luzDaZona(z);
    return {
      zona: z, luz,
      plantas: ativas.filter((p) => p.zona && normZona(p.zona) === normZona(z.nome)).map((p) => {
        const precisa = necessidadeDeLuz(p.luz);
        return { planta: p, precisa, conflito: !!precisa && !!luz && precisa !== luz };
      })
    };
  });
  const conhecidas = new Set(zonas.map((z) => normZona(z.nome)));
  const semZona = ativas.filter((p) => !p.zona || !conhecidas.has(normZona(p.zona)));
  out.push({ zona: null, luz: null, plantas: semZona.map((p) => ({ planta: p, precisa: necessidadeDeLuz(p.luz), conflito: false })) });
  return out;
}

// ---------- Linha do tempo de fotos ----------

/** Fotos da mais antiga para a mais nova; por padrão compara a primeira com a última do mesmo tipo. */
export function paraComparar<T extends { id: string; data: string; tipo: number }>(fotos: T[]): [T, T] | null {
  const ordem = [...fotos].sort((a, b) => a.data.localeCompare(b.data));
  if (ordem.length < 2) return null;
  const ultima = ordem[ordem.length - 1];
  const primeiraMesmoTipo = ordem.find((f) => f.tipo === ultima.tipo && f.id !== ultima.id);
  return [primeiraMesmoTipo ?? ordem[0], ultima];
}
