import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Insumo } from "../types";

const CATEGORIAS: Record<string, string> = {
  npk: "Adubos (NPK)", nutricao: "Nutrição", correcao: "Correção", fitossanidade: "Pragas e doenças", estrutura: "Substrato (estrutura)"
};

function ItemInsumo({ i }: { i: Insumo }) {
  const [editando, setEditando] = useState(false);
  const [qtd, setQtd] = useState(i.quantidade === null ? "" : String(i.quantidade).replace(".", ","));
  const [unidade, setUnidade] = useState(i.unidade ?? "g");

  async function salvar() {
    const t = qtd.trim().replace(",", ".");
    const n = t === "" ? null : Number(t);
    await db.insumos.update(i.nome, {
      quantidade: n !== null && Number.isFinite(n) ? n : null,
      unidade: t === "" ? null : unidade,
      ...(n !== null && n > 0 ? { em_estoque: true } : {})
    });
    setEditando(false);
  }

  return (
    <li className={i.em_estoque ? "insumo" : "insumo sem"}>
      <label className="linha-check">
        <input type="checkbox" checked={i.em_estoque} onChange={(e) => db.insumos.update(i.nome, { em_estoque: e.target.checked })} />
        <span className="nome-insumo">
          <b>{i.nome}</b>
          <small>
            {i.em_estoque ? "em estoque" : "sem estoque"}
            {i.quantidade !== null && ` · ${String(i.quantidade).replace(".", ",")} ${i.unidade ?? ""}`}
          </small>
        </span>
      </label>
      {i.observacao && <p className="ajuda">{i.observacao}</p>}
      {!editando ? (
        <button className="link" onClick={() => setEditando(true)}>{i.quantidade === null ? "controlar quantidade" : "ajustar quantidade"}</button>
      ) : (
        <div className="linha-campo">
          <input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="quantidade" />
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} style={{ width: 90 }}>
            <option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option><option value="un">un</option>
          </select>
          <button className="botao" onClick={salvar}>Salvar</button>
        </div>
      )}
    </li>
  );
}

export function Insumos() {
  const insumos = useLiveQuery(() => db.insumos.toArray(), []);
  if (!insumos) return null;
  const grupos = Object.keys(CATEGORIAS).map((c) => [c, insumos.filter((i) => i.categoria === c)] as const);
  const outros = insumos.filter((i) => !(i.categoria in CATEGORIAS));
  return (
    <>
      <a className="voltar" href="#/config">‹ Configurações</a>
      <h1>Insumos</h1>
      <p className="ajuda">
        A IA só recomenda o que está marcado como em estoque. Com a quantidade controlada (em g ou kg),
        cada adubação com dose desconta sozinha; quando acaba, o insumo vira "sem estoque".
      </p>
      {[...grupos, ["outros", outros] as const].map(([c, lista]) => lista.length > 0 && (
        <section key={c} className="cartao">
          <h2>{CATEGORIAS[c] ?? "Outros"}</h2>
          <ul className="lista-insumos">{lista.map((i) => <ItemInsumo key={i.nome} i={i} />)}</ul>
        </section>
      ))}
    </>
  );
}
