import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import {
  confirmarParametros, confirmarRevisao, excluirDefinitivamente, reativarPlanta, removerPlanta
} from "../carga";
import { formatarData, formatarFaixa, rotuloTag } from "../formato";
import { ir, urlCompleta } from "../rotas";
import { CampoFicha, NumeroFicha, QR, Selos, nomeGrupo, useGrupos } from "../componentes";
import { apagarEvento, TIPOS_FOTO, vereditoRega } from "../registro";
import { PendenciasDaPlanta } from "./Hoje";
import { TIPOS_EVENTO } from "../types";

function Miniatura({ id }: { id: string }) {
  const arq = useLiveQuery(() => db.arquivos_fotos.get(id), [id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!arq?.miniatura) return;
    const u = URL.createObjectURL(arq.miniatura);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arq]);
  return url ? <img src={url} alt="" /> : <span className="sem-miniatura">📷</span>;
}

function FotosDaPlanta({ plantaId }: { plantaId: string }) {
  const fotos = useLiveQuery(
    () => db.fotos.where("planta_id").equals(plantaId).toArray().then((l) => l.sort((a, b) => b.data.localeCompare(a.data))),
    [plantaId], []
  );
  if (fotos.length === 0) return null;
  return (
    <section className="cartao">
      <h2>Fotos {fotos.length >= 2 && <a className="link" href={`#/planta/${plantaId}/fotos`}>ver evolução ›</a>}</h2>
      <div className="grade-fotos">
        {fotos.map((f) => {
          const conteudo = (
            <>
              <Miniatura id={f.id} />
              <span>{formatarData(f.data)} · {TIPOS_FOTO[f.tipo]?.nome ?? f.tipo}</span>
              <small>{f.arquivo_drive_id ? "no Drive" : "aguardando envio"}</small>
            </>
          );
          return f.arquivo_drive_id
            ? <a key={f.id} className="foto" href={`https://drive.google.com/file/d/${f.arquivo_drive_id}/view`} target="_blank" rel="noreferrer">{conteudo}</a>
            : <div key={f.id} className="foto">{conteudo}</div>;
        })}
      </div>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="linha-dado">
      <dt>{rotulo}</dt>
      <dd>{valor === null || valor === undefined || valor === "" ? <span className="vazio">—</span> : valor}</dd>
    </div>
  );
}

export function Ficha({ id }: { id: string }) {
  const planta = useLiveQuery(() => db.plantas.get(id), [id], null);
  const eventos = useLiveQuery(
    () => db.eventos.where("planta_id").equals(id).toArray().then((l) => l.sort((a, b) => b.data.localeCompare(a.data))),
    [id], []
  );
  const medicao = useLiveQuery(
    () => db.medicoes.where("planta_id").equals(id).toArray().then((l) => l.sort((a, b) => b.data_hora.localeCompare(a.data_hora))[0]),
    [id], undefined
  );
  const projetos = useLiveQuery(() => db.projetos.filter((pr) => pr.plantas.includes(id)).toArray(), [id], []);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const grupos = useGrupos();

  if (planta === null) return null;
  if (planta === undefined) {
    return (
      <>
        <h1>Planta não encontrada</h1>
        <p>O código <b>{id}</b> não existe neste aparelho. Ela pode ter sido excluída definitivamente.</p>
        <a className="botao largo" href="#/">Ver todas as plantas</a>
      </>
    );
  }

  const removida = planta.status === "removida";

  return (
    <>
      <a className="voltar sem-impressao" href="#/">‹ Plantas</a>
      <header className="cabecalho-ficha">
        <div>
          <NumeroFicha planta={planta} /> <span className="codigo">{planta.id}</span>
          <h1>{planta.nome_popular}</h1>
          {planta.nome_cientifico && <p className="cientifico">{planta.nome_cientifico}</p>}
          <Selos planta={planta} />
        </div>
      </header>

      {!removida && (
        <nav className="registro-rapido sem-impressao" aria-label="Registro rápido">
          <a href={`#/planta/${id}/registrar/rega`}><span>💧</span>Reguei</a>
          <a href={`#/planta/${id}/registrar/adubacao`}><span>🧪</span>Adubei</a>
          <a href={`#/planta/${id}/registrar/medicao`}><span>📏</span>Medi</a>
          <a href={`#/planta/${id}/registrar/foto`}><span>📷</span>Foto</a>
          <a href={`#/planta/${id}/registrar/outro`}><span>📝</span>Outro</a>
        </nav>
      )}
      {!removida && (
        <div className="botoes checkup sem-impressao">
          <a className="botao secundario" href={`#/escanear/${id}`}>🩺 Check-up com IA</a>
          <a className="botao secundario" href={`#/planta/${id}/consultor`}>💬 Perguntar à IA</a>
        </div>
      )}

      {medicao && (
        <section className="cartao">
          <h2>Última medição <small className="ajuda">{formatarData(medicao.data_hora)} {new Date(medicao.data_hora).toLocaleTimeString("pt-BR", { timeStyle: "short" })}</small></h2>
          <p className="medidas">
            {medicao.umidade !== null && <span>Umidade <b>{medicao.umidade}</b>{medicao.local_sonda === "borda" ? " (borda)" : ""}</span>}
            {medicao.ph !== null && <span>pH <b>{String(medicao.ph).replace(".", ",")}</b></span>}
            {medicao.luz !== null && <span>Luz <b>{medicao.luz}</b></span>}
            {medicao.temperatura !== null && <span><b>{String(medicao.temperatura).replace(".", ",")}</b> °C</span>}
          </p>
          {medicao.umidade !== null && (() => {
            const regaDepois = eventos.find((e) => e.tipo === "rega" && e.data.slice(0, 10) >= medicao.data_hora.slice(0, 10));
            if (regaDepois) return <div className="veredito pequeno aguardar"><strong>✔ Regada</strong> em {formatarData(regaDepois.data)}, depois desta medição.</div>;
            const v = vereditoRega(planta, medicao.umidade);
            return <div className={`veredito pequeno ${v.acao}`}><strong>{v.acao === "regar" ? "💧 Regar" : v.acao === "aguardar" ? "⏳ Aguardar" : "❔"}</strong> {v.texto}</div>;
          })()}
        </section>
      )}

      {planta.ficha === null && !removida && (
        <section className="cartao destaque">
          <h2>Número da ficha</h2>
          <p className="ajuda">Preencha com o número da sua planilha.</p>
          <CampoFicha planta={planta} />
        </section>
      )}

      {planta.alertas.length > 0 && (
        <section className="cartao aviso">
          <h2>⚠ Para decidir</h2>
          <ul>{planta.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <div className="botoes">
            <a className="botao secundario" href={`#/planta/${id}/editar`}>Editar dados</a>
            <button className="botao" onClick={() => confirmarRevisao(db, id)}>Resolvido</button>
          </div>
        </section>
      )}

      {planta.status === "pendente_confirmacao" && planta.alertas.length === 0 && (
        <section className="cartao aviso">
          <h2>Inclusão não confirmada</h2>
          <button className="botao largo" onClick={() => confirmarRevisao(db, id)}>Confirmar no inventário</button>
        </section>
      )}

      {planta.params_origem === "sugerido" && !removida && (
        <section className="cartao sugerido">
          <p>pH, gatilho de rega e luz desta ficha são <b>sugeridos</b>, não vieram do seu inventário.</p>
          <button className="botao secundario largo" onClick={() => confirmarParametros(db, id)}>Conferi: os parâmetros estão certos</button>
        </section>
      )}

      <section className="cartao">
        <h2>Dados</h2>
        <dl>
          <Linha rotulo="Grupo" valor={nomeGrupo(planta.grupo, grupos)} />
          <Linha rotulo="Quantidade" valor={planta.quantidade} />
          <Linha rotulo="Entrada" valor={planta.data_entrada && formatarData(planta.data_entrada)} />
          <Linha rotulo="Origem" valor={planta.origem} />
          <Linha rotulo="Zona" valor={planta.zona} />
          <Linha rotulo="pH" valor={formatarFaixa(planta.ph_min, planta.ph_max)} />
          <Linha rotulo="Regar quando o medidor marcar" valor={formatarFaixa(planta.rega_gatilho_min, planta.rega_gatilho_max)} />
          <Linha rotulo="Luz" valor={planta.luz} />
          <Linha rotulo="Vaso" valor={planta.vaso} />
          <Linha rotulo="Substrato" valor={planta.substrato} />
          <Linha rotulo="Adubação" valor={planta.adubacao} />
          <Linha rotulo="Objetivo" valor={planta.objetivo} />
          <Linha rotulo="Tags" valor={planta.tags.length > 0 && planta.tags.map((t) => <span key={t} className="tag">{rotuloTag(t)}</span>)} />
          <Linha rotulo="Proibições" valor={planta.proibicoes.length > 0 && planta.proibicoes.map((t) => <span key={t} className="tag proibida">{rotuloTag(t)}</span>)} />
        </dl>
        {planta.historico && <p className="historico">{planta.historico}</p>}
        {!removida && <a className="botao largo" href={`#/planta/${id}/editar`}>Editar ficha</a>}
      </section>

      {!removida && <PendenciasDaPlanta plantaId={id} />}
      <FotosDaPlanta plantaId={id} />

      {projetos.length > 0 && (
        <section className="cartao">
          <h2>Projetos</h2>
          {projetos.map((pr) => (
            <div key={pr.id} className="projeto">
              <a href={`#/projetos/${pr.id}`}><b>{pr.nome}</b></a> — {pr.fase_atual ?? "fase não informada"}
              {pr.proximo_marco && <p className="ajuda">Próximo marco: {pr.proximo_marco}</p>}
            </div>
          ))}
        </section>
      )}

      <section className="cartao">
        <h2>Histórico de eventos</h2>
        {eventos.length === 0 ? <p className="vazio">Nenhum evento registrado.</p> : (
          <ul className="lista-simples">
            {eventos.map((e) => (
              <li key={e.id}>
                <b>{formatarData(e.data)}</b> · {TIPOS_EVENTO[e.tipo] ?? e.tipo}
                {e.produto && <> · {e.produto}</>}
                {e.dose_g_l !== null && <> · {String(e.dose_g_l).replace(".", ",")} g/L</>}
                {e.volume_ml !== null && <> · {e.volume_ml} ml</>}
                {e.observacao && <> — {e.observacao}</>}{" "}
                <button className="link perigo" aria-label="Apagar evento"
                  onClick={() => confirm("Apagar este registro do histórico?") && apagarEvento(db, e.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao centro">
        <h2>QR desta planta</h2>
        <QR className="qr-ficha" texto={urlCompleta(planta.qr_code)} />
        <p className="ajuda">{urlCompleta(planta.qr_code)}</p>
      </section>

      <section className="cartao perigo sem-impressao">
        {!removida ? (
          <>
            <p className="ajuda">Saiu da coleção? A planta some das listas, mas o histórico fica guardado.</p>
            <button
              className="botao perigo largo"
              onClick={() => confirm(`Remover "${planta.nome_popular}" da coleção?`) && removerPlanta(db, id)}
            >Remover da coleção</button>
          </>
        ) : (
          <>
            <p>Removida em {formatarData(planta.excluida_em)}.</p>
            <button className="botao secundario largo" onClick={() => reativarPlanta(db, id)}>Voltar para a coleção</button>
            {!confirmandoExclusao ? (
              <button className="botao perigo largo" onClick={() => setConfirmandoExclusao(true)}>Excluir definitivamente</button>
            ) : (
              <div className="confirmacao">
                <p><b>Isto apaga a ficha, os eventos, as medições e as pendências desta planta. Não tem volta.</b>
                  {planta.ficha !== null && <> O nº {planta.ficha} não será usado de novo.</>}</p>
                <div className="botoes">
                  <button className="botao secundario" onClick={() => setConfirmandoExclusao(false)}>Cancelar</button>
                  <button className="botao perigo" onClick={async () => { await excluirDefinitivamente(db, id); ir("/"); }}>Apagar tudo</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
