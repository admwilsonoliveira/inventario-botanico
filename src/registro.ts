// Registro rápido (reguei, adubei, medi, fotografei), medição e pendências.
import { anotarExclusao, type BancoInventario } from "./db";
import { avaliar, type Disparo } from "./regras";
import type { Evento, Medicao, Pendencia, Planta } from "./types";

export const hojeISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// ---------- Medição ----------

export interface Veredito {
  acao: "regar" | "aguardar" | "sem_gatilho";
  texto: string;
}

/**
 * Gatilho de rega pelo medidor no colo (1 = muito seco … 5 = muito molhado).
 * Regar quando a leitura chega ao nível do gatilho ou abaixo dele.
 */
export function vereditoRega(planta: Pick<Planta, "rega_gatilho_min" | "rega_gatilho_max">, umidade: number): Veredito {
  const limite = planta.rega_gatilho_max ?? planta.rega_gatilho_min;
  if (limite === null) return { acao: "sem_gatilho", texto: "Esta planta ainda não tem gatilho de rega. Preencha na ficha." };
  if (umidade <= limite) {
    return { acao: "regar", texto: `O medidor marcou ${umidade}. Esta planta pede água no nível ${limite} ou abaixo.` };
  }
  return { acao: "aguardar", texto: `O medidor marcou ${umidade}. Espere chegar ao nível ${limite} para regar.` };
}

export function avaliarPh(planta: Pick<Planta, "ph_min" | "ph_max">, ph: number): string | null {
  const f = (n: number) => String(n).replace(".", ",");
  if (planta.ph_min !== null && ph < planta.ph_min) return `pH ${f(ph)} abaixo da faixa (${f(planta.ph_min)}–${f(planta.ph_max ?? planta.ph_min)}).`;
  if (planta.ph_max !== null && ph > planta.ph_max) return `pH ${f(ph)} acima da faixa (${f(planta.ph_min ?? planta.ph_max)}–${f(planta.ph_max)}).`;
  return null;
}

export async function salvarMedicao(banco: BancoInventario, m: Omit<Medicao, "id">) {
  const id = crypto.randomUUID();
  await banco.medicoes.add({ ...m, id });
  return id;
}

// ---------- Eventos ----------

/** Roda o motor de regras sobre um evento antes de salvar. */
export async function conferirEvento(banco: BancoInventario, evento: Partial<Evento>): Promise<Disparo[]> {
  const regras = await banco.regras.toArray();
  const planta = evento.planta_id ? (await banco.plantas.get(evento.planta_id)) ?? null : null;
  const historico = evento.planta_id ? await banco.eventos.where("planta_id").equals(evento.planta_id).toArray() : [];
  return avaliar(regras, { evento, planta, historico });
}

export async function salvarEvento(banco: BancoInventario, evento: Omit<Evento, "id">) {
  const id = crypto.randomUUID();
  await banco.eventos.add({ ...evento, id });
  return id;
}

export async function apagarEvento(banco: BancoInventario, id: string) {
  await banco.transaction("rw", banco.eventos, banco.apagados, async () => {
    await banco.eventos.delete(id);
    await anotarExclusao(banco, "eventos", id);
  });
}

// ---------- Fotos ----------

/** Reduz a imagem para o lado maior caber em `lado` px (JPEG). */
export async function reduzirImagem(arquivo: Blob, lado: number, qualidade = 0.8): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Falha ao reduzir a foto."))), "image/jpeg", qualidade));
}

/** Guarda a foto: o original espera o envio ao Drive; a miniatura fica no aparelho para exibir. */
export async function salvarFoto(banco: BancoInventario, plantaId: string, tipo: number, arquivo: Blob, nota: number | null = null, comEvento = true) {
  const id = crypto.randomUUID();
  const miniatura = await reduzirImagem(arquivo, 480, 0.75);
  await banco.transaction("rw", banco.fotos, banco.arquivos_fotos, banco.eventos, async () => {
    await banco.arquivos_fotos.add({ id, original: arquivo, miniatura });
    await banco.fotos.add({ id, planta_id: plantaId, data: new Date().toISOString(), tipo, arquivo_drive_id: null, nota_saude: nota });
    if (comEvento) await banco.eventos.add({
      id: crypto.randomUUID(), planta_id: plantaId, data: hojeISO(), tipo: "foto",
      produto: null, dose_g_l: null, volume_ml: null, observacao: `Foto: ${TIPOS_FOTO[tipo]?.nome ?? tipo}.`
    });
  });
  return id;
}

// CLAUDE.md, seção 7
export const TIPOS_FOTO: Record<number, { nome: string; dica: string }> = {
  1: { nome: "Porte inteiro", dica: "A planta inteira, com o vaso, de frente." },
  2: { nome: "Folha madura", dica: "Uma folha adulta, de perto, ocupando a tela." },
  3: { nome: "Verso da folha", dica: "A parte de baixo da folha, de perto." },
  4: { nome: "Colo e substrato", dica: "A base do caule e a terra." },
  5: { nome: "Flor ou fruto", dica: "A flor ou o fruto, de perto." },
  6: { nome: "Sintoma", dica: "A mancha, praga ou dano, bem de perto." },
  7: { nome: "Visor do medidor", dica: "O visor do medidor 4-em-1, legível." }
};

// ---------- Pendências ----------

export type Periodo = "atrasadas" | "hoje" | "semana" | "mes" | "depois";

export const ROTULO_PERIODO: Record<Periodo, string> = {
  atrasadas: "Atrasadas", hoje: "Hoje", semana: "Próximos 7 dias", mes: "Este mês", depois: "Mais adiante"
};

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Em que período cai uma pendência. Data só com mês ("2026-10") vale para o mês inteiro. */
export function periodoDe(dataPrevista: string, hoje: string): Periodo {
  const mesAtual = hoje.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(dataPrevista)) {
    if (dataPrevista < mesAtual) return "atrasadas";
    return dataPrevista === mesAtual ? "mes" : "depois";
  }
  if (/^\d{4}$/.test(dataPrevista)) return dataPrevista < hoje.slice(0, 4) ? "atrasadas" : "depois";
  const dia = dataPrevista.slice(0, 10);
  if (dia < hoje) return "atrasadas";
  if (dia === hoje) return "hoje";
  if (dia <= somarDias(hoje, 7)) return "semana";
  if (dia.slice(0, 7) === mesAtual) return "mes";
  return "depois";
}

export function agruparPendencias(lista: Pendencia[], hoje: string): Record<Periodo, Pendencia[]> {
  const g: Record<Periodo, Pendencia[]> = { atrasadas: [], hoje: [], semana: [], mes: [], depois: [] };
  for (const p of lista) if (!p.concluida_em) g[periodoDe(p.data_prevista, hoje)].push(p);
  for (const k of Object.keys(g) as Periodo[]) g[k].sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
  return g;
}

export async function concluirPendencia(banco: BancoInventario, id: string, concluida = true) {
  await banco.pendencias.update(id, { concluida_em: concluida ? hojeISO() : null });
}

export async function novaPendencia(banco: BancoInventario, p: Omit<Pendencia, "id" | "concluida_em">) {
  const id = crypto.randomUUID();
  await banco.pendencias.add({ ...p, id, concluida_em: null });
  return id;
}

export async function apagarPendencia(banco: BancoInventario, id: string) {
  await banco.transaction("rw", banco.pendencias, banco.apagados, async () => {
    await banco.pendencias.delete(id);
    await anotarExclusao(banco, "pendencias", id);
  });
}
