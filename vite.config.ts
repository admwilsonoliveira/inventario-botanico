import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // "./" faz o app funcionar em qualquer subpasta (ex.: admwilsonoliveira.github.io/inventario-botanico/)
  base: "./",
  server: { port: 5174 },
  define: {
    __APP_VERSION__: JSON.stringify(
      process.env.npm_package_version +
        " · " +
        new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
    )
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "Inventário Botânico",
        short_name: "Plantas",
        description: "Fichas, eventos e etiquetas QR da coleção de plantas.",
        lang: "pt-BR",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f3f6f1",
        theme_color: "#2f6b3a",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"]
      }
    })
  ],
  test: {
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"]
  }
});
