import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, lerMeta } from "../db";
import { restaurarCarga } from "../carga";
import { formatarData } from "../formato";
import { ir } from "../rotas";
import { seed } from "../seed";

const PALAVRA = "RESTAURAR";

export function Config() {
  const resumo = useLiveQuery(async () => ({
    plantas: await db.plantas.filter((p) => p.status !== "removida").count(),
    removidas: await db.plantas.where("status").equals("removida").count(),
    eventos: await db.eventos.count(),
    pendencias: await db.pendencias.count(),
    projetos: await db.projetos.count(),
    insumos: await db.insumos.count(),
    desejos: await db.lista_desejos.count(),
    zonas: await db.zonas.count(),
    regras: await db.regras.count(),
    proxima: await lerMeta<number>(db, "proxima_ficha", 0),
    importadaEm: await lerMeta<string | null>(db, "carga_importada_em", null)
  }), []);
  const [etapa, setEtapa] = useState<0 | 1 | 2>(0);
  const [digitado, setDigitado] = useState("");
  const [restaurando, setRestaurando] = useState(false);

  async function restaurar() {
    setRestaurando(true);
    await restaurarCarga(db, seed);
    setRestaurando(false);
    setEtapa(0);
    setDigitado("");
    ir("/revisao");
  }

  return (
    <>
      <h1>Configurações</h1>

      {resumo && (
        <section className="cartao">
          <h2>Dados neste aparelho</h2>
          <dl>
            <div className="linha-dado"><dt>Plantas na coleção</dt><dd>{resumo.plantas}</dd></div>
            <div className="linha-dado"><dt>Removidas</dt><dd>{resumo.removidas}</dd></div>
            <div className="linha-dado"><dt>Eventos</dt><dd>{resumo.eventos}</dd></div>
            <div className="linha-dado"><dt>Pendências</dt><dd>{resumo.pendencias}</dd></div>
            <div className="linha-dado"><dt>Projetos</dt><dd>{resumo.projetos}</dd></div>
            <div className="linha-dado"><dt>Insumos</dt><dd>{resumo.insumos}</dd></div>
            <div className="linha-dado"><dt>Lista de desejos</dt><dd>{resumo.desejos}</dd></div>
            <div className="linha-dado"><dt>Zonas de luz</dt><dd>{resumo.zonas}</dd></div>
            <div className="linha-dado"><dt>Regras</dt><dd>{resumo.regras}</dd></div>
            <div className="linha-dado"><dt>Próxima ficha</dt><dd>nº {resumo.proxima}</dd></div>
            <div className="linha-dado"><dt>Carga inicial importada em</dt><dd>{formatarData(resumo.importadaEm)}</dd></div>
          </dl>
          <p className="ajuda">Os dados ficam só neste aparelho por enquanto. A cópia na planilha Google chega na Fase 1.</p>
        </section>
      )}

      <section className="cartao perigo">
        <h2>Restaurar carga inicial</h2>
        <p className="ajuda">Apaga tudo o que foi feito neste aparelho (edições, números de ficha, exclusões) e carrega de novo o inventário original.</p>
        {etapa === 0 && <button className="botao perigo largo" onClick={() => setEtapa(1)}>Restaurar carga inicial…</button>}
        {etapa === 1 && (
          <div className="confirmacao">
            <p><b>Tem certeza? Tudo o que você alterou será perdido.</b></p>
            <div className="botoes">
              <button className="botao secundario" onClick={() => setEtapa(0)}>Cancelar</button>
              <button className="botao perigo" onClick={() => setEtapa(2)}>Sim, continuar</button>
            </div>
          </div>
        )}
        {etapa === 2 && (
          <div className="confirmacao">
            <label>Para confirmar, digite <b>{PALAVRA}</b>
              <input value={digitado} onChange={(e) => setDigitado(e.target.value)} autoCapitalize="characters" />
            </label>
            <div className="botoes">
              <button className="botao secundario" onClick={() => { setEtapa(0); setDigitado(""); }}>Cancelar</button>
              <button className="botao perigo" disabled={digitado.trim().toUpperCase() !== PALAVRA || restaurando} onClick={restaurar}>
                {restaurando ? "Restaurando…" : "Apagar e restaurar"}
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="versao">Versão {__APP_VERSION__}</p>
    </>
  );
}
