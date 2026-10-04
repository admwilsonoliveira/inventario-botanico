import { useEffect, useState } from "react";

// Navegação pelo "#" do endereço (ex.: #/planta/P01). Funciona no GitHub Pages e sem internet,
// e é o que vai dentro do QR de cada planta.
export function useRota(): string[] {
  const ler = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [partes, setPartes] = useState(ler);
  useEffect(() => {
    const aoMudar = () => {
      setPartes(ler());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);
  return partes;
}

export const ir = (caminho: string) => {
  location.hash = caminho;
};

/** Endereço completo (para o QR) a partir do link relativo "#/planta/P01". */
export const urlCompleta = (link: string) => location.href.split("#")[0] + link;
