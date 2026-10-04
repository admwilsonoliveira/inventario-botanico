import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { carregarSeVazio, precisaRevisao } from "./carga";
import { db } from "./db";
import { aplicarMigracoes } from "./migracoes";
import { seed } from "./seed";
import { ir, useRota } from "./rotas";
import { Lista } from "./telas/Lista";
import { Ficha } from "./telas/Ficha";
import { Editar } from "./telas/Editar";
import { Revisao } from "./telas/Revisao";
import { Etiquetas } from "./telas/Etiquetas";
import { Config } from "./telas/Config";

export function App() {
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rota = useRota();

  useEffect(() => {
    carregarSeVazio(db, seed)
      .then(async (importou) => {
        await aplicarMigracoes(db);
        // Primeira abertura: vai direto para a revisão, a menos que tenha vindo pelo QR de uma planta
        if (importou && !location.hash.startsWith("#/planta/")) ir("/revisao");
        setPronto(true);
      })
      .catch((e) => setErro(String(e)));
  }, []);

  const qtdRevisao = useLiveQuery(() => db.plantas.filter(precisaRevisao).count(), [], 0);

  if (erro) return <div className="tela"><div className="aviso erro">Erro ao abrir o banco local: {erro}</div></div>;
  if (!pronto) return <div className="tela carregando">Carregando…</div>;

  const [secao, id, acao] = rota;
  let tela;
  if (secao === "planta" && id && acao === "editar") tela = <Editar id={id} />;
  else if (secao === "planta" && id) tela = <Ficha id={id} />;
  else if (secao === "revisao") tela = <Revisao />;
  else if (secao === "etiquetas") tela = <Etiquetas />;
  else if (secao === "config") tela = <Config />;
  else tela = <Lista />;

  const atual = !secao || secao === "planta" ? "" : secao;
  const ativa = (s: string) => (atual === s ? "ativa" : "");

  return (
    <>
      <main className="tela">{tela}</main>
      <nav className="barra-nav sem-impressao">
        <a href="#/" className={ativa("")}><span>🌿</span>Plantas</a>
        <a href="#/revisao" className={ativa("revisao")}>
          <span>📝{qtdRevisao > 0 && <b className="bolinha">{qtdRevisao}</b>}</span>Revisão
        </a>
        <a href="#/etiquetas" className={ativa("etiquetas")}><span>🏷️</span>Etiquetas</a>
        <a href="#/config" className={ativa("config")}><span>⚙️</span>Config.</a>
      </nav>
    </>
  );
}
