// Sincronização com a planilha Google (via Apps Script). Ver apps-script/Codigo.gs.
// Regra: vale a versão com "atualizado_em" mais recente. Sem internet, as alterações esperam e vão depois.
import {
  type BancoInventario, EPOCA, gravarConfig, lerConfig, META_LOCAL, TABELAS_SYNC, type TabelaSync
} from "./db";

export interface ConfigNuvem {
  url: string;
  token: string;
}

export interface EstadoSync {
  em_andamento: boolean;
  ultimo_ok: string | null;
  erro: string | null;
  enviados?: number;
  recebidos?: number;
}

type Registro = Record<string, unknown> & { atualizado_em?: string };

// Campos numéricos por tabela (a planilha pode devolver número como texto).
const NUMEROS: Partial<Record<TabelaSync, string[]>> = {
  plantas: ["ficha", "grupo", "quantidade", "ph_min", "ph_max", "rega_gatilho_min", "rega_gatilho_max"],
  fotos: ["tipo", "nota_saude"],
  medicoes: ["umidade", "ph", "luz", "temperatura"],
  eventos: ["dose_g_l", "volume_ml", "percentual_area_foliar", "tentadas", "pegaram"],
  insumos: ["quantidade"],
  lista_desejos: ["preco_alvo"],
  rotinas: ["mes"]
};

/** Ajusta o que veio da planilha: célula vazia → null e números guardados como texto → número. */
export function normalizarRemoto(tabela: TabelaSync, r: Registro): Registro {
  const out: Registro = { ...r };
  for (const c of NUMEROS[tabela] ?? []) {
    const v = out[c];
    if (v === "" || v === undefined) out[c] = null;
    else if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v.replace(",", ".")))) out[c] = Number(v.replace(",", "."));
  }
  for (const c of ["tags", "proibicoes", "alertas", "plantas", "insumos", "marcos"]) {
    // listas que a planilha devolveu como texto JSON
    if (typeof out[c] === "string" && (out[c] as string).trim().startsWith("[")) {
      try { out[c] = JSON.parse(out[c] as string); } catch { /* fica como veio */ }
    }
    if (c in out && out[c] === null && ["plantas", "projetos", "eventos"].includes(tabela)) out[c] = [];
  }
  if (tabela === "plantas" && out.historico === null) out.historico = "";
  return out;
}

const carimbo = (r: { atualizado_em?: string } | undefined) => r?.atualizado_em ?? EPOCA;

/** Junta valores de "meta" que não podem simplesmente ser substituídos. Devolve null se vale o remoto como veio. */
export function mesclarMeta(chave: string, local: unknown, remoto: unknown): unknown | null {
  if (chave === "proxima_ficha" && typeof local === "number" && typeof remoto === "number") {
    return local > remoto ? local : null;
  }
  if (chave === "ultimo_id_planta" && typeof local === "string" && typeof remoto === "string") {
    return Number(local.slice(1)) > Number(remoto.slice(1)) ? local : null;
  }
  if (chave === "fichas_excluidas" && Array.isArray(local) && Array.isArray(remoto)) {
    const uniao = [...new Set([...remoto, ...local])].sort((a, b) => a - b);
    return uniao.length > remoto.length ? uniao : null;
  }
  return null;
}

export async function chamar(cfg: ConfigNuvem, corpo: object, tempoMs = 90_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), tempoMs);
  try {
    // corpo como texto simples: o Apps Script aceita sem a "pré-consulta" de segurança do navegador (CORS)
    const r = await fetch(cfg.url, { method: "POST", body: JSON.stringify({ ...corpo, token: cfg.token }), signal: ctrl.signal });
    if (!r.ok) throw new Error(`A planilha respondeu com erro ${r.status}.`);
    const json = await r.json().catch(() => {
      throw new Error("Resposta inesperada. Confira se o endereço é o do App da Web (termina em /exec) e se o acesso está como \"Qualquer pessoa\".");
    });
    if (json.erro) throw new Error(json.erro);
    return json;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("A planilha demorou demais para responder. Tente de novo.");
    if (e instanceof TypeError) throw new Error("Sem conexão com a planilha (sem internet ou endereço errado).");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function lerConfigNuvem(banco: BancoInventario): Promise<ConfigNuvem | null> {
  const cfg = await lerConfig<ConfigNuvem | null>(banco, "nuvem", null);
  return cfg && cfg.url && cfg.token ? cfg : null;
}

/** Testa endereço e token antes de salvar. */
export async function testarNuvem(cfg: ConfigNuvem) {
  await chamar(cfg, { acao: "ping" }, 30_000);
}

/** Uma rodada completa: envia o que mudou aqui, recebe o que mudou nos outros aparelhos e envia as fotos pendentes. */
export async function sincronizar(banco: BancoInventario): Promise<{ enviados: number; recebidos: number }> {
  const cfg = await lerConfigNuvem(banco);
  if (!cfg) throw new Error("A nuvem ainda não foi configurada.");

  const ultimoEnvio = await lerConfig<string | null>(banco, "ultimo_envio", null);
  const desde = await lerConfig<string | null>(banco, "ultimo_recebimento", null);
  const inicio = new Date().toISOString();

  // 1. o que mudou aqui desde o último envio (na primeira vez, tudo)
  const mudancas: Record<string, Registro[]> = {};
  let enviados = 0;
  for (const tabela of Object.keys(TABELAS_SYNC) as TabelaSync[]) {
    const t = banco.table(tabela);
    let linhas = (ultimoEnvio
      ? await t.where("atualizado_em").above(ultimoEnvio).toArray()
      : await t.toArray()) as Registro[];
    if (tabela === "meta") linhas = linhas.filter((m) => !META_LOCAL.has(String(m.chave)));
    if (linhas.length) {
      mudancas[tabela] = linhas;
      enviados += linhas.length;
    }
  }
  const apagados = await banco.apagados.toArray();
  enviados += apagados.length;

  const resp = await chamar(cfg, {
    acao: "sincronizar",
    mudancas,
    apagados: apagados.map(({ tabela, chave, em }) => ({ tabela, chave, em })),
    desde
  });

  // 2. aplica o que veio da planilha (só se for mais novo que o daqui)
  let recebidos = 0;
  await banco.transaction("rw", [...Object.keys(TABELAS_SYNC).map((t) => banco.table(t)), banco.apagados, banco.config_local], async () => {
    for (const [tabela, linhas] of Object.entries(resp.mudancas ?? {}) as [TabelaSync, Registro[]][]) {
      if (!(tabela in TABELAS_SYNC)) continue;
      const t = banco.table(tabela);
      const campoChave = TABELAS_SYNC[tabela];
      for (const bruto of linhas) {
        const remoto = normalizarRemoto(tabela, bruto);
        const chave = remoto[campoChave] as string;
        if (tabela === "meta" && META_LOCAL.has(chave)) continue;
        const local = (await t.get(chave)) as Registro | undefined;
        if (local && carimbo(local) >= carimbo(remoto)) continue;
        if (tabela === "meta" && local) {
          const mesclado = mesclarMeta(chave, local.valor, remoto.valor);
          if (mesclado !== null) {
            // o valor juntado é novo: recebe a hora atual para voltar à planilha no próximo envio
            await t.put({ chave, valor: mesclado, atualizado_em: new Date().toISOString() });
            recebidos++;
            continue;
          }
        }
        await t.put(remoto);
        recebidos++;
      }
    }
    for (const a of (resp.apagados ?? []) as { tabela: TabelaSync; chave: string; em: string }[]) {
      if (!(a.tabela in TABELAS_SYNC)) continue;
      const t = banco.table(a.tabela);
      const local = (await t.get(a.chave)) as Registro | undefined;
      if (local && carimbo(local) <= a.em) {
        await t.delete(a.chave);
        recebidos++;
      }
    }
    // exclusões enviadas com sucesso já não precisam ficar anotadas
    await banco.apagados.bulkDelete(apagados.map((a) => a.id!));
    await gravarConfig(banco, "ultimo_envio", inicio);
    await gravarConfig(banco, "ultimo_recebimento", resp.agora);
  });

  // 3. fotos esperando envio ao Drive
  await enviarFotos(banco, cfg);

  return { enviados, recebidos };
}

export async function blobParaBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function enviarFotos(banco: BancoInventario, cfg: ConfigNuvem) {
  const pendentes = await banco.arquivos_fotos.filter((a) => !!a.original).toArray();
  for (const arq of pendentes) {
    const foto = await banco.fotos.get(arq.id);
    if (!foto) {
      await banco.arquivos_fotos.delete(arq.id);
      continue;
    }
    const planta = await banco.plantas.get(foto.planta_id);
    const ext = arq.original!.type === "image/png" ? "png" : "jpg";
    const resp = await chamar(cfg, {
      acao: "foto",
      planta_id: foto.planta_id,
      nome_planta: planta?.nome_popular ?? "",
      nome_arquivo: `${foto.data.slice(0, 10)} tipo${foto.tipo} ${foto.id.slice(0, 8)}.${ext}`,
      mime: arq.original!.type || "image/jpeg",
      base64: await blobParaBase64(arq.original!)
    }, 180_000);
    await banco.fotos.update(foto.id, { arquivo_drive_id: resp.id });
    // o original já está no Drive: libera espaço no celular e fica só a miniatura
    await banco.arquivos_fotos.update(arq.id, { original: null });
  }
}

// ---------- Sincronização automática ----------

let rodando: Promise<void> | null = null;
let agendado: ReturnType<typeof setTimeout> | null = null;
const ouvintes = new Set<(e: EstadoSync) => void>();
let estado: EstadoSync = { em_andamento: false, ultimo_ok: null, erro: null };

function publicar(novo: Partial<EstadoSync>) {
  estado = { ...estado, ...novo };
  ouvintes.forEach((f) => f(estado));
}

export const estadoSync = () => estado;
export function ouvirSync(f: (e: EstadoSync) => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Roda a sincronização (uma por vez). Erros ficam no estado, não interrompem o uso do app. */
export function sincronizarAgora(banco: BancoInventario): Promise<void> {
  if (rodando) return rodando;
  rodando = (async () => {
    if (!(await lerConfigNuvem(banco))) return;
    publicar({ em_andamento: true });
    try {
      const r = await sincronizar(banco);
      const agora = new Date().toISOString();
      await gravarConfig(banco, "ultimo_sync_ok", agora);
      publicar({ em_andamento: false, ultimo_ok: agora, erro: null, enviados: r.enviados, recebidos: r.recebidos });
    } catch (e) {
      publicar({ em_andamento: false, erro: (e as Error).message });
    }
  })().finally(() => {
    rodando = null;
    // algo mudou durante a rodada (ex.: id da foto no Drive): manda numa próxima
    if (mudouDurante) {
      mudouDurante = false;
      banco.aoAlterar?.();
    }
  });
  return rodando;
}

let mudouDurante = false;

/** Liga a sincronização automática: ao abrir, ao voltar a internet, ao voltar para a tela e alguns segundos depois de cada alteração. */
export async function iniciarSyncAutomatico(banco: BancoInventario) {
  publicar({ ultimo_ok: await lerConfig<string | null>(banco, "ultimo_sync_ok", null) });
  const tentar = () => navigator.onLine && sincronizarAgora(banco);
  banco.aoAlterar = () => {
    if (rodando) {
      mudouDurante = true;
      return;
    }
    if (agendado) clearTimeout(agendado);
    agendado = setTimeout(tentar, 8000);
  };
  window.addEventListener("online", tentar);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && tentar());
  tentar();
}
