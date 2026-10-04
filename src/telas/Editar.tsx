import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { validarFicha, definirFicha } from "../carga";
import { ir } from "../rotas";
import { nomeGrupo, useGrupos } from "../componentes";
import { STATUS_ROTULO, type Planta, type StatusPlanta } from "../types";

// Texto digitado → número (aceita vírgula). Vazio = sem valor.
const paraNumero = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const deNumero = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const paraLista = (s: string) => s.split(",").map((x) => x.trim().replace(/\s+/g, "_")).filter(Boolean);
const deLista = (l: string[]) => l.map((x) => x.replace(/_/g, " ")).join(", ");

type Formulario = Record<string, string>;

const CAMPOS_TEXTO: [keyof Planta, string][] = [
  ["nome_popular", "Nome popular"],
  ["nome_cientifico", "Nome científico"],
  ["data_entrada", "Data de entrada (aaaa-mm ou aaaa-mm-dd)"],
  ["origem", "Origem"],
  ["luz", "Luz"],
  ["vaso", "Vaso"],
  ["substrato", "Substrato"],
  ["adubacao", "Adubação"],
  ["objetivo", "Objetivo"]
];

const CAMPOS_NUMERO: [keyof Planta, string][] = [
  ["quantidade", "Quantidade"],
  ["ph_min", "pH mínimo"],
  ["ph_max", "pH máximo"],
  ["rega_gatilho_min", "Regar a partir do nível (mín.)"],
  ["rega_gatilho_max", "Regar a partir do nível (máx.)"]
];

function montarFormulario(p: Planta): Formulario {
  const f: Formulario = {
    ficha: p.ficha === null ? "" : String(p.ficha),
    grupo: p.grupo === null ? "" : String(p.grupo),
    status: p.status,
    zona: p.zona ?? "",
    tags: deLista(p.tags),
    proibicoes: deLista(p.proibicoes),
    historico: p.historico
  };
  for (const [c] of CAMPOS_TEXTO) f[c] = (p[c] as string | null) ?? "";
  for (const [c] of CAMPOS_NUMERO) f[c] = deNumero(p[c] as number | null);
  return f;
}

export function Editar({ id }: { id: string }) {
  const planta = useLiveQuery(() => db.plantas.get(id), [id], null);
  const zonas = useLiveQuery(() => db.zonas.toArray(), [], []);
  const grupos = useGrupos();
  const [f, setF] = useState<Formulario | null>(null);
  const [erros, setErros] = useState<string[]>([]);

  useEffect(() => {
    if (planta && !f) setF(montarFormulario(planta));
  }, [planta, f]);

  if (planta === null || (planta && !f)) return null;
  if (planta === undefined) return <p>Planta não encontrada.</p>;
  const form = f!;
  const mudar = (campo: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...form, [campo]: e.target.value });

  async function salvar() {
    const problemas: string[] = [];
    if (!form.nome_popular.trim()) problemas.push("O nome popular não pode ficar vazio.");
    const numeros: Partial<Planta> = {};
    for (const [c, rotulo] of CAMPOS_NUMERO) {
      const n = paraNumero(form[c]);
      if (Number.isNaN(n)) problemas.push(`"${rotulo}" precisa ser um número.`);
      else (numeros as Record<string, number | null>)[c] = n;
    }
    const ficha = paraNumero(form.ficha);
    if (ficha !== null && !Number.isNaN(ficha)) {
      const erro = await validarFicha(db, id, ficha);
      if (erro) problemas.push(erro);
    } else if (Number.isNaN(ficha)) problemas.push("O nº da ficha precisa ser um número.");
    setErros(problemas);
    if (problemas.length) {
      window.scrollTo(0, 0);
      return;
    }

    const texto: Partial<Planta> = {};
    for (const [c] of CAMPOS_TEXTO) (texto as Record<string, string | null>)[c] = form[c].trim() || null;

    await db.plantas.update(id, {
      ...texto,
      ...numeros,
      nome_popular: form.nome_popular.trim(),
      grupo: form.grupo === "" ? null : Number(form.grupo),
      status: form.status as StatusPlanta,
      zona: form.zona.trim() || null,
      tags: paraLista(form.tags),
      proibicoes: paraLista(form.proibicoes),
      historico: form.historico.trim()
    });
    if (ficha !== planta!.ficha) await definirFicha(db, id, ficha);
    ir(`/planta/${id}`);
  }

  return (
    <>
      <a className="voltar" href={`#/planta/${id}`}>‹ Cancelar</a>
      <h1>Editar ficha</h1>
      {erros.length > 0 && <div className="aviso erro"><ul>{erros.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {planta.alertas.length > 0 && (
        <div className="aviso">
          <b>Alertas desta planta:</b>
          <ul>{planta.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
          <small>Depois de corrigir, toque em "Resolvido" na ficha.</small>
        </div>
      )}

      <div className="formulario">
        <label>Nº da ficha<input type="number" inputMode="numeric" value={form.ficha} onChange={mudar("ficha")} placeholder="pendente" /></label>
        {CAMPOS_TEXTO.slice(0, 2).map(([c, r]) => (
          <label key={c}>{r}<input value={form[c]} onChange={mudar(c)} /></label>
        ))}
        <label>Grupo
          <select value={form.grupo} onChange={mudar("grupo")}>
            <option value="">—</option>
            {grupos.map((g) => <option key={g.numero} value={g.numero}>{nomeGrupo(g.numero, grupos)}</option>)}
            {planta.grupo !== null && !grupos.some((g) => g.numero === planta.grupo) && (
              <option value={planta.grupo}>Grupo {planta.grupo}</option>
            )}
          </select>
        </label>
        <label>Situação
          <select value={form.status} onChange={mudar("status")}>
            {(Object.keys(STATUS_ROTULO) as StatusPlanta[]).filter((s) => s !== "removida" || planta.status === "removida")
              .map((s) => <option key={s} value={s}>{STATUS_ROTULO[s]}</option>)}
          </select>
        </label>
        <label>Zona
          <input list="zonas" value={form.zona} onChange={mudar("zona")} />
          <datalist id="zonas">{zonas.map((z) => <option key={z.id} value={z.nome} />)}</datalist>
        </label>
        {CAMPOS_NUMERO.map(([c, r]) => (
          <label key={c}>{r}<input inputMode="decimal" value={form[c]} onChange={mudar(c)} /></label>
        ))}
        {CAMPOS_TEXTO.slice(2).map(([c, r]) => (
          <label key={c}>{r}<input value={form[c]} onChange={mudar(c)} /></label>
        ))}
        <label>Tags (separadas por vírgula)<input value={form.tags} onChange={mudar("tags")} /></label>
        <label>Proibições (separadas por vírgula)<input value={form.proibicoes} onChange={mudar("proibicoes")} /></label>
        <label>Histórico<textarea rows={5} value={form.historico} onChange={mudar("historico")} /></label>
      </div>

      <div className="barra-salvar">
        <a className="botao secundario" href={`#/planta/${id}`}>Cancelar</a>
        <button className="botao" onClick={salvar}>Salvar</button>
      </div>
    </>
  );
}
