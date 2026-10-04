import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { carregarSeVazio, precisaRevisao } from "./carga";
import { db } from "./db";
import { aplicarMigracoes } from "./migracoes";
import { seed } from "./seed";
import { ir, useRota } from "./rotas";
import { iniciarSyncAutomatico } from "./sync";
import { agruparPendencias, hojeISO } from "./registro";
import { Aviso } from "./aviso";
import { Lista } from "./telas/Lista";
import { Ficha } from "./telas/Ficha";
import { Editar } from "./telas/Editar";
import { Revisao } from "./telas/Revisao";
import { Etiquetas } from "./telas/Etiquetas";
import { Config } from "./telas/Config";
import { Registrar, type TipoRegistro } from "./telas/Registrar";
import { Historico, Hoje, NovaPendencia } from "./telas/Hoje";
import { Escanear } from "./telas/Escanear";
import { Desejos, NovaPlanta } from "./telas/Desejos";
import { Insumos } from "./telas/Insumos";
import { ProjetoDetalhe, Projetos } from "./telas/Projetos";
import { Propagacao } from "./telas/Propagacao";
import { Zonas } from "./telas/Zonas";
import { Consultor } from "./telas/Consultor";
import { Evolucao } from "./telas/Evolucao";

const TIPOS_REGISTRO: TipoRegistro[] = ["rega", "adubacao", "medicao", "foto", "outro"];

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
        iniciarSyncAutomatico(db);
      })
      .catch((e) => setErro(String(e)));
  }, []);

  const qtdRevisao = useLiveQuery(() => db.plantas.filter(precisaRevisao).count(), [], 0);
  const qtdHoje = useLiveQuery(async () => {
    const removidas = new Set((await db.plantas.where("status").equals("removida").primaryKeys()) as string[]);
    const g = agruparPendencias((await db.pendencias.toArray()).filter((p) => !p.planta_id || !removidas.has(p.planta_id)), hojeISO());
    return g.atrasadas.length + g.hoje.length;
  }, [], 0);

  if (erro) return <div className="tela"><div className="aviso erro">Erro ao abrir o banco local: {erro}</div></div>;
  if (!pronto) return <div className="tela carregando">Carregando…</div>;

  const [secao, id, acao, tipo, extra] = rota;
  let tela;
  if (secao === "planta" && id === "nova") tela = <NovaPlanta />;
  else if (secao === "planta" && id && acao === "editar") tela = <Editar id={id} />;
  else if (secao === "planta" && id && acao === "consultor") tela = <Consultor key={id} plantaId={id} />;
  else if (secao === "planta" && id && acao === "fotos") tela = <Evolucao key={id} plantaId={id} />;
  else if (secao === "planta" && id && acao === "registrar" && TIPOS_REGISTRO.includes(tipo as TipoRegistro)) {
    tela = <Registrar key={`${id}-${tipo}-${extra ?? ""}`} plantaId={id} tipo={tipo as TipoRegistro} tipoInicial={extra} />;
  } else if (secao === "planta" && id) tela = <Ficha id={id} />;
  else if (secao === "registrar") tela = <Registrar key={acao ?? "geral"} plantaId={null} tipo="outro" tipoInicial={acao} />;
  else if (secao === "pendencia" && id === "nova") tela = <NovaPendencia plantaId={acao ?? null} />;
  else if (secao === "escanear") tela = <Escanear key={id ?? "novo"} plantaId={id ?? null} />;
  else if (secao === "desejos") tela = <Desejos />;
  else if (secao === "insumos") tela = <Insumos />;
  else if (secao === "projetos" && id) tela = <ProjetoDetalhe key={id} id={id} />;
  else if (secao === "projetos") tela = <Projetos />;
  else if (secao === "propagacao") tela = <Propagacao />;
  else if (secao === "zonas") tela = <Zonas />;
  else if (secao === "hoje") tela = <Hoje />;
  else if (secao === "historico") tela = <Historico />;
  else if (secao === "revisao") tela = <Revisao />;
  else if (secao === "etiquetas") tela = <Etiquetas />;
  else if (secao === "config") tela = <Config />;
  else tela = <Lista />;

  const atual = !secao || secao === "planta" || ["desejos", "projetos", "propagacao", "zonas"].includes(secao) ? "" : ["registrar", "pendencia", "historico"].includes(secao) ? "hoje" : secao === "etiquetas" || secao === "insumos" ? "config" : secao;
  const ativa = (s: string) => (atual === s ? "ativa" : "");

  return (
    <>
      <main className="tela">{tela}</main>
      <Aviso />
      <nav className="barra-nav sem-impressao">
        <a href="#/" className={ativa("")}><span>🌿</span>Plantas</a>
        <a href="#/hoje" className={ativa("hoje")}>
          <span>📅{qtdHoje > 0 && <b className="bolinha">{qtdHoje}</b>}</span>Hoje
        </a>
        <a href="#/escanear" className={ativa("escanear")}><span>📷</span>Escanear</a>
        <a href="#/revisao" className={ativa("revisao")}>
          <span>📝{qtdRevisao > 0 && <b className="bolinha">{qtdRevisao}</b>}</span>Revisão
        </a>
        <a href="#/config" className={ativa("config")}><span>⚙️</span>Config.</a>
      </nav>
    </>
  );
}
