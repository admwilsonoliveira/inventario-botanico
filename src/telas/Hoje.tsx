import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { formatarData } from "../formato";
import {
  agruparPendencias, apagarPendencia, concluirPendencia, hojeISO, novaPendencia, type Periodo, ROTULO_PERIODO
} from "../registro";
import { ir } from "../rotas";
import { avisar } from "../aviso";
import { StatusNuvem } from "../componentes";
import { TIPOS_EVENTO, type Pendencia, type Planta } from "../types";

const ORDEM: Periodo[] = ["atrasadas", "hoje", "semana", "mes", "depois"];

function ItemPendencia({ p, planta }: { p: Pendencia; planta?: Planta }) {
  return (
    <li className="pendencia">
      <button className="marcar" aria-label="Concluir" onClick={() => { concluirPendencia(db, p.id); avisar("✔ Pendência concluída"); }}>○</button>
      <div className="texto">
        <span className="data">{formatarData(p.data_prevista)}</span>
        {planta ? <a href={`#/planta/${planta.id}`}><b>{planta.nome_popular}</b></a> : <b>Geral</b>}
        <span>{p.acao}</span>
      </div>
    </li>
  );
}

export function Hoje() {
  const pendencias = useLiveQuery(() => db.pendencias.toArray(), []);
  const plantas = useLiveQuery(() => db.plantas.toArray().then((l) => new Map(l.map((p) => [p.id, p]))), []);
  const [abertos, setAbertos] = useState<Set<Periodo>>(new Set(["atrasadas", "hoje", "semana", "mes"]));
  if (!pendencias || !plantas) return null;

  const hoje = hojeISO();
  const ativas = pendencias.filter((p) => !p.planta_id || plantas.get(p.planta_id)?.status !== "removida");
  const grupos = agruparPendencias(ativas, hoje);
  const concluidasHoje = ativas.filter((p) => p.concluida_em === hoje);

  const alternar = (k: Periodo) => {
    const s = new Set(abertos);
    if (s.has(k)) s.delete(k); else s.add(k);
    setAbertos(s);
  };

  return (
    <>
      <h1>Hoje</h1>
      <StatusNuvem />
      <div className="botoes">
        <a className="botao" href="#/pendencia/nova">+ Pendência</a>
        <a className="botao secundario" href="#/registrar/geral">📝 Evento geral</a>
      </div>

      {ORDEM.map((k) => grupos[k].length > 0 && (
        <section key={k} className={k === "atrasadas" ? "bloco atrasadas" : "bloco"}>
          <button className="titulo-bloco" onClick={() => alternar(k)}>
            {ROTULO_PERIODO[k]} <span className="qtd">{grupos[k].length}</span> <span className="abre">{abertos.has(k) ? "▾" : "▸"}</span>
          </button>
          {abertos.has(k) && (
            <ul className="lista-pendencias">
              {grupos[k].map((p) => <ItemPendencia key={p.id} p={p} planta={p.planta_id ? plantas.get(p.planta_id) : undefined} />)}
            </ul>
          )}
        </section>
      ))}
      {ORDEM.every((k) => grupos[k].length === 0) && <p className="ok">✔ Nenhuma pendência em aberto.</p>}

      {concluidasHoje.length > 0 && (
        <section className="bloco">
          <h2 className="titulo-secao">Concluídas hoje</h2>
          <ul className="lista-simples">
            {concluidasHoje.map((p) => (
              <li key={p.id} className="feito">
                {p.planta_id ? plantas.get(p.planta_id)?.nome_popular : "Geral"} — {p.acao}{" "}
                <button className="link" onClick={() => concluirPendencia(db, p.id, false)}>desfazer</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <a className="botao secundario largo" href="#/historico">Histórico geral de eventos</a>
    </>
  );
}

export function NovaPendencia({ plantaId }: { plantaId: string | null }) {
  const plantas = useLiveQuery(() => db.plantas.filter((p) => p.status !== "removida").toArray()
    .then((l) => l.sort((a, b) => a.nome_popular.localeCompare(b.nome_popular, "pt-BR"))), []);
  const [planta, setPlanta] = useState(plantaId ?? "");
  const [data, setData] = useState(hojeISO());
  const [soMes, setSoMes] = useState(false);
  const [acao, setAcao] = useState("");
  const voltar = plantaId ? `/planta/${plantaId}` : "/hoje";

  async function salvar() {
    if (!acao.trim()) return avisar("Escreva o que precisa ser feito.");
    await novaPendencia(db, { planta_id: planta || null, data_prevista: soMes ? data.slice(0, 7) : data, acao: acao.trim() });
    avisar("✔ Pendência criada");
    ir(voltar);
  }

  return (
    <>
      <a className="voltar" href={`#${voltar}`}>‹ Voltar</a>
      <h1>Nova pendência</h1>
      <div className="formulario">
        <label>O que fazer<textarea rows={3} value={acao} onChange={(e) => setAcao(e.target.value)} placeholder="ex.: Transplantar para vaso de 4 L" /></label>
        <label>Planta
          <select value={planta} onChange={(e) => setPlanta(e.target.value)}>
            <option value="">Geral (sem planta)</option>
            {plantas?.map((p) => <option key={p.id} value={p.id}>{p.nome_popular}</option>)}
          </select>
        </label>
        <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        <label className="linha-check"><input type="checkbox" checked={soMes} onChange={(e) => setSoMes(e.target.checked)} /> Só o mês (sem dia definido)</label>
        <button className="botao largo" onClick={salvar}>Salvar</button>
      </div>
    </>
  );
}

/** Lista de pendências da planta, usada na ficha. */
export function PendenciasDaPlanta({ plantaId }: { plantaId: string }) {
  const lista = useLiveQuery(
    () => db.pendencias.where("planta_id").equals(plantaId).toArray().then((l) => l.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))),
    [plantaId], []
  );
  const abertas = lista.filter((p) => !p.concluida_em);
  const feitas = lista.filter((p) => p.concluida_em);
  return (
    <section className="cartao">
      <h2>Pendências</h2>
      {abertas.length === 0 && <p className="vazio">Nenhuma em aberto.</p>}
      <ul className="lista-pendencias">
        {abertas.map((p) => <ItemPendencia key={p.id} p={p} />)}
      </ul>
      {feitas.length > 0 && (
        <details>
          <summary>Concluídas ({feitas.length})</summary>
          <ul className="lista-simples">
            {feitas.map((p) => (
              <li key={p.id} className="feito">
                {formatarData(p.data_prevista)} — {p.acao} <small>(feito em {formatarData(p.concluida_em)})</small>{" "}
                <button className="link" onClick={() => concluirPendencia(db, p.id, false)}>reabrir</button>{" "}
                <button className="link perigo" onClick={() => confirm("Apagar esta pendência?") && apagarPendencia(db, p.id)}>apagar</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <a className="botao secundario largo" href={`#/pendencia/nova/${plantaId}`}>+ Pendência</a>
    </section>
  );
}

export function Historico() {
  const [soGerais, setSoGerais] = useState(false);
  const eventos = useLiveQuery(() => db.eventos.orderBy("data").reverse().limit(300).toArray(), []);
  const plantas = useLiveQuery(() => db.plantas.toArray().then((l) => new Map(l.map((p) => [p.id, p.nome_popular]))), []);
  if (!eventos || !plantas) return null;
  const lista = soGerais ? eventos.filter((e) => !e.planta_id) : eventos;
  return (
    <>
      <a className="voltar" href="#/hoje">‹ Hoje</a>
      <h1>Histórico geral</h1>
      <div className="chips">
        <button className={!soGerais ? "chip ativo" : "chip"} onClick={() => setSoGerais(false)}>Todos</button>
        <button className={soGerais ? "chip ativo" : "chip"} onClick={() => setSoGerais(true)}>Só eventos gerais</button>
      </div>
      <ul className="lista-simples historico-geral">
        {lista.map((e) => (
          <li key={e.id}>
            <b>{formatarData(e.data)}</b> · {TIPOS_EVENTO[e.tipo] ?? e.tipo}
            {e.planta_id ? <> · <a href={`#/planta/${e.planta_id}`}>{plantas.get(e.planta_id) ?? e.planta_id}</a></> : " · geral"}
            {e.produto && <> · {e.produto}</>}
            {e.observacao && <div className="ajuda">{e.observacao}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
