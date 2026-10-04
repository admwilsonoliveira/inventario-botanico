import { useLiveQuery } from "dexie-react-hooks";
import { db, lerMeta } from "../db";
import { confirmarRevisao, precisaRevisao, removerPlanta } from "../carga";
import { compararFichas } from "../formato";
import { CampoFicha, NumeroFicha } from "../componentes";
import { STATUS_ROTULO } from "../types";

export function Revisao() {
  const plantas = useLiveQuery(() => db.plantas.toArray().then((l) => l.sort(compararFichas)), []);
  const obsNumeracao = useLiveQuery(() => lerMeta<string | null>(db, "observacao_numeracao", null), []);

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
      {obsNumeracao && <p className="ajuda">{obsNumeracao}</p>}
      {semNumero.length === 0 && <p className="ok">✔ Todas as fichas têm número.</p>}
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
