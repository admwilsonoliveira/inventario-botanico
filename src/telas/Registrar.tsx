import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { calcularDose, descreverDose } from "../calculadora";
import { temBloqueio, type Disparo } from "../regras";
import {
  avaliarPh, conferirEvento, hojeISO, salvarEvento, salvarFoto, salvarMedicao, TIPOS_FOTO, vereditoRega
} from "../registro";
import { ir } from "../rotas";
import { avisar } from "../aviso";
import { lerVisor } from "../ia";
import { TIPOS_EVENTO, type Evento, type Planta } from "../types";

export type TipoRegistro = "rega" | "adubacao" | "medicao" | "foto" | "outro";

const TITULOS: Record<TipoRegistro, string> = {
  rega: "💧 Reguei", adubacao: "🧪 Adubei", medicao: "📏 Medi", foto: "📷 Foto", outro: "📝 Outro registro"
};

// tipos que aparecem em "Outro registro" (os demais têm botão próprio)
const TIPOS_OUTRO = Object.keys(TIPOS_EVENTO).filter((t) => !["rega", "adubacao", "medicao", "foto", "revisao", "checkup", "marco", "propagacao_resultado", "consulta"].includes(t));
const COM_INSUMOS = ["transplante", "renovacao_substrato", "plantio", "propagacao"];
const COM_PERCENTUAL = ["poda", "poda_estrutural"];

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Avisos do motor de regras: bloqueio (vermelho) e alerta (amarelo). */
function AvisosRegras({ disparos }: { disparos: Disparo[] }) {
  if (!disparos.length) return null;
  return (
    <div className="avisos-regras">
      {disparos.map((d) => (
        <div key={d.regra.id} className={d.tipo === "bloquear" ? "aviso erro" : "aviso"}>
          <b>{d.tipo === "bloquear" ? "⛔ Não permitido" : "⚠ Atenção"}:</b> {d.mensagem}
        </div>
      ))}
    </div>
  );
}

export function Registrar({ plantaId, tipo, tipoInicial }: { plantaId: string | null; tipo: TipoRegistro; tipoInicial?: string }) {
  // undefined = carregando; null = sem planta (evento geral) ou não encontrada
  const planta = useLiveQuery(
    async (): Promise<Planta | null> => (plantaId ? (await db.plantas.get(plantaId)) ?? null : null),
    [plantaId]
  );
  const voltar = plantaId ? `#/planta/${plantaId}` : "#/hoje";

  if (planta === undefined) return null;
  if (plantaId && !planta) return <p>Planta não encontrada.</p>;

  return (
    <>
      <a className="voltar" href={voltar}>‹ Voltar</a>
      <h1>{TITULOS[tipo]}</h1>
      <p className="subtitulo">{planta ? planta.nome_popular : "Evento geral (todas as plantas ou sem planta específica)"}</p>
      {tipo === "medicao" && planta ? <FormMedicao planta={planta} />
        : tipo === "foto" && planta ? <FormFoto planta={planta} />
        : <FormEvento planta={planta ?? null} tipo={tipo} tipoInicial={tipoInicial} />}
    </>
  );
}

// ---------------------------------------------------------------------------

function FormEvento({ planta, tipo, tipoInicial }: { planta: Planta | null; tipo: TipoRegistro; tipoInicial?: string }) {
  const insumos = useLiveQuery(() => db.insumos.toArray(), [], []);
  const [data, setData] = useState(hojeISO());
  const [tipoOutro, setTipoOutro] = useState(tipoInicial && TIPOS_OUTRO.includes(tipoInicial) ? tipoInicial : planta ? "observacao" : "lixiviacao");
  const [produto, setProduto] = useState("");
  const [dose, setDose] = useState("");
  const [volumeL, setVolumeL] = useState("");
  const [volumeMl, setVolumeMl] = useState("");
  const [mae, setMae] = useState("0,1");
  const [aplicacao, setAplicacao] = useState<"rega" | "substrato" | "foliar" | "">(tipo === "adubacao" ? "rega" : "");
  const [usados, setUsados] = useState<string[]>([]);
  const [percentual, setPercentual] = useState("");
  const [obs, setObs] = useState("");
  const [disparos, setDisparos] = useState<Disparo[]>([]);
  const [confirmarAlerta, setConfirmarAlerta] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const tipoEvento = tipo === "outro" ? tipoOutro : tipo;
  const adubos = insumos.filter((i) => i.em_estoque && ["npk", "nutricao", "correcao"].includes(i.categoria));
  const estruturais = insumos.filter((i) => ["estrutura", "nutricao", "correcao"].includes(i.categoria));
  const insumoEscolhido = insumos.find((i) => i.nome === produto);

  const doseCalc = useMemo(() => {
    const d = num(dose), v = num(volumeL), c = num(mae);
    if (tipo !== "adubacao" || d === null || v === null) return null;
    try {
      return calcularDose(d, v, c ?? 0.1);
    } catch (e) {
      return (e as Error).message;
    }
  }, [tipo, dose, volumeL, mae]);

  const evento: Omit<Evento, "id"> = {
    planta_id: planta?.id ?? null,
    data,
    tipo: tipoEvento,
    produto: produto.trim() || null,
    dose_g_l: tipo === "adubacao" ? num(dose) : null,
    volume_ml: tipo === "adubacao" ? (num(volumeL) === null ? null : Math.round(num(volumeL)! * 1000)) : num(volumeMl),
    observacao: obs.trim() || null,
    aplicacao: aplicacao || null,
    agua: tipo === "rega" ? "torneira" : null,
    insumos: COM_INSUMOS.includes(tipoEvento) ? usados : [],
    percentual_area_foliar: COM_PERCENTUAL.includes(tipoEvento) ? num(percentual) : null
  };
  const chave = JSON.stringify(evento);

  useEffect(() => {
    setConfirmarAlerta(false);
    const t = setTimeout(() => conferirEvento(db, evento).then(setDisparos), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const bloqueado = temBloqueio(disparos);
  const temAlerta = disparos.length > 0 && !bloqueado;

  async function salvar() {
    if (bloqueado) return;
    if (tipo === "adubacao" && !evento.produto) return avisar("Escolha o produto.");
    if (temAlerta && !confirmarAlerta) {
      setConfirmarAlerta(true);
      return;
    }
    setSalvando(true);
    const estoque = await salvarEvento(db, evento);
    avisar(`✔ ${TIPOS_EVENTO[tipoEvento] ?? "Registro"} salvo${estoque ? `. ${estoque}` : ""}`);
    ir(planta ? `/planta/${planta.id}` : "/hoje");
  }

  return (
    <div className="formulario">
      {tipo === "outro" && (
        <label>O que foi feito
          <select value={tipoOutro} onChange={(e) => setTipoOutro(e.target.value)}>
            {TIPOS_OUTRO.map((t) => <option key={t} value={t}>{TIPOS_EVENTO[t]}</option>)}
          </select>
        </label>
      )}

      {tipo === "rega" && (
        <>
          <p className="ajuda">Água de torneira (protocolo).</p>
          <label>Volume (ml) — opcional
            <input inputMode="decimal" value={volumeMl} onChange={(e) => setVolumeMl(e.target.value)} placeholder="ex.: 500" />
          </label>
        </>
      )}

      {tipo === "adubacao" && (
        <>
          <label>Produto
            <select value={produto} onChange={(e) => setProduto(e.target.value)}>
              <option value="">— escolha —</option>
              {adubos.map((i) => <option key={i.nome} value={i.nome}>{i.nome}</option>)}
            </select>
          </label>
          <div className="grade-2">
            <label>Dose (g/L)<input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="ex.: 1" /></label>
            <label>Água da rega (L)<input inputMode="decimal" value={volumeL} onChange={(e) => setVolumeL(e.target.value)} placeholder="ex.: 0,5" /></label>
          </div>
          {doseCalc && typeof doseCalc !== "string" && (
            <div className="cartao calculo">
              <b>{descreverDose(doseCalc)}</b>
              {doseCalc.metodo === "diluicao" && (
                <label className="linha-campo">Solução-mãe (g/ml)
                  <input inputMode="decimal" value={mae} onChange={(e) => setMae(e.target.value)} />
                </label>
              )}
            </div>
          )}
          {typeof doseCalc === "string" && <div className="msg-erro">{doseCalc}</div>}
          <fieldset className="opcoes">
            <legend>Como foi aplicado</legend>
            {([["rega", "Junto com a rega"], ["substrato", "No substrato"], ["foliar", "Na folha"]] as const).map(([v, r]) => (
              <label key={v}><input type="radio" checked={aplicacao === v} onChange={() => setAplicacao(v)} /> {r}</label>
            ))}
          </fieldset>
        </>
      )}

      {tipo === "outro" && (
        <>
          <label>Produto ou insumo — opcional
            <input list="lista-insumos" value={produto} onChange={(e) => setProduto(e.target.value)} />
            <datalist id="lista-insumos">{insumos.map((i) => <option key={i.nome} value={i.nome} />)}</datalist>
          </label>
          {insumoEscolhido && !insumoEscolhido.em_estoque && <div className="aviso">Este insumo está <b>sem estoque</b>: precisa comprar.</div>}
          {(produto || tipoOutro === "tratamento" || tipoOutro === "acidificacao") && (
            <fieldset className="opcoes">
              <legend>Como foi aplicado</legend>
              {([["rega", "Junto com a rega"], ["substrato", "No substrato"], ["foliar", "Na folha"]] as const).map(([v, r]) => (
                <label key={v}><input type="radio" checked={aplicacao === v} onChange={() => setAplicacao(v)} /> {r}</label>
              ))}
            </fieldset>
          )}
          {COM_PERCENTUAL.includes(tipoOutro) && (
            <label>Quanto da folhagem foi removido (%)
              <input inputMode="numeric" value={percentual} onChange={(e) => setPercentual(e.target.value)} placeholder="ex.: 20" />
            </label>
          )}
          {COM_INSUMOS.includes(tipoOutro) && (
            <fieldset className="opcoes">
              <legend>Substrato usado</legend>
              {estruturais.map((i) => (
                <label key={i.nome}>
                  <input type="checkbox" checked={usados.includes(i.nome)}
                    onChange={(e) => setUsados(e.target.checked ? [...usados, i.nome] : usados.filter((x) => x !== i.nome))} />
                  {i.nome}{!i.em_estoque && <small className="sem-estoque"> (sem estoque)</small>}
                </label>
              ))}
            </fieldset>
          )}
        </>
      )}

      <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
      <label>Observação — opcional<textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></label>

      <AvisosRegras disparos={disparos} />

      <button className={confirmarAlerta ? "botao alerta largo" : "botao largo"} disabled={bloqueado || salvando} onClick={salvar}>
        {bloqueado ? "Bloqueado pelas regras" : confirmarAlerta ? "Salvar mesmo assim" : "Salvar"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FormMedicao({ planta }: { planta: Planta }) {
  const [umidade, setUmidade] = useState<number | null>(null);
  const [local, setLocal] = useState<"colo" | "borda">("colo");
  const [ph, setPh] = useState("");
  const [luz, setLuz] = useState("");
  const [temp, setTemp] = useState("");
  const [salva, setSalva] = useState(false);

  const veredito = umidade !== null ? vereditoRega(planta, umidade) : null;
  const avisoPh = num(ph) !== null ? avaliarPh(planta, num(ph)!) : null;

  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<string | null>(null);

  async function salvar() {
    await salvarMedicao(db, {
      planta_id: planta.id, data_hora: new Date().toISOString(), umidade,
      ph: num(ph), luz: num(luz), temperatura: num(temp), local_sonda: local
    });
    setSalva(true);
    avisar("✔ Medição salva");
  }

  /** Lê o visor pela foto (Gemini) e preenche os campos para conferir antes de salvar. */
  async function lerPelaFoto(foto: File | undefined) {
    if (!foto) return;
    setLendo(true);
    setLeitura(null);
    try {
      const l = await lerVisor(db, foto);
      if (l.umidade !== null) setUmidade(l.umidade);
      if (l.ph !== null) setPh(String(l.ph).replace(".", ","));
      if (l.luz !== null) setLuz(String(l.luz));
      if (l.temperatura !== null) setTemp(String(l.temperatura).replace(".", ","));
      setSalva(false);
      const lidos = [l.umidade, l.ph, l.luz, l.temperatura].filter((v) => v !== null).length;
      setLeitura(`Lidos ${lidos} de 4 valores. Confira antes de salvar.${l.observacao ? ` ${l.observacao}` : ""}`);
    } catch (e) {
      setLeitura(`Não foi possível ler: ${(e as Error).message}`);
    } finally {
      setLendo(false);
    }
  }

  return (
    <div className="formulario">
      <label className="botao secundario largo escolher-foto">
        {lendo ? "Lendo o visor…" : "📷 Ler pelo visor (foto do medidor)"}
        <input type="file" accept="image/*" capture="environment" hidden disabled={lendo}
          onChange={(e) => { lerPelaFoto(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {leitura && <div className="aviso">{leitura}</div>}
      <div>
        <p className="rotulo">Umidade no medidor (1 = muito seco … 5 = muito molhado)</p>
        <div className="botoes-nivel">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={umidade === n ? "nivel ativo" : "nivel"} onClick={() => { setUmidade(n); setSalva(false); }}>{n}</button>
          ))}
        </div>
      </div>
      <fieldset className="opcoes em-linha">
        <legend>Onde a sonda foi colocada</legend>
        <label><input type="radio" checked={local === "colo"} onChange={() => setLocal("colo")} /> No colo</label>
        <label><input type="radio" checked={local === "borda"} onChange={() => setLocal("borda")} /> Na borda</label>
      </fieldset>

      {veredito && (
        <div className={`veredito ${veredito.acao}`}>
          <strong>{veredito.acao === "regar" ? "💧 REGAR" : veredito.acao === "aguardar" ? "⏳ AGUARDAR" : "❔ SEM GATILHO"}</strong>
          <span>{veredito.texto}</span>
          {local === "borda" && <small>O gatilho do protocolo é medido no colo.</small>}
        </div>
      )}

      <div className="grade-3">
        <label>pH<input inputMode="decimal" value={ph} onChange={(e) => { setPh(e.target.value); setSalva(false); }} /></label>
        <label>Luz (1–9)<input inputMode="numeric" value={luz} onChange={(e) => { setLuz(e.target.value); setSalva(false); }} /></label>
        <label>Temp. (°C)<input inputMode="decimal" value={temp} onChange={(e) => { setTemp(e.target.value); setSalva(false); }} /></label>
      </div>
      {avisoPh && <div className="aviso">{avisoPh}</div>}
      {num(luz) !== null && <p className="ajuda">A leitura de luz não é confiável sob lâmpada de LED.</p>}

      {!salva ? (
        <button className="botao largo" disabled={umidade === null && num(ph) === null && num(luz) === null && num(temp) === null} onClick={salvar}>
          Salvar medição
        </button>
      ) : (
        <div className="botoes">
          <a className="botao secundario" href={`#/planta/${planta.id}`}>Voltar à ficha</a>
          {veredito?.acao === "regar"
            ? <a className="botao" href={`#/planta/${planta.id}/registrar/rega`}>💧 Registrar rega</a>
            : <a className="botao" href="#/">Outra planta</a>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FormFoto({ planta }: { planta: Planta }) {
  const [tipo, setTipo] = useState(1);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!arquivo) return setPrevia(null);
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  async function salvar() {
    if (!arquivo) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarFoto(db, planta.id, tipo, arquivo);
      avisar("✔ Foto salva (vai para o Drive na próxima sincronização)");
      ir(`/planta/${planta.id}`);
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="formulario">
      <div className="tipos-foto">
        {Object.entries(TIPOS_FOTO).map(([n, t]) => (
          <button key={n} className={tipo === Number(n) ? "chip ativo" : "chip"} onClick={() => setTipo(Number(n))}>{n}. {t.nome}</button>
        ))}
      </div>
      <p className="ajuda">{TIPOS_FOTO[tipo].dica}</p>
      <label className="botao secundario largo escolher-foto">
        📷 {arquivo ? "Tirar outra" : "Tirar a foto"}
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </label>
      {previa && <img className="previa-foto" src={previa} alt="Prévia da foto" />}
      {erro && <div className="aviso erro">{erro}</div>}
      <button className="botao largo" disabled={!arquivo || salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar foto"}</button>
    </div>
  );
}
