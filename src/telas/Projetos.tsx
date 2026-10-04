import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { anotarExclusao, db } from "../db";
import { avancarFase, registrarMarco } from "../evolucao";
import { formatarData } from "../formato";
import { hojeISO } from "../registro";
import { ir } from "../rotas";
import { avisar } from "../aviso";
import type { Planta, Projeto } from "../types";

export function Projetos() {
  const projetos = useLiveQuery(() => db.projetos.toArray(), []);
  const plantas = useLiveQuery(() => db.plantas.toArray().then((l) => new Map(l.map((p) => [p.id, p]))), []);
  const [novo, setNovo] = useState("");
  if (!projetos || !plantas) return null;

  async function criar() {
    if (!novo.trim()) return;
    const id = `PR${crypto.randomUUID().slice(0, 6)}`;
    await db.projetos.add({ id, nome: novo.trim(), plantas: [], fase_atual: "Planejamento", proximo_marco: null, marcos: [] });
    setNovo("");
    ir(`/projetos/${id}`);
  }

  return (
    <>
      <a className="voltar" href="#/">‹ Plantas</a>
      <h1>📐 Projetos</h1>
      {projetos.map((p) => (
        <a key={p.id} className="cartao projeto-cartao" href={`#/projetos/${p.id}`}>
          <strong>{p.nome}</strong>
          <span className="selo">{p.fase_atual ?? "sem fase"}</span>
          {p.proximo_marco && <p className="ajuda">Próximo: {p.proximo_marco}</p>}
          {p.plantas.length > 0 && <p className="ajuda">{p.plantas.map((id) => plantas.get(id)?.nome_popular ?? id).join(", ")}</p>}
        </a>
      ))}
      <div className="cartao formulario">
        <label>Novo projeto<input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="ex.: Bonsai de jabuticaba" /></label>
        <button className="botao largo" disabled={!novo.trim()} onClick={criar}>Criar projeto</button>
      </div>
    </>
  );
}

export function ProjetoDetalhe({ id }: { id: string }) {
  const projeto = useLiveQuery(() => db.projetos.get(id), [id], null);
  const todas = useLiveQuery(() => db.plantas.filter((p) => p.status !== "removida").toArray()
    .then((l) => l.sort((a, b) => a.nome_popular.localeCompare(b.nome_popular, "pt-BR"))), [], [] as Planta[]);
  const [acao, setAcao] = useState<"fase" | "marco" | "editar" | null>(null);
  const [texto, setTexto] = useState("");
  const [proximo, setProximo] = useState("");
  const [nome, setNome] = useState("");
  const [incluir, setIncluir] = useState("");

  if (projeto === null) return null;
  if (!projeto) return <p>Projeto não encontrado.</p>;
  const p = projeto;
  const nomes = new Map(todas.map((x) => [x.id, x.nome_popular]));

  function abrir(a: "fase" | "marco" | "editar") {
    setAcao(a);
    setTexto(a === "editar" ? p.fase_atual ?? "" : "");
    setProximo(p.proximo_marco ?? "");
    setNome(p.nome);
  }

  async function salvar() {
    const hoje = hojeISO();
    let novo: Projeto = p;
    if (acao === "fase" && texto.trim()) novo = avancarFase(p, texto.trim(), proximo.trim() || null, hoje);
    else if (acao === "marco" && texto.trim()) novo = registrarMarco(p, texto.trim(), proximo.trim() || null, hoje);
    else if (acao === "editar") novo = { ...p, nome: nome.trim() || p.nome, fase_atual: texto.trim() || null, proximo_marco: proximo.trim() || null };
    else return;
    await db.projetos.put(novo);
    // o marco também aparece no histórico de cada planta do projeto
    if (acao !== "editar") {
      for (const pid of p.plantas) {
        await db.eventos.add({
          id: crypto.randomUUID(), planta_id: pid, data: hoje, tipo: "marco", produto: null, dose_g_l: null, volume_ml: null,
          observacao: `${p.nome}: ${novo.marcos![novo.marcos!.length - 1].texto}`
        });
      }
    }
    setAcao(null);
    avisar("✔ Projeto atualizado");
  }

  async function apagar() {
    if (!confirm(`Apagar o projeto "${p.nome}"? As plantas continuam no inventário.`)) return;
    await db.transaction("rw", db.projetos, db.apagados, async () => {
      await db.projetos.delete(p.id);
      await anotarExclusao(db, "projetos", p.id);
    });
    ir("/projetos");
  }

  return (
    <>
      <a className="voltar" href="#/projetos">‹ Projetos</a>
      <h1>{p.nome}</h1>
      <section className="cartao">
        <dl>
          <div className="linha-dado"><dt>Fase atual</dt><dd>{p.fase_atual ?? "—"}</dd></div>
          <div className="linha-dado"><dt>Próximo marco</dt><dd>{p.proximo_marco ?? "—"}</dd></div>
        </dl>
        {acao === null ? (
          <div className="botoes tres">
            <button className="botao" onClick={() => abrir("fase")}>Avançar fase</button>
            <button className="botao secundario" onClick={() => abrir("marco")}>Marco atingido</button>
            <button className="botao secundario" onClick={() => abrir("editar")}>Editar</button>
          </div>
        ) : (
          <div className="formulario">
            {acao === "editar" && <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} /></label>}
            <label>{acao === "fase" ? "Nova fase" : acao === "marco" ? "O que foi feito" : "Fase atual"}
              <input value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
            </label>
            <label>Próximo marco<input value={proximo} onChange={(e) => setProximo(e.target.value)} /></label>
            <div className="botoes">
              <button className="botao secundario" onClick={() => setAcao(null)}>Cancelar</button>
              <button className="botao" onClick={salvar}>Salvar</button>
            </div>
          </div>
        )}
      </section>

      <section className="cartao">
        <h2>Plantas</h2>
        {p.plantas.length === 0 && <p className="vazio">Nenhuma planta ainda.</p>}
        <ul className="lista-simples links">
          {p.plantas.map((pid) => (
            <li key={pid}>
              <a href={`#/planta/${pid}`}>{nomes.get(pid) ?? pid}</a>
              <button className="link perigo" onClick={() => db.projetos.update(p.id, { plantas: p.plantas.filter((x) => x !== pid) })}>tirar</button>
            </li>
          ))}
        </ul>
        <div className="linha-campo">
          <select value={incluir} onChange={(e) => setIncluir(e.target.value)} style={{ flex: 1 }}>
            <option value="">Incluir planta…</option>
            {todas.filter((x) => !p.plantas.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.nome_popular}</option>)}
          </select>
          <button className="botao" disabled={!incluir} onClick={async () => { await db.projetos.update(p.id, { plantas: [...p.plantas, incluir] }); setIncluir(""); }}>+</button>
        </div>
      </section>

      <section className="cartao">
        <h2>Histórico</h2>
        {(p.marcos ?? []).length === 0 ? <p className="vazio">Nenhum marco registrado ainda.</p> : (
          <ul className="linha-tempo">
            {[...(p.marcos ?? [])].reverse().map((m, i) => <li key={i}><b>{formatarData(m.data)}</b> {m.texto}</li>)}
          </ul>
        )}
      </section>

      <button className="botao perigo largo" onClick={apagar}>Apagar projeto</button>
    </>
  );
}
