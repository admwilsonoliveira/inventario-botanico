import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { criarPlanta } from "../carga";
import { emPropagacao, metodoDe, type Metodo, porEspecie, porMetodo, ROTULO_METODO, taxasDeSucesso } from "../evolucao";
import { formatarData } from "../formato";
import { hojeISO } from "../registro";
import { avisar } from "../aviso";
import { ir } from "../rotas";
import type { Planta } from "../types";

const pct = (t: number) => `${Math.round(t * 100)}%`;
const dias = (desde: string | null) => (desde && /^\d{4}-\d{2}-\d{2}/.test(desde) ? Math.round((Date.parse(hojeISO()) - Date.parse(desde.slice(0, 10))) / 86_400_000) : null);

function Lote({ p }: { p: Planta }) {
  const [aberto, setAberto] = useState(false);
  const tentadas = p.quantidade ?? 1;
  const [pegaram, setPegaram] = useState(String(tentadas));
  const d = dias(p.data_entrada);

  async function registrar() {
    const n = Math.max(0, Math.min(tentadas, Math.round(Number(pegaram) || 0)));
    const hoje = hojeISO();
    await db.eventos.add({
      id: crypto.randomUUID(), planta_id: p.id, data: hoje, tipo: "propagacao_resultado",
      produto: p.origem ?? ROTULO_METODO[metodoDe(p.origem)], dose_g_l: null, volume_ml: null,
      tentadas, pegaram: n, especie: p.nome_cientifico,
      observacao: `Propagação: pegaram ${n} de ${tentadas}.`
    });
    if (n > 0) {
      await db.plantas.update(p.id, { status: "ativa", quantidade: n, tags: p.tags.filter((t) => t !== "propagacao") });
      avisar(`✔ ${n} de ${tentadas} pegaram. O lote agora é planta ativa.`);
    } else {
      await db.plantas.update(p.id, { status: "removida", excluida_em: new Date().toISOString() });
      avisar("Registrado: nenhuma pegou. O lote foi marcado como removido.");
    }
    setAberto(false);
  }

  return (
    <article className="cartao lote">
      <a href={`#/planta/${p.id}`} className="titulo-cartao"><strong>{p.nome_popular}</strong></a>
      <p className="ajuda">
        {ROTULO_METODO[metodoDe(p.origem)]}{p.origem ? ` (${p.origem})` : ""} · {tentadas} {tentadas === 1 ? "unidade" : "unidades"}
        {p.data_entrada && <> · desde {formatarData(p.data_entrada)}{d !== null && ` (${d} dias)`}</>}
      </p>
      {!aberto ? (
        <button className="botao secundario largo" onClick={() => setAberto(true)}>Registrar resultado</button>
      ) : (
        <div className="formulario">
          <label>Quantas pegaram (de {tentadas})?
            <input inputMode="numeric" value={pegaram} onChange={(e) => setPegaram(e.target.value)} />
          </label>
          <div className="botoes">
            <button className="botao secundario" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="botao" onClick={registrar}>Salvar</button>
          </div>
        </div>
      )}
    </article>
  );
}

function NovaPropagacao({ aoFechar }: { aoFechar: () => void }) {
  const maes = useLiveQuery(() => db.plantas.filter((p) => p.status !== "removida" && !emPropagacao(p)).toArray()
    .then((l) => l.sort((a, b) => a.nome_popular.localeCompare(b.nome_popular, "pt-BR"))), [], [] as Planta[]);
  const [maeId, setMaeId] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("estaca");
  const [qtd, setQtd] = useState("1");
  const [nome, setNome] = useState("");
  const mae = maes.find((m) => m.id === maeId);
  const nomePadrao = mae ? `${ROTULO_METODO[metodo] === "Estaquia" ? "Estacas" : ROTULO_METODO[metodo]} de ${mae.nome_popular}` : "";

  async function criar() {
    const n = Math.max(1, Math.round(Number(qtd) || 1));
    const rotulo = { estaca: "Estaca", semente: "Semente", alporquia: "Alporquia", divisao: "Divisão", outro: "Propagação" }[metodo];
    const id = await criarPlanta(db, {
      nome_popular: nome.trim() || nomePadrao || "Propagação",
      nome_cientifico: mae?.nome_cientifico ?? null,
      grupo: mae?.grupo ?? null,
      quantidade: n,
      status: "em_propagacao",
      tags: ["propagacao"],
      origem: mae ? `${rotulo} da ficha nº ${mae.ficha ?? "—"} (${mae.nome_popular})` : rotulo,
      // parâmetros da planta-mãe (mesma espécie), quando houver
      ph_min: mae?.ph_min ?? null, ph_max: mae?.ph_max ?? null,
      rega_gatilho_min: mae?.rega_gatilho_min ?? null, rega_gatilho_max: mae?.rega_gatilho_max ?? null,
      proibicoes: mae?.proibicoes ?? [],
      params_origem: mae?.params_origem ?? "inventario"
    });
    await db.eventos.add({
      id: crypto.randomUUID(), planta_id: id, data: hojeISO(), tipo: "propagacao", produto: null, dose_g_l: null, volume_ml: null,
      observacao: `${n} ${rotulo.toLowerCase()}${n > 1 ? "s" : ""} iniciada${n > 1 ? "s" : ""}.`
    });
    avisar("✔ Propagação registrada com a próxima ficha");
    aoFechar();
    ir(`/planta/${id}`);
  }

  return (
    <div className="cartao formulario">
      <label>Planta-mãe
        <select value={maeId} onChange={(e) => setMaeId(e.target.value)}>
          <option value="">— nenhuma / de fora —</option>
          {maes.map((m) => <option key={m.id} value={m.id}>{m.nome_popular}</option>)}
        </select>
      </label>
      <label>Método
        <select value={metodo} onChange={(e) => setMetodo(e.target.value as Metodo)}>
          {(Object.keys(ROTULO_METODO) as Metodo[]).map((m) => <option key={m} value={m}>{ROTULO_METODO[m]}</option>)}
        </select>
      </label>
      <label>Quantidade<input inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} /></label>
      <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={nomePadrao || "ex.: Estacas de alecrim"} /></label>
      <div className="botoes">
        <button className="botao secundario" onClick={aoFechar}>Cancelar</button>
        <button className="botao" disabled={!nome.trim() && !nomePadrao} onClick={criar}>Começar</button>
      </div>
    </div>
  );
}

export function Propagacao() {
  const plantas = useLiveQuery(() => db.plantas.toArray(), []);
  const eventos = useLiveQuery(() => db.eventos.filter((e) => e.tipo === "propagacao_resultado").toArray(), []);
  const [novo, setNovo] = useState(false);
  if (!plantas || !eventos) return null;
  const lotes = plantas.filter(emPropagacao);
  const metodo = taxasDeSucesso(eventos, porMetodo);
  const especie = taxasDeSucesso(eventos, porEspecie);

  return (
    <>
      <a className="voltar" href="#/">‹ Plantas</a>
      <h1>🌱 Propagação</h1>
      {novo ? <NovaPropagacao aoFechar={() => setNovo(false)} /> : <button className="botao largo" onClick={() => setNovo(true)}>+ Nova propagação</button>}

      <h2 className="titulo-secao">Em andamento ({lotes.length})</h2>
      {lotes.length === 0 && <p className="vazio">Nada em propagação agora.</p>}
      {lotes.map((p) => <Lote key={p.id} p={p} />)}

      <h2 className="titulo-secao">Taxa de sucesso</h2>
      {metodo.length === 0 ? (
        <p className="ajuda">Aparece aqui depois do primeiro resultado registrado.</p>
      ) : (
        <section className="cartao">
          <h3>Por método</h3>
          {metodo.map((t) => (
            <div key={t.chave} className="barra-taxa">
              <span>{ROTULO_METODO[t.chave as Metodo] ?? t.chave}</span>
              <div className="trilho"><div className="cheio" style={{ width: pct(t.taxa) }} /></div>
              <b>{pct(t.taxa)}</b> <small>({t.pegaram}/{t.tentadas})</small>
            </div>
          ))}
          <h3>Por espécie</h3>
          {especie.map((t) => (
            <div key={t.chave} className="barra-taxa">
              <span><em>{t.chave}</em></span>
              <div className="trilho"><div className="cheio" style={{ width: pct(t.taxa) }} /></div>
              <b>{pct(t.taxa)}</b> <small>({t.pegaram}/{t.tentadas})</small>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
