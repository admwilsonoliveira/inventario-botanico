import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { mapaDeZonas } from "../evolucao";
import { horasDeSol, ROTULO_LUZ } from "../zonas";
import type { Planta, Zona } from "../types";

const ICONE = { sol_pleno: "☀️", meia_sombra: "⛅", luz_filtrada: "🌥️" } as const;

function EditarZona({ z, aoFechar }: { z: Zona | null; aoFechar: () => void }) {
  const [nome, setNome] = useState(z?.nome ?? "");
  const [sol, setSol] = useState(z?.sol_direto ?? "");
  async function salvar() {
    if (!nome.trim()) return;
    if (z) {
      // renomear a zona leva junto as plantas que estavam nela
      if (nome.trim() !== z.nome) await db.plantas.where("id").above("").modify((p) => { if (p.zona === z.nome) p.zona = nome.trim(); });
      await db.zonas.update(z.id, { nome: nome.trim(), sol_direto: sol.trim() || null });
    } else {
      await db.zonas.add({ id: `Z${crypto.randomUUID().slice(0, 6)}`, nome: nome.trim(), sol_direto: sol.trim() || null });
    }
    aoFechar();
  }
  const h = horasDeSol(sol);
  return (
    <div className="formulario">
      <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <label>Sol direto<input value={sol} onChange={(e) => setSol(e.target.value)} placeholder="ex.: 16h30–18h, a partir das 12h30, luz difusa, sol pleno" /></label>
      <p className="ajuda">{h === null ? "Escreva o horário de sol para o app calcular as horas." : `≈ ${String(Math.round(h * 10) / 10).replace(".", ",")} h de sol direto.`}</p>
      <div className="botoes">
        <button className="botao secundario" onClick={aoFechar}>Cancelar</button>
        <button className="botao" onClick={salvar}>Salvar</button>
      </div>
    </div>
  );
}

function ItemPlanta({ planta, precisa, conflito, zonas }: { planta: Planta; precisa: string | null; conflito: boolean; zonas: Zona[] }) {
  return (
    <li className={conflito ? "planta-zona conflito" : "planta-zona"}>
      <a href={`#/planta/${planta.id}`}>{planta.nome_popular}</a>
      {conflito && precisa && <small className="msg-erro">pede {ROTULO_LUZ[precisa as keyof typeof ROTULO_LUZ]}</small>}
      <select value={zonas.some((z) => z.nome === planta.zona) ? planta.zona! : ""} aria-label={`Zona de ${planta.nome_popular}`}
        onChange={(e) => db.plantas.update(planta.id, { zona: e.target.value || null })}>
        <option value="">sem zona</option>
        {zonas.map((z) => <option key={z.id} value={z.nome}>{z.nome}</option>)}
      </select>
    </li>
  );
}

export function Zonas() {
  const zonas = useLiveQuery(() => db.zonas.toArray(), []);
  const plantas = useLiveQuery(() => db.plantas.toArray(), []);
  const [editando, setEditando] = useState<string | "nova" | null>(null);
  if (!zonas || !plantas) return null;
  const mapa = mapaDeZonas(zonas, plantas);
  const conflitos = mapa.reduce((n, s) => n + s.plantas.filter((x) => x.conflito).length, 0);

  return (
    <>
      <a className="voltar" href="#/">‹ Plantas</a>
      <h1>🗺️ Zonas de luz</h1>
      <p className="ajuda">
        Cada zona é classificada pelas horas de sol direto: ☀️ sol pleno (5 h ou mais), ⛅ meia-sombra (2 a 5 h), 🌥️ luz filtrada (até 2 h).
        {conflitos > 0 && <b> {conflitos} {conflitos === 1 ? "planta está" : "plantas estão"} numa zona com luz diferente da que pede{conflitos === 1 ? "" : "m"}.</b>}
      </p>
      {mapa.map((s) => (
        <section key={s.zona?.id ?? "sem"} className={s.zona ? "cartao zona" : "cartao zona sem-zona"}>
          {s.zona && editando === s.zona.id ? (
            <EditarZona z={s.zona} aoFechar={() => setEditando(null)} />
          ) : (
            <div className="titulo-zona">
              <h2>{s.luz ? ICONE[s.luz] : "❔"} {s.zona ? s.zona.nome : "Sem zona definida"}</h2>
              {s.zona && <button className="link" onClick={() => setEditando(s.zona!.id)}>editar</button>}
            </div>
          )}
          {s.zona && <p className="ajuda">{s.zona.sol_direto ?? "sol não informado"}{s.luz && ` · ${ROTULO_LUZ[s.luz]}`}</p>}
          {s.plantas.length === 0 ? <p className="vazio">Nenhuma planta.</p> : (
            s.zona ? (
              <ul className="lista-zona">{s.plantas.map((x) => <ItemPlanta key={x.planta.id} {...x} zonas={zonas} />)}</ul>
            ) : (
              <details>
                <summary>{s.plantas.length} plantas sem zona (escolha a zona de cada uma)</summary>
                <ul className="lista-zona">{s.plantas.map((x) => <ItemPlanta key={x.planta.id} {...x} zonas={zonas} />)}</ul>
              </details>
            )
          )}
        </section>
      ))}
      {editando === "nova" ? <section className="cartao"><EditarZona z={null} aoFechar={() => setEditando(null)} /></section>
        : <button className="botao secundario largo" onClick={() => setEditando("nova")}>+ Nova zona</button>}
    </>
  );
}
