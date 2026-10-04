import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, lerMeta } from "../db";
import { confirmarRevisao, numerarPendentes, planejarNumeracao, precisaRevisao, removerPlanta } from "../carga";
import { avisar } from "../aviso";
import type { Planta } from "../types";
import { compararFichas } from "../formato";
import { CampoFicha, NumeroFicha } from "../componentes";
import { STATUS_ROTULO } from "../types";

/** Numera de uma vez todas as fichas pendentes, com confirmação mostrando o que vai acontecer. */
function NumerarTodas({ plantas, excluidas }: { plantas: Planta[]; excluidas: number[] }) {
  const [confirmando, setConfirmando] = useState(false);
  const plano = planejarNumeracao(plantas, excluidas);
  const nomes = new Map(plantas.map((p) => [p.id, p.nome_popular]));
  const faixa = (() => {
    const ns = plano.map((p) => p.ficha);
    return ns.length ? `nº ${Math.min(...ns)} a nº ${Math.max(...ns)}` : "";
  })();

  async function aplicar() {
    const qtd = await numerarPendentes(db);
    setConfirmando(false);
    avisar(`✔ ${qtd} fichas numeradas`);
  }

  if (!confirmando) {
    return <button className="botao largo" onClick={() => setConfirmando(true)}>🔢 Numerar todas automaticamente ({plano.length})</button>;
  }
  return (
    <div className="cartao destaque">
      <p>
        <b>{plano.length} fichas</b> vão receber os números livres ({faixa}), em ordem de grupo.
        Números já usados e de fichas excluídas ficam de fora. <b>Os números não vão bater com a planilha antiga.</b>
      </p>
      <details>
        <summary>Ver como fica</summary>
        <ul className="lista-simples">
          {plano.map((p) => <li key={p.id}>nº {p.ficha} — {nomes.get(p.id)}</li>)}
        </ul>
      </details>
      <p className="ajuda">Faça isto em um aparelho só; o outro recebe pela sincronização.</p>
      <div className="botoes">
        <button className="botao secundario" onClick={() => setConfirmando(false)}>Cancelar</button>
        <button className="botao" onClick={aplicar}>Numerar</button>
      </div>
    </div>
  );
}

export function Revisao() {
  const plantas = useLiveQuery(() => db.plantas.toArray().then((l) => l.sort(compararFichas)), []);
  const obsNumeracao = useLiveQuery(() => lerMeta<string | null>(db, "observacao_numeracao", null), []);
  const excluidas = useLiveQuery(() => lerMeta<number[]>(db, "fichas_excluidas", []), []);

  if (!plantas) return null;
  const ativas = plantas.filter((p) => p.status !== "removida");
  const paraDecidir = ativas.filter(precisaRevisao);
  const semNumero = ativas.filter((p) => p.ficha === null);
  const sugeridos = ativas.filter((p) => p.params_origem === "sugerido");

  return (
    <>
      <h1>Revisão da carga inicial</h1>
      <p className="ajuda">
        Seu inventário foi carregado neste aparelho. Aqui ficam os pontos que só você pode decidir.
        Nada aqui é obrigatório agora: as plantas já estão todas na lista.
      </p>

      <h2 className="titulo-secao">1. Conflitos e confirmações ({paraDecidir.length})</h2>
      {paraDecidir.length === 0 && <p className="ok">✔ Nada para decidir.</p>}
      {paraDecidir.map((p) => (
        <article key={p.id} className="cartao">
          <a href={`#/planta/${p.id}`} className="titulo-cartao">
            <NumeroFicha planta={p} /> <strong>{p.nome_popular}</strong>
          </a>
          {p.status === "pendente_confirmacao" && <p className="selo status-pendente_confirmacao">{STATUS_ROTULO[p.status]}</p>}
          <ul className="alertas">{p.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <div className="botoes tres">
            <button className="botao" onClick={() => confirmarRevisao(db, p.id)}>Confirmar</button>
            <a className="botao secundario" href={`#/planta/${p.id}/editar`}>Editar</a>
            <button
              className="botao perigo"
              onClick={() => confirm(`"${p.nome_popular}" saiu da coleção? Ela será marcada como removida.`) && removerPlanta(db, p.id)}
            >Excluir</button>
          </div>
        </article>
      ))}

      <h2 className="titulo-secao">2. Números de ficha que faltam ({semNumero.length})</h2>
      {semNumero.length === 0 && <p className="ok">✔ Todas as fichas têm número.</p>}
      {semNumero.length > 0 && <NumerarTodas plantas={plantas} excluidas={excluidas ?? []} />}
      {obsNumeracao && semNumero.length > 0 && <p className="ajuda">{obsNumeracao}</p>}
      <ul className="lista-fichas">
        {semNumero.map((p) => (
          <li key={p.id}>
            <a href={`#/planta/${p.id}`}><strong>{p.nome_popular}</strong>{p.nome_cientifico && <em> {p.nome_cientifico}</em>}</a>
            <CampoFicha planta={p} />
          </li>
        ))}
      </ul>

      <h2 className="titulo-secao">3. Parâmetros sugeridos para conferir ({sugeridos.length})</h2>
      <p className="ajuda">pH, gatilho de rega e luz destas plantas foram sugeridos, não vieram do seu inventário. Abra a ficha, confira e toque em "Conferi".</p>
      <ul className="lista-simples links">
        {sugeridos.map((p) => (
          <li key={p.id}><a href={`#/planta/${p.id}`}><NumeroFicha planta={p} /> {p.nome_popular}</a></li>
        ))}
      </ul>
    </>
  );
}
