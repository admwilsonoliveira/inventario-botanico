import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { paraComparar } from "../evolucao";
import { miniaturaDaFoto } from "../ia";
import { formatarData } from "../formato";
import { TIPOS_FOTO } from "../registro";
import type { Foto } from "../types";

/** Imagem de uma foto: do aparelho ou, se veio de outro aparelho, buscada no Drive. */
function ImagemFoto({ foto }: { foto: Foto }) {
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    let vivo = true;
    miniaturaDaFoto(db, foto.id, foto.arquivo_drive_id)
      .then((b) => {
        if (!vivo) return;
        if (b) { u = URL.createObjectURL(b); setUrl(u); } else setFalhou(true);
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [foto.id, foto.arquivo_drive_id]);
  if (url) return <img src={url} alt={`${TIPOS_FOTO[foto.tipo]?.nome ?? "Foto"} de ${formatarData(foto.data)}`} />;
  return <span className="sem-miniatura">{falhou ? "📷 sem imagem" : "…"}</span>;
}

export function Evolucao({ plantaId }: { plantaId: string }) {
  const planta = useLiveQuery(() => db.plantas.get(plantaId), [plantaId]);
  const fotos = useLiveQuery(
    () => db.fotos.where("planta_id").equals(plantaId).toArray().then((l) => l.sort((a, b) => a.data.localeCompare(b.data))),
    [plantaId]
  );
  const [escolha, setEscolha] = useState<[string, string] | null>(null);
  const [tipo, setTipo] = useState<number | null>(null);
  if (!fotos || !planta) return null;

  const lista = tipo === null ? fotos : fotos.filter((f) => f.tipo === tipo);
  const padrao = paraComparar(lista);
  const par = escolha
    ? (escolha.map((id) => fotos.find((f) => f.id === id)).filter(Boolean) as Foto[])
    : padrao ?? [];
  const tipos = [...new Set(fotos.map((f) => f.tipo))].sort();

  function tocar(id: string) {
    // o primeiro toque escolhe a foto da esquerda; o segundo, a da direita
    if (!escolha || escolha[0] === escolha[1]) setEscolha(escolha && escolha[0] !== id ? [escolha[0], id] : [id, id]);
    else setEscolha([id, id]);
  }

  return (
    <>
      <a className="voltar" href={`#/planta/${plantaId}`}>‹ {planta.nome_popular}</a>
      <h1>🖼️ Evolução</h1>
      {fotos.length < 2 ? (
        <p className="ajuda">É preciso ter pelo menos duas fotos desta planta. Use 📷 Foto ou 🩺 Check-up na ficha.</p>
      ) : (
        <>
          {par.length === 2 && (
            <div className="comparacao">
              {par.map((f, i) => (
                <figure key={`${f.id}-${i}`}>
                  <ImagemFoto foto={f} />
                  <figcaption>{formatarData(f.data)} · {TIPOS_FOTO[f.tipo]?.nome}{f.nota_saude !== null && ` · nota ${f.nota_saude}`}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <p className="ajuda">Toque em duas fotos abaixo para comparar (a primeira vai para a esquerda).</p>
          {tipos.length > 1 && (
            <div className="chips">
              <button className={tipo === null ? "chip ativo" : "chip"} onClick={() => { setTipo(null); setEscolha(null); }}>Todas</button>
              {tipos.map((t) => (
                <button key={t} className={tipo === t ? "chip ativo" : "chip"} onClick={() => { setTipo(t); setEscolha(null); }}>{TIPOS_FOTO[t]?.nome ?? t}</button>
              ))}
            </div>
          )}
          <div className="grade-fotos">
            {[...lista].reverse().map((f) => (
              <button key={f.id} className={escolha?.includes(f.id) ? "foto escolhida" : "foto"} onClick={() => tocar(f.id)}>
                <ImagemFoto foto={f} />
                <span>{formatarData(f.data)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
