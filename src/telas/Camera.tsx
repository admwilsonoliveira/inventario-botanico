import { useEffect, useRef, useState } from "react";
import { TIPOS_FOTO } from "../registro";

/**
 * Câmera em tela cheia com moldura de enquadramento e a instrução do tipo de foto (CLAUDE.md, seção 7).
 * Se a câmera ao vivo não estiver disponível, cai para a câmera do sistema (escolher arquivo).
 */
export function Camera({ tipo, aoCapturar, aoFechar }: { tipo: number; aoCapturar: (foto: Blob) => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let cancelado = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("sem câmera ao vivo");
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3000 }, height: { ideal: 3000 } },
          audio: false
        });
        if (cancelado) return fluxo.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = fluxo;
        await video.current!.play();
        setPronta(true);
      } catch {
        setErro("Não foi possível abrir a câmera aqui. Use o botão abaixo para fotografar pela câmera do celular.");
      }
    })();
    return () => {
      cancelado = true;
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturar() {
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && aoCapturar(b), "image/jpeg", 0.92);
  }

  const info = TIPOS_FOTO[tipo];
  return (
    <div className="camera" role="dialog" aria-label={`Foto: ${info.nome}`}>
      <video ref={video} playsInline muted />
      {pronta && <div className={tipo === 1 ? "moldura retrato" : "moldura"} aria-hidden="true" />}
      <div className="camera-topo">
        <b>{tipo}. {info.nome}</b>
        <span>{info.dica}</span>
      </div>
      {erro && <div className="camera-erro">{erro}</div>}
      <div className="camera-base">
        <button className="botao secundario" onClick={aoFechar}>Cancelar</button>
        {pronta ? (
          <button className="disparo" aria-label="Fotografar" onClick={capturar} />
        ) : (
          <label className="botao">
            📷 Fotografar
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && aoCapturar(e.target.files[0])} />
          </label>
        )}
        <label className="botao secundario">
          Galeria
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && aoCapturar(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
}
