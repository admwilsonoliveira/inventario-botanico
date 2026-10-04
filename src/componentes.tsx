import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useLiveQuery } from "dexie-react-hooks";
import { definirFicha } from "./carga";
import { db, lerMeta } from "./db";
import type { Grupo, Planta } from "./types";
import { STATUS_ROTULO } from "./types";

/** Lista dos grupos com nome (guardada no banco, vem da carga inicial). */
export function useGrupos(): Grupo[] {
  return useLiveQuery(() => lerMeta<Grupo[]>(db, "grupos", []), [], []);
}

/** "2 · Tropicais de folhagem"; se o grupo não tiver nome, só o número. */
export function nomeGrupo(numero: number | null, grupos: Grupo[]): string {
  if (numero === null) return "—";
  const g = grupos.find((x) => x.numero === numero);
  return g ? `${numero} · ${g.nome}` : `Grupo ${numero}`;
}

/** QR em SVG (nítido na impressão). */
export function QR({ texto, className }: { texto: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(texto, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(setSvg);
  }, [texto]);
  return <div className={className} role="img" aria-label="Código QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function NumeroFicha({ planta }: { planta: Pick<Planta, "ficha"> }) {
  return planta.ficha === null ? <span className="ficha pendente">nº pendente</span> : <span className="ficha">nº {planta.ficha}</span>;
}

export function Selos({ planta }: { planta: Planta }) {
  return (
    <span className="selos">
      {planta.status !== "ativa" && <span className={`selo status-${planta.status}`}>{STATUS_ROTULO[planta.status]}</span>}
      {planta.params_origem === "sugerido" && <span className="selo sugerido">parâmetros sugeridos</span>}
      {planta.alertas.length > 0 && <span className="selo alerta">⚠ {planta.alertas.length}</span>}
    </span>
  );
}

/** Campo para preencher o número da ficha (fichas 1–46 vieram sem número). */
export function CampoFicha({ planta, aoSalvar }: { planta: Planta; aoSalvar?: () => void }) {
  const [valor, setValor] = useState(planta.ficha?.toString() ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function salvar() {
    setErro(null);
    setOk(false);
    const texto = valor.trim();
    try {
      await definirFicha(db, planta.id, texto === "" ? null : Number(texto));
      setOk(true);
      aoSalvar?.();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="campo-ficha">
      <div className="linha">
        <input
          type="number" inputMode="numeric" min={1} placeholder="nº" value={valor}
          onChange={(e) => { setValor(e.target.value); setOk(false); }}
          onKeyDown={(e) => e.key === "Enter" && salvar()}
          aria-label={`Número da ficha de ${planta.nome_popular}`}
        />
        <button className="botao" onClick={salvar}>Gravar</button>
      </div>
      {erro && <div className="msg-erro">{erro}</div>}
      {ok && <div className="msg-ok">Gravado.</div>}
    </div>
  );
}
