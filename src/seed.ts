import seedJson from "../seed/inventario_inicial.json";
import type { SeedJson } from "./carga";

// O JSON da carga inicial vai empacotado dentro do app (funciona sem internet).
export const seed = seedJson as unknown as SeedJson;
