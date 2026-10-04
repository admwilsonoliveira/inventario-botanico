import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { compararFichas } from "../formato";
import { NumeroFicha, Selos, nomeGrupo, useGrupos } from "../componentes";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const SEM_ZONA = "__sem_zona__";

/** Estado que sobrevive à ida e volta da ficha (guardado na sessão do navegador). */
function useLembrado<T>(chave: string, inicial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = sessionStorage.getItem(chave);
      return s === null ? inicial : (JSON.parse(s) as T);
    } catch {
      return inicial;
    }
  });
  const gravar = (novo: T) => {
    setV(novo);
    try { sessionStorage.setItem(chave, JSON.stringify(novo)); } catch { /* sem armazenamento: só não lembra */ }
  };
  return [v, gravar];
}

export function Lista() {
  const [busca, setBusca] = useLembrado("lista-busca", "");
  const [modo, setModo] = useLembrado<"grupo" | "zona">("lista-modo", "grupo");
  const [grupo, setGrupo] = useLembrado<number | null>("lista-grupo", null);
  const [zona, setZona] = useLembrado<string | null>("lista-zona", null);
  const [verRemovidas, setVerRemovidas] = useState(false);
  const plantas = useLiveQuery(() => db.plantas.toArray(), []);
  const grupos = useGrupos();

  if (!plantas) return null;

  const termo = semAcento(busca.trim());
  const filtradas = plantas
    .filter((p) => (verRemovidas ? p.status === "removida" : p.status !== "removida"))
    .filter((p) => modo !== "grupo" || grupo === null || p.grupo === grupo)
    .filter((p) => modo !== "zona" || zona === null || (zona === SEM_ZONA ? !p.zona : p.zona === zona))
    .filter((p) =>
      !termo ||
      semAcento(`${p.nome_popular} ${p.nome_cientifico ?? ""} ${p.ficha ?? ""} ${p.id}`).includes(termo)
    )
    .sort(compararFichas);

  const zonas = [...new Set(plantas.filter((p) => p.status !== "removida" && p.zona).map((p) => p.zona!))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const qtdRemovidas = plantas.filter((p) => p.status === "removida").length;

  return (
    <>
      <h1>Plantas</h1>
      <input
        className="busca" type="search" placeholder="Buscar por nome ou nº da ficha"
        value={busca} onChange={(e) => setBusca(e.target.value)}
      />
      <div className="alternador" role="group" aria-label="Organizar por">
        <button className={modo === "grupo" ? "ativo" : ""} onClick={() => setModo("grupo")}>Por grupo</button>
        <button className={modo === "zona" ? "ativo" : ""} onClick={() => setModo("zona")}>Por zona</button>
      </div>
      {modo === "grupo" ? (
        <div className="chips" role="group" aria-label="Filtrar por grupo">
          <button className={grupo === null ? "chip ativo" : "chip"} onClick={() => setGrupo(null)}>Todos</button>
          {grupos.map((g) => (
            <button key={g.numero} className={grupo === g.numero ? "chip ativo" : "chip"} onClick={() => setGrupo(g.numero)}>
              {nomeGrupo(g.numero, grupos)}
            </button>
          ))}
        </div>
      ) : (
        <div className="chips" role="group" aria-label="Filtrar por zona">
          <button className={zona === null ? "chip ativo" : "chip"} onClick={() => setZona(null)}>Todas</button>
          {zonas.map((z) => (
            <button key={z} className={zona === z ? "chip ativo" : "chip"} onClick={() => setZona(z)}>{z}</button>
          ))}
          <button className={zona === SEM_ZONA ? "chip ativo" : "chip"} onClick={() => setZona(SEM_ZONA)}>Sem zona</button>
        </div>
      )}
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
