import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, gravarConfig, lerMeta } from "../db";
import { restaurarCarga } from "../carga";
import { formatarData } from "../formato";
import { ir } from "../rotas";
import { seed } from "../seed";
import { exportarXlsx } from "../exportar";
import { condicoesDesconhecidas } from "../regras";
import { lerConfigNuvem, sincronizarAgora, testarNuvem } from "../sync";
import { StatusNuvem } from "../componentes";
import { avisar } from "../aviso";
import type { Regra } from "../types";

const PALAVRA = "RESTAURAR";

function SecaoNuvem() {
  const cfg = useLiveQuery(() => lerConfigNuvem(db), [], undefined);
  const [editando, setEditando] = useState(false);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (cfg) { setUrl(cfg.url); setToken(cfg.token); }
  }, [cfg]);

  if (cfg === undefined) return null;

  async function salvar() {
    setErro(null);
    const u = url.trim(), t = token.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) {
      setErro("O endereço deve começar com https://script.google.com/ e terminar em /exec.");
      return;
    }
    setTestando(true);
    try {
      await testarNuvem({ url: u, token: t });
      await gravarConfig(db, "nuvem", { url: u, token: t });
      setEditando(false);
      avisar("✔ Nuvem ligada. Sincronizando…");
      sincronizarAgora(db);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setTestando(false);
    }
  }

  return (
    <section className="cartao">
      <h2>Nuvem (planilha Google)</h2>
      <StatusNuvem />
      {cfg && !editando ? (
        <>
          <p className="ajuda">Ligada. As alterações vão para a planilha sozinhas, alguns segundos depois de cada registro, e as fotos para o Drive.</p>
          <div className="botoes">
            <button className="botao secundario" onClick={() => setEditando(true)}>Trocar endereço</button>
            <button className="botao" onClick={() => sincronizarAgora(db)}>Sincronizar agora</button>
          </div>
        </>
      ) : (
        <div className="formulario">
          <label>Endereço do App da Web (termina em /exec)
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" autoCorrect="off" />
          </label>
          <label>Token
            <input value={token} onChange={(e) => setToken(e.target.value)} autoCapitalize="off" autoCorrect="off" />
          </label>
          {erro && <div className="aviso erro">{erro}</div>}
          <div className="botoes">
            {cfg && <button className="botao secundario" onClick={() => setEditando(false)}>Cancelar</button>}
            <button className="botao" disabled={testando || !url || !token} onClick={salvar}>{testando ? "Testando…" : "Testar e ligar"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function ItemRegra({ r }: { r: Regra }) {
  const [texto, setTexto] = useState(r.mensagem);
  const [editando, setEditando] = useState(false);
  const desconhecidas = condicoesDesconhecidas(r);
  return (
    <li className={r.ativa ? "regra" : "regra inativa"}>
      <label className="linha-check">
        <input type="checkbox" checked={r.ativa} onChange={(e) => db.regras.update(r.id, { ativa: e.target.checked })} />
        <span className={r.tipo === "bloquear" ? "selo bloquear" : "selo alerta"}>{r.tipo === "bloquear" ? "bloqueia" : "alerta"}</span>
        <b>{r.id}</b>
      </label>
      {!editando ? (
        <p onClick={() => setEditando(true)}>{r.mensagem} <button className="link">editar texto</button></p>
      ) : (
        <div className="formulario">
          <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="botoes">
            <button className="botao secundario" onClick={() => { setTexto(r.mensagem); setEditando(false); }}>Cancelar</button>
            <button className="botao" onClick={async () => { await db.regras.update(r.id, { mensagem: texto.trim() || r.mensagem }); setEditando(false); }}>Salvar</button>
          </div>
        </div>
      )}
      {desconhecidas.length > 0 && <small className="msg-erro">Condição que o app ainda não sabe avaliar: {desconhecidas.join(", ")}</small>}
    </li>
  );
}

export function Config() {
  const resumo = useLiveQuery(async () => ({
    plantas: await db.plantas.filter((p) => p.status !== "removida").count(),
    removidas: await db.plantas.where("status").equals("removida").count(),
    eventos: await db.eventos.count(),
    medicoes: await db.medicoes.count(),
    fotos: await db.fotos.count(),
    pendencias: await db.pendencias.count(),
    proxima: await lerMeta<number>(db, "proxima_ficha", 0),
    importadaEm: await lerMeta<string | null>(db, "carga_importada_em", null)
  }), []);
  const regras = useLiveQuery(() => db.regras.toArray(), [], []);
  const [verRegras, setVerRegras] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [etapa, setEtapa] = useState<0 | 1 | 2>(0);
  const [digitado, setDigitado] = useState("");
  const [restaurando, setRestaurando] = useState(false);

  async function restaurar() {
    setRestaurando(true);
    await restaurarCarga(db, seed);
    // na próxima sincronização, recebe tudo da planilha de novo
    await gravarConfig(db, "ultimo_envio", null);
    await gravarConfig(db, "ultimo_recebimento", null);
    sincronizarAgora(db);
    setRestaurando(false);
    setEtapa(0);
    setDigitado("");
    ir("/revisao");
  }

  async function exportar() {
    setExportando(true);
    try {
      await exportarXlsx(db);
    } catch (e) {
      avisar(`Não foi possível exportar: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <h1>Configurações</h1>

      <SecaoNuvem />

      <section className="cartao">
        <h2>Exportar para Excel</h2>
        <p className="ajuda">Baixa um arquivo .xlsx com todas as tabelas (uma aba cada).</p>
        <button className="botao largo" disabled={exportando} onClick={exportar}>{exportando ? "Gerando…" : "⬇ Baixar .xlsx"}</button>
      </section>

      <section className="cartao">
        <h2>Regras ({regras.filter((r) => r.ativa).length} de {regras.length} ativas)</h2>
        <p className="ajuda">Conferidas antes de salvar cada registro. "Bloqueia" impede salvar; "alerta" avisa e deixa seguir.</p>
        <button className="botao secundario largo" onClick={() => setVerRegras(!verRegras)}>{verRegras ? "Fechar regras" : "Ver e editar regras"}</button>
        {verRegras && <ul className="lista-regras">{regras.map((r) => <ItemRegra key={r.id} r={r} />)}</ul>}
      </section>

      {resumo && (
        <section className="cartao">
          <h2>Dados neste aparelho</h2>
          <dl>
            <div className="linha-dado"><dt>Plantas na coleção</dt><dd>{resumo.plantas}</dd></div>
            <div className="linha-dado"><dt>Removidas</dt><dd>{resumo.removidas}</dd></div>
            <div className="linha-dado"><dt>Eventos</dt><dd>{resumo.eventos}</dd></div>
            <div className="linha-dado"><dt>Medições</dt><dd>{resumo.medicoes}</dd></div>
            <div className="linha-dado"><dt>Fotos</dt><dd>{resumo.fotos}</dd></div>
            <div className="linha-dado"><dt>Pendências</dt><dd>{resumo.pendencias}</dd></div>
            <div className="linha-dado"><dt>Próxima ficha</dt><dd>nº {resumo.proxima}</dd></div>
            <div className="linha-dado"><dt>Carga inicial importada em</dt><dd>{formatarData(resumo.importadaEm)}</dd></div>
          </dl>
        </section>
      )}

      <section className="cartao perigo">
        <h2>Restaurar carga inicial</h2>
        <p className="ajuda">
          Apaga tudo o que foi feito <b>neste aparelho</b> e carrega de novo o inventário original.
          Se a nuvem estiver ligada, o que já está na planilha volta na próxima sincronização.
        </p>
        {etapa === 0 && <button className="botao perigo largo" onClick={() => setEtapa(1)}>Restaurar carga inicial…</button>}
        {etapa === 1 && (
          <div className="confirmacao">
            <p><b>Tem certeza? Tudo o que você alterou neste aparelho será perdido.</b></p>
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
