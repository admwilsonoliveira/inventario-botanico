import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { anotarExclusao, db } from "../db";
import { avaliar } from "../regras";
import { necessidadeDeLuz, ROTULO_LUZ, zonasCompativeis } from "../zonas";
import { criarPlanta } from "../carga";
import { avisar } from "../aviso";
import { ir } from "../rotas";
import type { Desejo } from "../types";

const VAZIO = { nome: "", especie: "", prioridade: "média", zona_compativel: "", epoca_compra: "", preco_alvo: "", observacao: "" };
type Form = typeof VAZIO;

const paraForm = (d: Desejo): Form => ({
  nome: d.nome, especie: d.especie ?? "", prioridade: d.prioridade ?? "média", zona_compativel: d.zona_compativel ?? "",
  epoca_compra: d.epoca_compra ?? "", preco_alvo: d.preco_alvo === null ? "" : String(d.preco_alvo).replace(".", ","),
  observacao: d.observacao ?? ""
});

function FormDesejo({ inicial, aoSalvar, aoCancelar }: { inicial: Form; aoSalvar: (f: Form) => void; aoCancelar: () => void }) {
  const [f, setF] = useState(inicial);
  const m = (c: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [c]: e.target.value });
  return (
    <div className="formulario cartao">
      <label>Nome<input value={f.nome} onChange={m("nome")} placeholder="ex.: Alocasia 'Polly'" /></label>
      <label>Espécie<input value={f.especie} onChange={m("especie")} /></label>
      <label>Prioridade
        <select value={f.prioridade} onChange={m("prioridade")}>
          <option value="alta">Alta</option><option value="média">Média</option><option value="baixa">Baixa</option>
        </select>
      </label>
      <label>Luz que precisa<input value={f.zona_compativel} onChange={m("zona_compativel")} placeholder="ex.: Luz filtrada / Sol pleno / Meia-sombra" /></label>
      <div className="grade-2">
        <label>Época de compra<input value={f.epoca_compra} onChange={m("epoca_compra")} /></label>
        <label>Preço-alvo (R$)<input inputMode="decimal" value={f.preco_alvo} onChange={m("preco_alvo")} /></label>
      </div>
      <label>Observação<textarea rows={3} value={f.observacao} onChange={m("observacao")} /></label>
      <div className="botoes">
        <button className="botao secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="botao" disabled={!f.nome.trim()} onClick={() => aoSalvar(f)}>Salvar</button>
      </div>
    </div>
  );
}

const deForm = (f: Form): Omit<Desejo, "id"> => {
  const preco = Number(f.preco_alvo.replace(",", "."));
  return {
    nome: f.nome.trim(), especie: f.especie.trim() || null, prioridade: f.prioridade, zona_compativel: f.zona_compativel.trim() || null,
    epoca_compra: f.epoca_compra.trim() || null, preco_alvo: f.preco_alvo.trim() && Number.isFinite(preco) ? preco : null,
    observacao: f.observacao.trim() || null
  };
};

export function Desejos() {
  const desejos = useLiveQuery(() => db.lista_desejos.toArray(), []);
  const zonas = useLiveQuery(() => db.zonas.toArray(), [], []);
  const regras = useLiveQuery(() => db.regras.toArray(), [], []);
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  if (!desejos) return null;

  const ordem = { alta: 0, "média": 1, baixa: 2 } as Record<string, number>;
  const lista = [...desejos].sort((a, b) => (ordem[a.prioridade ?? ""] ?? 3) - (ordem[b.prioridade ?? ""] ?? 3) || a.nome.localeCompare(b.nome, "pt-BR"));

  async function apagar(d: Desejo) {
    if (!confirm(`Tirar "${d.nome}" da lista de desejos?`)) return;
    await db.transaction("rw", db.lista_desejos, db.apagados, async () => {
      await db.lista_desejos.delete(d.id);
      await anotarExclusao(db, "lista_desejos", d.id);
    });
  }

  async function comprei(d: Desejo) {
    if (!confirm(`Comprou "${d.nome}"? Ela vira uma ficha nova no inventário.`)) return;
    const id = await criarPlanta(db, {
      nome_popular: d.nome, nome_cientifico: d.especie, luz: d.zona_compativel, origem: "Comprada (lista de desejos)",
      historico: d.observacao ?? ""
    });
    await db.transaction("rw", db.lista_desejos, db.apagados, async () => {
      await db.lista_desejos.delete(d.id);
      await anotarExclusao(db, "lista_desejos", d.id);
    });
    avisar("✔ Ficha criada. Complete o questionário.");
    ir(`/planta/${id}/editar`);
  }

  return (
    <>
      <a className="voltar" href="#/">‹ Plantas</a>
      <h1>⭐ Lista de desejos</h1>
      {editando === "novo" ? (
        <FormDesejo inicial={VAZIO} aoCancelar={() => setEditando(null)}
          aoSalvar={async (f) => { await db.lista_desejos.add({ id: crypto.randomUUID(), ...deForm(f) }); setEditando(null); }} />
      ) : (
        <button className="botao largo" onClick={() => setEditando("novo")}>+ Adicionar desejo</button>
      )}
      {lista.length === 0 && <p className="vazio">A lista está vazia.</p>}
      {lista.map((d) => {
        if (editando === d.id) {
          return <FormDesejo key={d.id} inicial={paraForm(d)} aoCancelar={() => setEditando(null)}
            aoSalvar={async (f) => { await db.lista_desejos.update(d.id, deForm(f)); setEditando(null); }} />;
        }
        const golpe = avaliar(regras, { desejo: `${d.nome} ${d.especie ?? ""} ${d.observacao ?? ""}` });
        const precisa = necessidadeDeLuz(d.zona_compativel);
        const cabem = zonasCompativeis(zonas, precisa);
        return (
          <article key={d.id} className="cartao desejo">
            <div className="titulo-desejo">
              <strong>{d.nome}</strong>
              {d.prioridade && <span className={`selo prioridade-${d.prioridade === "média" ? "media" : d.prioridade}`}>{d.prioridade}</span>}
            </div>
            {d.especie && <p className="cientifico">{d.especie}</p>}
            {golpe.map((g) => <div key={g.regra.id} className="aviso erro">⚠ {g.mensagem}</div>)}
            <p className="ajuda">
              {precisa
                ? cabem.length ? <>Precisa de {ROTULO_LUZ[precisa]}. Cabe em: <b>{cabem.map((z) => z.nome).join(", ")}</b>.</>
                  : <>Precisa de {ROTULO_LUZ[precisa]}. <b>Nenhuma zona da casa tem essa luz.</b></>
                : "Informe a luz que ela precisa para ver em que zona cabe."}
            </p>
            {(d.epoca_compra || d.preco_alvo !== null) && (
              <p className="ajuda">{d.epoca_compra && <>Comprar: {d.epoca_compra}. </>}{d.preco_alvo !== null && <>Preço-alvo: R$ {String(d.preco_alvo).replace(".", ",")}.</>}</p>
            )}
            {d.observacao && <p>{d.observacao}</p>}
            <div className="botoes tres">
              <button className="botao" onClick={() => comprei(d)}>Comprei</button>
              <button className="botao secundario" onClick={() => setEditando(d.id)}>Editar</button>
              <button className="botao perigo" onClick={() => apagar(d)}>Tirar</button>
            </div>
          </article>
        );
      })}
    </>
  );
}

/** Cadastro manual de planta (sem escaneamento): nome e grupo; o resto no questionário. */
export function NovaPlanta() {
  const grupos = useLiveQuery(async () => ((await db.meta.get("grupos"))?.valor as { numero: number; nome: string }[]) ?? [], [], []);
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState("");
  async function criar() {
    if (!nome.trim()) return;
    const id = await criarPlanta(db, { nome_popular: nome.trim(), grupo: grupo ? Number(grupo) : null });
    avisar("✔ Ficha criada. Complete o questionário.");
    ir(`/planta/${id}/editar`);
  }
  return (
    <>
      <a className="voltar" href="#/">‹ Plantas</a>
      <h1>Nova planta</h1>
      <p className="ajuda">Para a IA preencher a ficha, use <a href="#/escanear">📷 Escanear</a>. Aqui você cadastra à mão.</p>
      <div className="formulario">
        <label>Nome popular<input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></label>
        <label>Grupo
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">—</option>
            {grupos.map((g) => <option key={g.numero} value={g.numero}>{g.numero} · {g.nome}</option>)}
          </select>
        </label>
        <button className="botao largo" disabled={!nome.trim()} onClick={criar}>Criar ficha (próximo número)</button>
      </div>
    </>
  );
}
