import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import {
  confirmarParametros, confirmarRevisao, excluirDefinitivamente, reativarPlanta, removerPlanta
} from "../carga";
import { formatarData, formatarFaixa, rotuloTag } from "../formato";
import { ir, urlCompleta } from "../rotas";
import { CampoFicha, NumeroFicha, QR, Selos } from "../componentes";

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
  const pendencias = useLiveQuery(
    () => db.pendencias.where("planta_id").equals(id).toArray().then((l) => l.sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))),
    [id], []
  );
  const projetos = useLiveQuery(() => db.projetos.filter((pr) => pr.plantas.includes(id)).toArray(), [id], []);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

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
          <Linha rotulo="Grupo" valor={planta.grupo} />
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

      {pendencias.length > 0 && (
        <section className="cartao">
          <h2>Pendências</h2>
          <ul className="lista-simples">
            {pendencias.map((p) => (
              <li key={p.id} className={p.concluida_em ? "feito" : ""}>
                <b>{formatarData(p.data_prevista)}</b> {p.acao}
              </li>
            ))}
          </ul>
        </section>
      )}

      {projetos.length > 0 && (
        <section className="cartao">
          <h2>Projetos</h2>
          {projetos.map((pr) => (
            <div key={pr.id} className="projeto">
              <b>{pr.nome}</b> — {pr.fase_atual ?? "fase não informada"}
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
              <li key={e.id}><b>{formatarData(e.data)}</b> · {e.tipo} — {e.observacao}</li>
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
