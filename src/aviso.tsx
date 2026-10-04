import { useEffect, useState } from "react";

// Mensagem curta no rodapé ("✔ Rega registrada"), que some sozinha.
const EVENTO = "aviso-app";

export function avisar(texto: string) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: texto }));
}

export function Aviso() {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const ouvir = (e: Event) => {
      setTexto((e as CustomEvent<string>).detail);
      clearTimeout(t);
      t = setTimeout(() => setTexto(null), 3000);
    };
    window.addEventListener(EVENTO, ouvir);
    return () => {
      window.removeEventListener(EVENTO, ouvir);
      clearTimeout(t);
    };
  }, []);
  return texto ? <div className="toast" role="status">{texto}</div> : null;
}
