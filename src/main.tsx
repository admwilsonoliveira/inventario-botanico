import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./estilo.css";

// Atualização automática: quando há versão nova publicada, ela é baixada e a tela recarrega sozinha.
// No Android o app costuma voltar do segundo plano sem reiniciar, então também confere ao voltar para a tela.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return;
    const conferir = () => navigator.onLine && registro.update().catch(() => {});
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && conferir());
    setInterval(conferir, 60 * 60 * 1000);
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
