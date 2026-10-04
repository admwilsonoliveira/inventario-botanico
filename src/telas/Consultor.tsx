import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import {
  analisarFotos, type AcaoConferida, climaPatrocinio, conferirResposta, ESQUEMA_CONSULTA, montarInstrucoes, type RespostaConsulta
} from "../ia";
import { hojeISO, novaPendencia, salvarEvento } from "../registro";
import { avisar } from "../aviso";
import type { Planta } from "../types";

interface Mensagem {
  pergunta: string;
  resposta: string;
  acoes: AcaoConferida[];
  avisos: string[];
}

/** Conversa com a IA sobre uma planta, com a ficha, o histórico e as regras como contexto. */
export function Consultor({ plantaId }: { plantaId: string }) {
  const planta = useLiveQuery(async (): Promise<Planta | null> => (await db.plantas.get(plantaId)) ?? null, [plantaId]);
  const [conversa, setConversa] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [salva, setSalva] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!esperando) return;
    const inicio = Date.now();
    const t = setInterval(() => setSegundos(Math.round((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(t);
  }, [esperando]);
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversa.length, esperando]);

  if (planta === undefined) return null;
  if (!planta) return <p>Planta não encontrada.</p>;

  async function perguntar() {
    const q = pergunta.trim();
    if (!q || !planta) return;
    setErro(null);
    setEsperando(true);
    setSegundos(0);
    try {
      const [grupos, insumos, regras, clima, medicoes, eventos] = await Promise.all([
        db.meta.get("grupos").then((m) => (m?.valor as { numero: number; nome: string }[]) ?? []),
        db.insumos.toArray(), db.regras.toArray(), climaPatrocinio(),
        db.medicoes.where("planta_id").equals(planta.id).toArray(),
        db.eventos.where("planta_id").equals(planta.id).toArray()
      ]);
      const instrucoes = montarInstrucoes({
        modo: "consulta", planta, grupos, data: new Date(), clima, tiposFotos: [],
        insumosEstoque: insumos.filter((i) => i.em_estoque).map((i) => i.nome),
        medicao: medicoes.sort((a, b) => b.data_hora.localeCompare(a.data_hora))[0] ?? null,
        eventos: eventos.sort((a, b) => b.data.localeCompare(a.data)),
        pergunta: q, conversa: conversa.map((m) => ({ pergunta: m.pergunta, resposta: m.resposta }))
      });
      const r = await analisarFotos<RespostaConsulta>(db, instrucoes, [], ESQUEMA_CONSULTA);
      // a resposta também passa pelo motor de regras
      const conferido = conferirResposta(
        { nota: 0, subnotas: { vigor: 0, nutricao_cor: 0, pragas_doencas: 0, estrutura: 0, vaso_substrato: 0 }, sinais_vistos: [], hipoteses: [], perguntas_confirmacao: [], acoes: r.acoes ?? [] },
        r.resposta, regras, insumos, planta
      );
      setConversa((c) => [...c, { pergunta: q, resposta: r.resposta, acoes: conferido.acoes, avisos: conferido.avisosGerais.map((d) => d.mensagem) }]);
      setPergunta("");
      setSalva(false);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEsperando(false);
    }
  }

  async function salvar() {
    const texto = conversa.map((m) => `P: ${m.pergunta} R: ${m.resposta}`).join(" | ");
    await salvarEvento(db, { planta_id: plantaId, data: hojeISO(), tipo: "consulta", produto: null, dose_g_l: null, volume_ml: null, observacao: texto });
    setSalva(true);
    avisar("✔ Conversa salva no histórico da planta");
  }

  return (
    <>
      <a className="voltar" href={`#/planta/${plantaId}`}>‹ {planta.nome_popular}</a>
      <h1>💬 Perguntar sobre {planta.nome_popular}</h1>
      <p className="ajuda">A IA responde com base na ficha, no histórico, na última medição, no clima e nas suas regras. Cada pergunta usa uma análise da cota do dia.</p>

      <div className="chat">
        {conversa.map((m, i) => (
          <div key={i}>
            <div className="balao pergunta">{m.pergunta}</div>
            <div className="balao resposta">
              <p>{m.resposta}</p>
              {m.avisos.map((a) => <div key={a} className="aviso">⚠ {a}</div>)}
              {m.acoes.length > 0 && (
                <ul className="acoes-ia">
                  {m.acoes.map((a, j) => (
                    <li key={j} className={a.bloqueio ? "bloqueada" : ""}>
                      {a.bloqueio ? <span>⛔ <s>{a.acao}</s> — removida pelas regras: {a.bloqueio}</span> : (
                        <>
                          <span><b>{a.acao}</b> <small>({a.quando})</small>{a.insumo && <> · {a.insumo}</>}</span>
                          {a.precisa_comprar && <span className="selo alerta">precisa comprar</span>}
                          <button className="link" onClick={async () => {
                            await novaPendencia(db, { planta_id: plantaId, data_prevista: hojeISO(), acao: `${a.acao}${a.insumo ? ` (${a.insumo})` : ""}` });
                            avisar("✔ Pendência criada");
                          }}>+ pendência</button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {esperando && <div className="balao resposta esperando">Pensando… {segundos} s</div>}
        <div ref={fim} />
      </div>

      {erro && <div className="aviso erro">{erro}</div>}
      <div className="formulario">
        <textarea rows={3} value={pergunta} onChange={(e) => setPergunta(e.target.value)}
          placeholder="ex.: As folhas de baixo estão amarelando. O que pode ser?" disabled={esperando} />
        <button className="botao largo" disabled={!pergunta.trim() || esperando} onClick={perguntar}>Perguntar</button>
        {conversa.length > 0 && (
          <button className="botao secundario largo" disabled={salva} onClick={salvar}>{salva ? "✔ Salva no histórico" : "Salvar conversa no histórico"}</button>
        )}
      </div>
    </>
  );
}
