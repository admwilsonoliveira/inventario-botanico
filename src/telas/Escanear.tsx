import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, lerConfig } from "../db";
import { criarPlanta } from "../carga";
import {
  analisarFotos, type AcaoConferida, type Candidato, CONFIANCA_MINIMA, climaPatrocinio, conferirResposta,
  ESQUEMA_FICHA, ESQUEMA_LAUDO, type FichaIA, type FotoEscaneada, identificarFotos, type Laudo, montarInstrucoes,
  orgaoDaFoto, plantasDaEspecie, rascunhoDaFicha, resumoLaudo, TIPOS_OBRIGATORIOS
} from "../ia";
import { LIMIAR_NITIDEZ_PADRAO, medirNitidez } from "../nitidez";
import { hojeISO, novaPendencia, reduzirImagem, salvarEvento, salvarFoto, TIPOS_FOTO } from "../registro";
import type { Disparo } from "../regras";
import { ir } from "../rotas";
import { avisar } from "../aviso";
import { Camera } from "./Camera";
import type { Planta } from "../types";

type Etapa = "fotos" | "identificando" | "candidatos" | "mesma" | "analisando" | "resultado";

interface Resultado {
  modo: "ficha" | "checkup";
  ficha?: FichaIA;
  laudo: Laudo;
  acoes: AcaoConferida[];
  avisos: Disparo[];
}

const pct = (s: number) => `${Math.round(s * 100)}%`;

function Miniatura({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt="" /> : null;
}

/** Tela de espera: mantém a tela acesa (senão o celular corta a conexão), mostra o tempo e deixa cancelar. */
function Esperando({ texto, aoCancelar }: { texto: string; aoCancelar: () => void }) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const t = setInterval(() => setSegundos(Math.round((Date.now() - inicio) / 1000)), 1000);
    let trava: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((w) => { trava = w; }).catch(() => {});
    return () => {
      clearInterval(t);
      trava?.release().catch(() => {});
    };
  }, []);
  return (
    <div className="carregando-ia">
      <div className="girando" aria-hidden="true">🌿</div>
      <p>{texto}</p>
      <p className="contador">{segundos} s</p>
      <p className="ajuda">Deixe o app aberto nesta tela até terminar.{segundos > 60 ? " O Gemini está demorando: o script está tentando os modelos de reserva." : ""}</p>
      <button className="botao secundario" onClick={aoCancelar}>Cancelar</button>
    </div>
  );
}

export function Escanear({ plantaId }: { plantaId: string | null }) {
  const plantaCheckup = useLiveQuery(async () => (plantaId ? (await db.plantas.get(plantaId)) ?? null : null), [plantaId]);
  const [fotos, setFotos] = useState<Record<number, FotoEscaneada>>({});
  const [camera, setCamera] = useState<number | null>(null);
  const [processando, setProcessando] = useState(false);
  const [rejeitada, setRejeitada] = useState<{ tipo: number; foto: Blob; nitidez: number; limiar: number } | null>(null);
  const [etapa, setEtapa] = useState<Etapa>("fotos");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [iguais, setIguais] = useState<Planta[]>([]);
  const [alvo, setAlvo] = useState<Planta | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [repetir, setRepetir] = useState<(() => void) | null>(null);
  const geracao = useRef(0);
  /** Qual análise do Gemini falhou: oferece seguir sem a IA, para não perder as fotos. */
  const [falhaIA, setFalhaIA] = useState<"ficha" | "checkup" | null>(null);

  /** Mensagem de erro com o botão de tentar de novo a última análise e o plano B sem a IA. */
  const caixaErro = erro && (
    <div className="aviso erro">
      {erro}
      {repetir && (
        <button className="botao largo" onClick={() => repetir()}>↻ Tentar de novo</button>
      )}
      {falhaIA === "ficha" && (
        <div className="plano-b">
          <p>Ou siga sem a ficha da IA (dá para pedir o check-up depois, pela ficha da planta):</p>
          <button className="botao secundario largo" disabled={salvando} onClick={() => incluirSemIA()}>➕ Incluir só com a identificação</button>
          <button className="botao secundario largo" disabled={salvando} onClick={() => desejoSemIA()}>⭐ Lista de desejos</button>
        </div>
      )}
      {falhaIA === "checkup" && alvo && (
        <div className="plano-b">
          <p>Ou guarde as fotos agora e peça o laudo mais tarde:</p>
          <button className="botao secundario largo" disabled={salvando} onClick={() => guardarSemLaudo()}>💾 Guardar as fotos sem laudo</button>
        </div>
      )}
    </div>
  );

  if (plantaId && plantaCheckup === undefined) return null;
  if (plantaId && !plantaCheckup) return <p>Planta não encontrada.</p>;
  const modoCheckup = !!plantaCheckup;
  const lista = Object.values(fotos).sort((a, b) => a.tipo - b.tipo);
  const faltam = TIPOS_OBRIGATORIOS.filter((t) => !fotos[t]);

  // ---------- fotos ----------

  async function aoCapturar(tipo: number, foto: Blob, forcar = false) {
    setCamera(null);
    setProcessando(true);
    try {
      const limiar = await lerConfig<number>(db, "limiar_nitidez", LIMIAR_NITIDEZ_PADRAO);
      const nitidez = await medirNitidez(foto);
      if (nitidez < limiar && !forcar) {
        setRejeitada({ tipo, foto, nitidez, limiar });
        return;
      }
      const reduzida = await reduzirImagem(foto, 1568, 0.8);
      setFotos((f) => ({ ...f, [tipo]: { tipo, original: foto, reduzida, nitidez, fruto: f[tipo]?.fruto } }));
      setRejeitada(null);
    } catch (e) {
      setErro(`Não foi possível ler a foto: ${(e as Error).message}`);
    } finally {
      setProcessando(false);
    }
  }

  // ---------- IA ----------

  async function contexto(modo: "ficha" | "checkup", candidato: Candidato | null, planta: Planta | null) {
    const [grupos, insumos, clima] = await Promise.all([
      lerConfigMeta(), db.insumos.toArray(), climaPatrocinio()
    ]);
    const medicao = planta
      ? (await db.medicoes.where("planta_id").equals(planta.id).toArray()).sort((a, b) => b.data_hora.localeCompare(a.data_hora))[0] ?? null
      : null;
    const eventos = planta
      ? (await db.eventos.where("planta_id").equals(planta.id).toArray()).sort((a, b) => b.data.localeCompare(a.data))
      : [];
    return {
      instrucoes: montarInstrucoes({
        modo, candidato, planta, grupos, data: new Date(), clima, medicao, eventos,
        insumosEstoque: insumos.filter((i) => i.em_estoque).map((i) => i.nome),
        tiposFotos: lista.map((f) => f.tipo)
      }),
      insumos
    };
  }

  async function identificar() {
    setErro(null);
    setRepetir(() => () => identificar());
    setEtapa("identificando");
    const minha = ++geracao.current;
    try {
      const c = await identificarFotos(db, lista);
      if (minha !== geracao.current) return;
      setCandidatos(c);
      setEscolhido(c[0] && c[0].score >= CONFIANCA_MINIMA ? 0 : null);
      setEtapa("candidatos");
    } catch (e) {
      if (minha !== geracao.current) return;
      setErro((e as Error).message);
      setEtapa("fotos");
    }
  }

  async function seguirComCandidato() {
    const c = escolhido !== null ? candidatos[escolhido] : null;
    if (!c) return;
    const mesmas = plantasDaEspecie(await db.plantas.toArray(), c.nome_cientifico);
    if (mesmas.length) {
      setIguais(mesmas);
      setEtapa("mesma");
    } else {
      analisar("ficha", c, null);
    }
  }

  async function analisar(modo: "ficha" | "checkup", candidato: Candidato | null, planta: Planta | null) {
    setErro(null);
    setFalhaIA(null);
    setRepetir(() => () => analisar(modo, candidato, planta));
    setAlvo(planta);
    setEtapa("analisando");
    const minha = ++geracao.current;
    try {
      const { instrucoes, insumos } = await contexto(modo, candidato, planta);
      const regras = await db.regras.toArray();
      if (modo === "ficha") {
        const ficha = await analisarFotos<FichaIA>(db, instrucoes, lista, ESQUEMA_FICHA);
        if (minha !== geracao.current) return;
        const r = conferirResposta(ficha.laudo, JSON.stringify(ficha), regras, insumos, null);
        setResultado({ modo, ficha, laudo: ficha.laudo, acoes: r.acoes, avisos: r.avisosGerais });
      } else {
        const laudo = await analisarFotos<Laudo>(db, instrucoes, lista, ESQUEMA_LAUDO);
        if (minha !== geracao.current) return;
        const r = conferirResposta(laudo, JSON.stringify(laudo), regras, insumos, planta);
        setResultado({ modo, laudo, acoes: r.acoes, avisos: r.avisosGerais });
      }
      setEtapa("resultado");
    } catch (e) {
      if (minha !== geracao.current) return;
      setErro((e as Error).message);
      setFalhaIA(modo);
      setEtapa(modo === "checkup" && plantaId ? "fotos" : "candidatos");
    }
  }

  // ---------- decisões ----------

  async function guardarFotosERegistro(id: string, laudo: Laudo, acoes: AcaoConferida[]) {
    for (const f of lista) await salvarFoto(db, id, f.tipo, f.original, laudo.nota, false);
    await salvarEvento(db, {
      planta_id: id, data: hojeISO(), tipo: "checkup", produto: null, dose_g_l: null, volume_ml: null,
      observacao: resumoLaudo(laudo, acoes)
    });
  }

  async function incluir() {
    if (!resultado?.ficha) return;
    setSalvando(true);
    const c = escolhido !== null ? candidatos[escolhido] : null;
    const grupos = await lerConfigMeta();
    const id = await criarPlanta(db, {
      ...rascunhoDaFicha(resultado.ficha, c, grupos),
      historico: c ? `Identificada pelo Pl@ntNet (${c.nome_cientifico}, ${pct(c.score)}) em ${hojeISO()}.` : ""
    });
    await guardarFotosERegistro(id, resultado.laudo, resultado.acoes);
    avisar("✔ Planta incluída. Confira o questionário.");
    ir(`/planta/${id}/editar`);
  }

  async function paraDesejos() {
    if (!resultado?.ficha) return;
    const f = resultado.ficha;
    const r = rascunhoDaFicha(f, escolhido !== null ? candidatos[escolhido] : null, await lerConfigMeta());
    await db.lista_desejos.add({
      id: crypto.randomUUID(), nome: r.nome_popular || f.identificacao.nome_cientifico, especie: r.nome_cientifico ?? null,
      prioridade: "média", zona_compativel: r.luz ?? null, epoca_compra: null, preco_alvo: null,
      observacao: [f.habito, f.toxicidade && `Toxicidade: ${f.toxicidade}`].filter(Boolean).join(" ") || null
    });
    avisar("✔ Adicionada à lista de desejos");
    ir("/desejos");
  }

  // ---------- plano B: Gemini indisponível ----------

  async function incluirSemIA() {
    const c = escolhido !== null ? candidatos[escolhido] : null;
    if (!c) return;
    setSalvando(true);
    const id = await criarPlanta(db, {
      nome_popular: c.nomes_populares[0] || c.nome_cientifico,
      nome_cientifico: c.nome_cientifico || null,
      historico: `Identificada pelo Pl@ntNet (${c.nome_cientifico}, ${pct(c.score)}) em ${hojeISO()}. Ficha da IA pendente.`
    });
    for (const f of lista) await salvarFoto(db, id, f.tipo, f.original, null, false);
    await salvarEvento(db, {
      planta_id: id, data: hojeISO(), tipo: "observacao", produto: null, dose_g_l: null, volume_ml: null,
      observacao: "Incluída só com a identificação do Pl@ntNet (Gemini indisponível). Fazer o check-up com IA depois."
    });
    avisar("✔ Planta incluída. Complete o questionário.");
    ir(`/planta/${id}/editar`);
  }

  async function desejoSemIA() {
    const c = escolhido !== null ? candidatos[escolhido] : null;
    if (!c) return;
    setSalvando(true);
    await db.lista_desejos.add({
      id: crypto.randomUUID(), nome: c.nomes_populares[0] || c.nome_cientifico, especie: c.nome_cientifico || null,
      prioridade: "média", zona_compativel: null, epoca_compra: null, preco_alvo: null,
      observacao: `Identificada pelo Pl@ntNet (${pct(c.score)}). Informe a luz que ela precisa.`
    });
    avisar("✔ Adicionada à lista de desejos");
    ir("/desejos");
  }

  async function guardarSemLaudo() {
    if (!alvo) return;
    setSalvando(true);
    for (const f of lista) await salvarFoto(db, alvo.id, f.tipo, f.original, null, false);
    await salvarEvento(db, {
      planta_id: alvo.id, data: hojeISO(), tipo: "observacao", produto: null, dose_g_l: null, volume_ml: null,
      observacao: "Fotos de check-up guardadas; laudo não feito (Gemini indisponível)."
    });
    avisar("✔ Fotos guardadas. Peça o laudo mais tarde.");
    ir(`/planta/${alvo.id}`);
  }

  async function salvarCheckup() {
    if (!resultado || !alvo) return;
    setSalvando(true);
    await guardarFotosERegistro(alvo.id, resultado.laudo, resultado.acoes);
    avisar("✔ Check-up salvo no histórico");
    ir(`/planta/${alvo.id}`);
  }

  // ---------- telas ----------

  if (camera !== null) return <Camera tipo={camera} aoCapturar={(b) => aoCapturar(camera, b)} aoFechar={() => setCamera(null)} />;

  const titulo = modoCheckup ? `🩺 Check-up: ${plantaCheckup!.nome_popular}` : "📷 Escanear planta";
  const voltar = modoCheckup ? `#/planta/${plantaId}` : "#/";

  if (etapa === "identificando" || etapa === "analisando") {
    return (
      <>
        <h1>{titulo}</h1>
        <Esperando
          texto={etapa === "identificando" ? "Identificando pelo Pl@ntNet…" : "O Gemini está analisando as fotos…"}
          aoCancelar={() => {
            geracao.current++;
            setEtapa(etapa === "identificando" || modoCheckup ? "fotos" : "candidatos");
          }}
        />
      </>
    );
  }

  if (etapa === "candidatos") {
    const melhor = candidatos[0];
    return (
      <>
        <button className="voltar link-voltar" onClick={() => setEtapa("fotos")}>‹ Fotos</button>
        <h1>Qual é a planta?</h1>
        {caixaErro}
        {candidatos.length === 0 ? (
          <div className="aviso">O Pl@ntNet não reconheceu a planta. Tente outra foto: uma flor ou fruto ajuda muito.</div>
        ) : melhor.score < CONFIANCA_MINIMA ? (
          <div className="aviso">Confiança baixa ({pct(melhor.score)}). Escolha a certa entre as opções ou volte e envie outra foto (flor, fruto ou outra folha).</div>
        ) : (
          <p className="ajuda">Confiança alta. Confira e siga.</p>
        )}
        <ul className="candidatos">
          {candidatos.map((c, i) => (
            <li key={c.nome_cientifico}>
              <button className={escolhido === i ? "candidato ativo" : "candidato"} onClick={() => setEscolhido(i)}>
                <span className="pct">{pct(c.score)}</span>
                <span className="nomes">
                  <em>{c.nome_cientifico}</em>
                  <small>{[c.nomes_populares.slice(0, 3).join(", "), c.familia].filter(Boolean).join(" · ")}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="botoes">
          <button className="botao secundario" onClick={() => setEtapa("fotos")}>Outra foto</button>
          <button className="botao" disabled={escolhido === null} onClick={seguirComCandidato}>Seguir</button>
        </div>
        <p className="ajuda">Nada acontece sem você tocar: a análise do Gemini só começa depois de "Seguir".</p>
      </>
    );
  }

  if (etapa === "mesma") {
    const c = candidatos[escolhido!];
    return (
      <>
        <h1>Já existe no inventário</h1>
        <p><em>{c.nome_cientifico}</em> já está na coleção. É a mesma planta?</p>
        <ul className="lista-simples links">
          {iguais.map((p) => (
            <li key={p.id}>
              <button className="botao secundario largo" onClick={() => analisar("checkup", c, p)}>
                Sim, é a nº {p.ficha ?? "—"} · {p.nome_popular} (fazer check-up)
              </button>
            </li>
          ))}
        </ul>
        <button className="botao largo" onClick={() => analisar("ficha", c, null)}>Não, é outra planta (ficha nova)</button>
      </>
    );
  }

  if (etapa === "resultado" && resultado) {
    const f = resultado.ficha;
    return (
      <>
        <h1>{resultado.modo === "ficha" ? f!.identificacao.nome_popular || f!.identificacao.nome_cientifico : `Check-up: ${alvo?.nome_popular}`}</h1>
        {f && (
          <>
            <p className="cientifico">{f.identificacao.nome_cientifico} · {f.identificacao.familia}{f.identificacao.variedade_provavel ? ` · ${f.identificacao.variedade_provavel}` : ""}</p>
            <FichaEspecie f={f} />
          </>
        )}
        <LaudoView laudo={resultado.laudo} acoes={resultado.acoes} avisos={resultado.avisos} plantaId={alvo?.id ?? null} />
        {resultado.modo === "ficha" ? (
          <section className="cartao decisao">
            <h2>O que fazer com esta planta?</h2>
            <button className="botao largo" disabled={salvando} onClick={incluir}>➕ Incluir no inventário (próxima ficha)</button>
            <button className="botao secundario largo" disabled={salvando} onClick={paraDesejos}>⭐ Lista de desejos</button>
            <button className="botao secundario largo" onClick={() => ir("/")}>Descartar</button>
          </section>
        ) : (
          <button className="botao largo" disabled={salvando} onClick={salvarCheckup}>Salvar check-up no histórico</button>
        )}
      </>
    );
  }

  // etapa "fotos"
  return (
    <>
      <a className="voltar" href={voltar}>‹ Voltar</a>
      <h1>{titulo}</h1>
      <p className="ajuda">Fotos 1 e 2 são obrigatórias. As outras ajudam: flor ou fruto melhora muito a identificação; sintoma e colo ajudam no laudo.</p>
      {caixaErro}
      {rejeitada && (
        <div className="aviso erro">
          <b>Foto tremida ou fora de foco</b> (nitidez {Math.round(rejeitada.nitidez)}; mínimo {rejeitada.limiar}). Tire de novo, com o celular firme.
          <div className="botoes">
            <button className="botao" onClick={() => { setRejeitada(null); setCamera(rejeitada.tipo); }}>Tirar de novo</button>
            <button className="botao secundario" onClick={() => aoCapturar(rejeitada.tipo, rejeitada.foto, true)}>Está boa, usar</button>
          </div>
        </div>
      )}
      <div className="grade-fotos-escanear">
        {Object.entries(TIPOS_FOTO).map(([n, t]) => {
          const tipo = Number(n);
          const f = fotos[tipo];
          return (
            <div key={tipo} className={f ? "slot-foto feito" : TIPOS_OBRIGATORIOS.includes(tipo) ? "slot-foto obrigatoria" : "slot-foto"}>
              <button className="abrir" onClick={() => setCamera(tipo)} disabled={processando}>
                {f ? <Miniatura blob={f.reduzida} /> : <span className="icone">📷</span>}
                <span className="nome">{tipo}. {t.nome}{TIPOS_OBRIGATORIOS.includes(tipo) ? " *" : ""}</span>
              </button>
              {tipo === 5 && (
                <label className="linha-check pequena">
                  <input type="checkbox" checked={!!f?.fruto}
                    onChange={(e) => f && setFotos({ ...fotos, 5: { ...f, fruto: e.target.checked } })} disabled={!f} /> é fruto
                </label>
              )}
              {f && (
                <button className="link perigo" onClick={() => { const n2 = { ...fotos }; delete n2[tipo]; setFotos(n2); }}>remover</button>
              )}
            </div>
          );
        })}
      </div>
      {processando && <p className="ajuda">Conferindo a nitidez…</p>}
      {faltam.length > 0 && <p className="ajuda">Falta: {faltam.map((t) => TIPOS_FOTO[t].nome).join(" e ")}.</p>}
      {modoCheckup ? (
        <button className="botao largo" disabled={faltam.length > 0 || processando} onClick={() => analisar("checkup", null, plantaCheckup!)}>
          🩺 Analisar saúde (Gemini)
        </button>
      ) : (
        <button className="botao largo" disabled={faltam.length > 0 || processando || !lista.some((f) => orgaoDaFoto(f))} onClick={identificar}>
          🔍 Identificar (Pl@ntNet)
        </button>
      )}
    </>
  );
}

async function lerConfigMeta() {
  const m = await db.meta.get("grupos");
  return (m?.valor as { numero: number; nome: string }[] | undefined) ?? [];
}

function FichaEspecie({ f }: { f: FichaIA }) {
  const p = f.parametros;
  return (
    <section className="cartao">
      <h2>Ficha da espécie <span className="selo sugerido">sugerida pela IA</span></h2>
      <dl>
        <div className="linha-dado"><dt>pH</dt><dd>{p.ph_min}–{p.ph_max}</dd></div>
        <div className="linha-dado"><dt>Regar no nível</dt><dd>{p.rega_gatilho_min}–{p.rega_gatilho_max}</dd></div>
        <div className="linha-dado"><dt>Luz (1–9)</dt><dd>{p.luz_1a9}</dd></div>
        <div className="linha-dado"><dt>Temperatura</dt><dd>{p.temperatura}</dd></div>
        <div className="linha-dado"><dt>Grupo sugerido</dt><dd>{f.grupo_sugerido}</dd></div>
      </dl>
      {f.substrato_percentual.length > 0 && <p><b>Substrato:</b> {f.substrato_percentual.map((s) => `${s.percentual}% ${s.insumo}`).join(", ")}</p>}
      {f.adubacao.length > 0 && <p><b>Adubação:</b> {f.adubacao.map((a) => `${a.produto} ${a.dose_g_l} g/L (${a.fase})`).join("; ")}</p>}
      <details>
        <summary>Mais sobre a espécie</summary>
        {f.origem_historia && <p><b>Origem:</b> {f.origem_historia}</p>}
        {f.habito && <p><b>Hábito:</b> {f.habito}</p>}
        {f.paisagismo && <p><b>Paisagismo:</b> {f.paisagismo}</p>}
        {f.toxicidade && <p><b>Toxicidade:</b> {f.toxicidade}</p>}
        {f.propagacao && <p><b>Propagação:</b> {f.propagacao}</p>}
        {f.pragas_comuns.length > 0 && <p><b>Pragas comuns:</b> {f.pragas_comuns.join(", ")}</p>}
      </details>
    </section>
  );
}

function LaudoView({ laudo, acoes, avisos, plantaId }: { laudo: Laudo; acoes: AcaoConferida[]; avisos: Disparo[]; plantaId: string | null }) {
  const [criadas, setCriadas] = useState<Set<number>>(new Set());
  const s = laudo.subnotas;
  return (
    <section className="cartao laudo">
      <h2>Laudo de saúde: <span className="nota">{laudo.nota}/10</span></h2>
      <p className="subnotas">
        Vigor {s.vigor} · Cor/nutrição {s.nutricao_cor} · Pragas/doenças {s.pragas_doencas} · Estrutura {s.estrutura} · Vaso/substrato {s.vaso_substrato}
      </p>
      {avisos.map((d) => <div key={d.regra.id} className={d.tipo === "bloquear" ? "aviso erro" : "aviso"}>⚠ {d.mensagem}</div>)}
      <h3>👁 Visto nas fotos</h3>
      {laudo.sinais_vistos.length ? <ul>{laudo.sinais_vistos.map((x, i) => <li key={i}>{x.sinal} <small>({x.onde})</small></li>)}</ul> : <p className="vazio">Nada fora do normal.</p>}
      <h3>❓ Suspeitas (não confirmadas)</h3>
      {laudo.hipoteses.length ? (
        <ul>{laudo.hipoteses.map((h, i) => <li key={i}><b>{h.causa}</b> [{h.probabilidade}] — {h.mecanismo}</li>)}</ul>
      ) : <p className="vazio">Nenhuma.</p>}
      {laudo.perguntas_confirmacao.length > 0 && (
        <>
          <h3>📏 Para confirmar</h3>
          <ul>{laudo.perguntas_confirmacao.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </>
      )}
      <h3>✅ Ações</h3>
      <ul className="acoes-ia">
        {acoes.map((a, i) => (
          <li key={i} className={a.bloqueio ? "bloqueada" : ""}>
            {a.bloqueio ? (
              <span>⛔ <s>{a.acao}</s> — <b>removida pelas regras:</b> {a.bloqueio}</span>
            ) : (
              <>
                <span><b>{a.acao}</b> <small>({a.quando})</small>{a.insumo && <> · {a.insumo}</>}</span>
                {a.precisa_comprar && <span className="selo alerta">precisa comprar</span>}
                {a.alertas.map((m) => <div key={m} className="aviso">⚠ {m}</div>)}
                {plantaId && (
                  <button className="link" disabled={criadas.has(i)} onClick={async () => {
                    await novaPendencia(db, { planta_id: plantaId, data_prevista: hojeISO(), acao: `${a.acao}${a.insumo ? ` (${a.insumo})` : ""}` });
                    setCriadas(new Set(criadas).add(i));
                  }}>{criadas.has(i) ? "✔ pendência criada" : "+ pendência"}</button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
