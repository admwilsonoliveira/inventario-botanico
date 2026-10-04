import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { compararFichas } from "../formato";
import { urlCompleta } from "../rotas";
import { QR } from "../componentes";
import type { Planta } from "../types";

// Folha A4 com 24 etiquetas: 3 colunas × 8 linhas de 70 × 37,1 mm (modelo comum de etiqueta adesiva A4).
const POR_FOLHA = 24;

function Etiqueta({ p }: { p: Planta }) {
  return (
    <div className="etiqueta">
      <QR className="etiqueta-qr" texto={urlCompleta(p.qr_code)} />
      <div className="etiqueta-texto">
        <div className="etiqueta-num">{p.ficha === null ? "nº —" : `nº ${p.ficha}`}</div>
        <div className="etiqueta-nome">{p.nome_popular}</div>
        {p.nome_cientifico && <div className="etiqueta-cient">{p.nome_cientifico}</div>}
        <div className="etiqueta-id">{p.id}{p.grupo ? ` · G${p.grupo}` : ""}</div>
      </div>
    </div>
  );
}

export function Etiquetas() {
  const plantas = useLiveQuery(
    () => db.plantas.filter((p) => p.status !== "removida").toArray().then((l) => l.sort(compararFichas)),
    []
  );
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());
  const [pular, setPular] = useState(0);
  const [verLista, setVerLista] = useState(false);

  if (!plantas) return null;
  const escolhidas = plantas.filter((p) => !desmarcadas.has(p.id));

  // posições vazias no começo (para aproveitar folha já usada) + etiquetas, divididas em folhas de 24
  const casas: (Planta | null)[] = [...Array(pular).fill(null), ...escolhidas];
  const folhas: (Planta | null)[][] = [];
  for (let i = 0; i < casas.length; i += POR_FOLHA) folhas.push(casas.slice(i, i + POR_FOLHA));

  const alternar = (id: string) => {
    const s = new Set(desmarcadas);
    if (s.has(id)) s.delete(id); else s.add(id);
    setDesmarcadas(s);
  };

  return (
    <>
      <div className="sem-impressao">
        <h1>Etiquetas QR</h1>
        <p className="ajuda">
          Folha A4 com 24 etiquetas (3 × 8, 70 × 37 mm). Ao imprimir, escolha <b>tamanho A4</b>,
          <b> margens: nenhuma</b> e <b>escala 100%</b>. Imprima pelo app publicado: o QR leva ao endereço de onde ele foi aberto.
        </p>
        <div className="cartao">
          <p><b>{escolhidas.length}</b> de {plantas.length} plantas · {folhas.length} {folhas.length === 1 ? "folha" : "folhas"}</p>
          <label className="linha-campo">Pular as primeiras
            <input type="number" min={0} max={POR_FOLHA - 1} value={pular}
              onChange={(e) => setPular(Math.max(0, Math.min(POR_FOLHA - 1, Number(e.target.value) || 0)))} />
            etiquetas (folha já usada)
          </label>
          <button className="botao secundario largo" onClick={() => setVerLista(!verLista)}>
            {verLista ? "Fechar a escolha" : "Escolher quais imprimir"}
          </button>
          {verLista && (
            <>
              <div className="botoes">
                <button className="botao secundario" onClick={() => setDesmarcadas(new Set())}>Todas</button>
                <button className="botao secundario" onClick={() => setDesmarcadas(new Set(plantas.map((p) => p.id)))}>Nenhuma</button>
              </div>
              <ul className="lista-marcar">
                {plantas.map((p) => (
                  <li key={p.id}>
                    <label>
                      <input type="checkbox" checked={!desmarcadas.has(p.id)} onChange={() => alternar(p.id)} />
                      {p.ficha === null ? "nº —" : `nº ${p.ficha}`} · {p.nome_popular}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="botao largo" onClick={() => window.print()} disabled={escolhidas.length === 0}>Imprimir</button>
        </div>
        <h2 className="titulo-secao">Prévia</h2>
      </div>
      <div className="folhas">
        {folhas.map((folha, i) => (
          <div className="folha-a4" key={i}>
            {folha.map((p, j) => (p ? <Etiqueta key={p.id} p={p} /> : <div key={`v${j}`} className="etiqueta vazia" />))}
          </div>
        ))}
      </div>
    </>
  );
}
