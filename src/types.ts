// Tabelas do app (CLAUDE.md, seção 4). Os nomes dos campos são os mesmos do JSON da carga inicial.

export type StatusPlanta =
  | "ativa"
  | "em_propagacao"
  | "a_plantar"
  | "a_semear"
  | "pendente_confirmacao"
  | "dormencia_induzida"
  | "removida";

/** Hora da última alteração (usada na sincronização com a planilha). */
export interface Carimbo {
  atualizado_em?: string;
}

export type ParamsOrigem = "inventario" | "sugerido" | "confirmado";

export interface Planta extends Carimbo {
  id: string;
  ficha: number | null;
  nome_popular: string;
  nome_cientifico: string | null;
  grupo: number | null;
  quantidade: number | null;
  status: StatusPlanta;
  data_entrada: string | null;
  origem: string | null;
  zona: string | null;
  ph_min: number | null;
  ph_max: number | null;
  rega_gatilho_min: number | null;
  rega_gatilho_max: number | null;
  luz: string | null;
  vaso: string | null;
  substrato: string | null;
  adubacao: string | null;
  objetivo: string | null;
  tags: string[];
  proibicoes: string[];
  historico: string;
  params_origem: ParamsOrigem;
  alertas: string[];
  qr_code: string;
  excluida_em: string | null;
}

export interface Foto extends Carimbo {
  id: string;
  planta_id: string;
  data: string;
  tipo: number;
  arquivo_drive_id: string | null;
  nota_saude: number | null;
}

export interface Medicao extends Carimbo {
  id: string;
  planta_id: string;
  data_hora: string;
  umidade: number | null;
  ph: number | null;
  luz: number | null;
  temperatura: number | null;
  local_sonda: "colo" | "borda" | null;
}

export interface Evento extends Carimbo {
  id: string;
  planta_id: string | null;
  data: string;
  tipo: string;
  produto: string | null;
  dose_g_l: number | null;
  volume_ml: number | null;
  observacao: string | null;
  /** Como foi aplicado: junto com a rega, na folha ou no substrato. */
  aplicacao?: "rega" | "foliar" | "substrato" | null;
  /** Água usada (protocolo: só torneira). */
  agua?: "torneira" | "chuva" | null;
  /** Insumos do substrato num transplante/renovação. */
  insumos?: string[];
  /** Poda: percentual da área foliar removida. */
  percentual_area_foliar?: number | null;
}

export const TIPOS_EVENTO: Record<string, string> = {
  rega: "Rega",
  adubacao: "Adubação",
  medicao: "Medição",
  foto: "Foto",
  poda: "Poda",
  poda_estrutural: "Poda estrutural",
  desponte: "Desponte",
  decapitacao: "Decapitação",
  transplante: "Transplante",
  renovacao_substrato: "Renovação do substrato",
  lixiviacao: "Lixiviação",
  acidificacao: "Acidificação (vinagre)",
  tratamento: "Tratamento (praga/doença)",
  propagacao: "Propagação",
  plantio: "Plantio",
  colheita: "Colheita",
  tutoramento: "Tutoramento",
  reposicionamento: "Mudança de lugar",
  chegada: "Chegada",
  observacao: "Observação",
  checkup: "Check-up (IA)",
  decisao: "Decisão",
  revisao: "Revisão"
};

export interface Pendencia extends Carimbo {
  id: string;
  planta_id: string | null;
  data_prevista: string;
  acao: string;
  concluida_em: string | null;
}

export interface Projeto extends Carimbo {
  id: string;
  nome: string;
  plantas: string[];
  fase_atual: string | null;
  proximo_marco: string | null;
}

export interface Insumo extends Carimbo {
  nome: string;
  categoria: string;
  em_estoque: boolean;
  quantidade: number | null;
  unidade: string | null;
  observacao: string | null;
}

export interface Desejo extends Carimbo {
  id: string;
  nome: string;
  especie: string | null;
  prioridade: string | null;
  zona_compativel: string | null;
  epoca_compra: string | null;
  preco_alvo: number | null;
  observacao: string | null;
}

export interface Zona extends Carimbo {
  id: string;
  nome: string;
  sol_direto: string | null;
}

export interface Regra extends Carimbo {
  id: string;
  tipo: "bloquear" | "alertar";
  quando: Record<string, unknown>;
  mensagem: string;
  ativa: boolean;
}

export interface Rotina extends Carimbo {
  id: string;
  nome: string;
  frequencia: string;
  alvo: string;
  mes?: number;
  meses?: number[];
}

export interface Grupo {
  numero: number;
  nome: string;
}

/** Valores avulsos (próxima ficha, local, escalas...). */
export interface Meta extends Carimbo {
  chave: string;
  valor: unknown;
}

export const STATUS_ROTULO: Record<StatusPlanta, string> = {
  ativa: "Ativa",
  em_propagacao: "Em propagação",
  a_plantar: "A plantar",
  a_semear: "A semear",
  pendente_confirmacao: "Pendente de confirmação",
  dormencia_induzida: "Dormência induzida",
  removida: "Removida"
};
