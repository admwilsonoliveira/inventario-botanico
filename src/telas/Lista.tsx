import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { compararFichas } from "../formato";
import { NumeroFicha, Selos, nomeGrupo, useGrupos } from "../componentes";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Lista() {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<number | null>(null);
  const [verRemovidas, setVerRemovidas] = useState(false);
  const plantas = useLiveQuery(() => db.plantas.toArray(), []);
  const grupos = useGrupos();

  if (!plantas) return null;

  const termo = semAcento(busca.trim());
  const filtradas = plantas
    .filter((p) => (verRemovidas ? p.status === "removida" : p.status !== "removida"))
    .filter((p) => grupo === null || p.grupo === grupo)
    .filter((p) =>
      !termo ||
      semAcento(`${p.nome_popular} ${p.nome_cientifico ?? ""} ${p.ficha ?? ""} ${p.id}`).includes(termo)
    )
    .sort(compararFichas);

  const qtdRemovidas = plantas.filter((p) => p.status === "removida").length;

  return (
    <>
      <h1>Plantas</h1>
      <input
        className="busca" type="search" placeholder="Buscar por nome ou nº da ficha"
        value={busca} onChange={(e) => setBusca(e.target.value)}
      />
      <div className="chips" role="group" aria-label="Filtrar por grupo">
        <button className={grupo === null ? "chip ativo" : "chip"} onClick={() => setGrupo(null)}>Todos</button>
        {grupos.map((g) => (
          <button key={g.numero} className={grupo === g.numero ? "chip ativo" : "chip"} onClick={() => setGrupo(g.numero)}>
            {nomeGrupo(g.numero, grupos)}
          </button>
        ))}
      </div>
      {(qtdRemovidas > 0 || verRemovidas) && (
        <button className={verRemovidas ? "chip removidas ativo" : "chip removidas"} onClick={() => setVerRemovidas(!verRemovidas)}>
          {verRemovidas ? "‹ Voltar para a coleção" : `🗑 Removidas (${qtdRemovidas})`}
        </button>
      )}
      <p className="contagem">
        {filtradas.length} {filtradas.length === 1 ? "registro" : "registros"}
        {verRemovidas ? (filtradas.length === 1 ? " removido" : " removidos") : ""}
      </p>
      <ul className="lista-plantas">
        {filtradas.map((p) => (
          <li key={p.id}>
            <a href={`#/planta/${p.id}`}>
              <NumeroFicha planta={p} />
              <span className="nomes">
                <strong>{p.nome_popular}</strong>
                {p.nome_cientifico && <em>{p.nome_cientifico}</em>}
                <Selos planta={p} />
              </span>
              <span className="seta">›</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
