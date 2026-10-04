// Motor de regras (CLAUDE.md, seção 8). Código determinístico, sem IA.
// Cada regra tem um "quando" com uma ou mais condições; a regra dispara se TODAS forem verdadeiras.
import type { Evento, Planta, Regra } from "./types";

export interface Contexto {
  /** Evento que está para ser salvo. */
  evento?: Partial<Evento>;
  /** Planta do evento (nula em evento geral). */
  planta?: Planta | null;
  /** Outros eventos da mesma planta, para regras que olham o histórico. */
  historico?: Evento[];
  /** Texto de uma recomendação (da IA), para regras que olham o conteúdo. */
  recomendacao?: string;
  /** Nome/descrição de um item da lista de desejos. */
  desejo?: string;
}

export interface Disparo {
  regra: Regra;
  tipo: "bloquear" | "alertar";
  mensagem: string;
}

type Condicao = (valor: unknown, ctx: Contexto) => boolean;

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "Forth Flores" casa com "Forth Flores 06-18-12" (um contém o outro). */
const mesmoProduto = (a: unknown, b: unknown) => {
  const x = norm(a), y = norm(b);
  return x !== "" && y !== "" && (x === y || x.includes(y) || y.includes(x));
};

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
const mesDe = (data?: string | null) => (data && /^\d{4}-\d{2}/.test(data) ? Number(data.slice(5, 7)) : null);
const diaDe = (data?: string | null) => (data ?? "").slice(0, 10);

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(diaDe(a)) - Date.parse(diaDe(b))) / 86_400_000;

/** Decapitação e transplante no mesmo dia, na mesma planta. */
function decapitacaoComTransplante(ctx: Contexto) {
  const e = ctx.evento;
  if (!e?.tipo || !e.data) return false;
  const par: Record<string, string> = { decapitacao: "transplante", transplante: "decapitacao" };
  const outro = par[e.tipo];
  if (!outro) return false;
  return (ctx.historico ?? []).some((h) => h.tipo === outro && diaDe(h.data) === diaDe(e.data));
}

export const CONDICOES: Record<string, Condicao> = {
  produto: (v, c) => mesmoProduto(c.evento?.produto, v),
  produto_em: (v, c) => lista(v).some((p) => mesmoProduto(c.evento?.produto, p)),
  insumo: (v, c) =>
    mesmoProduto(c.evento?.produto, v) || (c.evento?.insumos ?? []).some((i) => mesmoProduto(i, v)),
  evento: (v, c) => {
    if (v === "decapitacao_e_transplante_mesmo_dia") return decapitacaoComTransplante(c);
    if (v === "adubacao_liquida") return c.evento?.tipo === "adubacao" && c.evento?.aplicacao === "rega";
    return c.evento?.tipo === v;
  },
  evento_em: (v, c) => lista(v).includes(c.evento?.tipo),
  mes_em: (v, c) => lista(v).includes(mesDe(c.evento?.data)),
  mes_fora_de: (v, c) => {
    const m = mesDe(c.evento?.data);
    return m !== null && !lista(v).includes(m);
  },
  planta_tem_proibicao: (v, c) => !!c.planta && c.planta.proibicoes.includes(String(v)),
  planta_tem_tag: (v, c) => !!c.planta && c.planta.tags.includes(String(v)),
  planta_sem_tag: (v, c) => !!c.planta && !c.planta.tags.includes(String(v)),
  planta_tem_tag_em: (v, c) => !!c.planta && lista(v).some((t) => c.planta!.tags.includes(String(t))),
  aplicacao: (v, c) => c.evento?.aplicacao === v,
  agua: (v, c) => c.evento?.agua === v,
  percentual_area_foliar_maior_que: (v, c) =>
    typeof c.evento?.percentual_area_foliar === "number" && c.evento.percentual_area_foliar > Number(v),
  combinacao_mesma_planta_30_dias: (v, c) => {
    const [a, b] = lista(v);
    const e = c.evento;
    if (!e?.produto || !e.data) return false;
    const outro = mesmoProduto(e.produto, a) ? b : mesmoProduto(e.produto, b) ? a : null;
    if (outro === null) return false;
    return (c.historico ?? []).some((h) => h.id !== e.id && mesmoProduto(h.produto, outro) && diasEntre(h.data, e.data!) <= 30);
  },
  recomendacao_contem: (v, c) => !!c.recomendacao && norm(c.recomendacao).includes(norm(v)),
  lista_desejos_cor_impossivel: (v, c) => !!c.desejo && lista(v).some((x) => norm(c.desejo).includes(norm(x)))
};

/** Condições do JSON que este código ainda não sabe avaliar (aparecem em Configurações). */
export const condicoesDesconhecidas = (r: Regra) => Object.keys(r.quando).filter((k) => !(k in CONDICOES));

export function regraDispara(regra: Regra, ctx: Contexto): boolean {
  const chaves = Object.keys(regra.quando);
  if (chaves.length === 0 || condicoesDesconhecidas(regra).length > 0) return false;
  return chaves.every((k) => CONDICOES[k](regra.quando[k], ctx));
}

/** Avalia todas as regras ativas. Bloqueios vêm primeiro. */
export function avaliar(regras: Regra[], ctx: Contexto): Disparo[] {
  return regras
    .filter((r) => r.ativa && regraDispara(r, ctx))
    .map((r) => ({ regra: r, tipo: r.tipo, mensagem: r.mensagem }))
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "bloquear" ? -1 : 1));
}

export const temBloqueio = (d: Disparo[]) => d.some((x) => x.tipo === "bloquear");
