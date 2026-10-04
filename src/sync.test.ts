import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import seedJson from "../seed/inventario_inicial.json";
import { BancoInventario, EPOCA, gravarConfig, lerMeta, TABELAS_SYNC } from "./db";
import { carregarSeVazio, definirFicha, excluirDefinitivamente, type SeedJson } from "./carga";
import { mesclarMeta, normalizarRemoto, sincronizar } from "./sync";

const seed = seedJson as unknown as SeedJson;

/** Servidor de mentira com as mesmas regras do apps-script/Codigo.gs. */
function servidorFalso() {
  const abas: Record<string, Map<string, Record<string, unknown>>> = {};
  const apagados: Record<string, unknown>[] = [];
  let relogio = 0;
  const agoraServidor = () => new Date(Date.UTC(2030, 0, 1) + ++relogio * 1000).toISOString();
  return {
    abas,
    fetch: vi.fn(async (_url: string, init: { body: string }) => {
      const req = JSON.parse(init.body);
      if (req.token !== "segredo") return new Response(JSON.stringify({ erro: "Token inválido." }));
      if (req.acao === "foto") return new Response(JSON.stringify({ ok: true, id: "drive-" + req.planta_id }));
      const agora = agoraServidor();
      const aceitos = new Set<string>();
      for (const [tabela, linhas] of Object.entries(req.mudancas as Record<string, Record<string, unknown>[]>)) {
        const aba = (abas[tabela] ??= new Map());
        const ch = TABELAS_SYNC[tabela as keyof typeof TABELAS_SYNC];
        for (const reg of linhas) {
          const k = String(reg[ch]);
          const atual = aba.get(k);
          if (atual && String(reg.atualizado_em ?? EPOCA) <= String(atual.atualizado_em ?? EPOCA)) continue;
          aba.set(k, JSON.parse(JSON.stringify({ ...reg, _recebido_em: agora })));
          aceitos.add(`${tabela}/${k}`);
        }
      }
      for (const a of req.apagados) {
        apagados.push({ ...a, _recebido_em: agora });
        const atual = abas[a.tabela]?.get(a.chave);
        if (atual && String(atual.atualizado_em ?? EPOCA) <= a.em) abas[a.tabela].delete(a.chave);
      }
      const desde = req.desde ?? "";
      const mudancas: Record<string, unknown[]> = {};
      for (const [tabela, aba] of Object.entries(abas)) {
        const novos = [...aba.entries()]
          .filter(([k, l]) => String(l._recebido_em) > desde && !aceitos.has(`${tabela}/${k}`))
          .map(([, l]) => { const c = { ...l }; delete c._recebido_em; return c; });
        if (novos.length) mudancas[tabela] = novos;
      }
      return new Response(JSON.stringify({
        ok: true, agora, mudancas,
        apagados: apagados.filter((a) => String(a._recebido_em) > desde)
      }));
    })
  };
}

let n = 0;
async function aparelho() {
  const b = new BancoInventario(`sync-${++n}`);
  await b.open();
  await carregarSeVazio(b, seed);
  await gravarConfig(b, "nuvem", { url: "https://exemplo/exec", token: "segredo" });
  return b;
}

let servidor: ReturnType<typeof servidorFalso>;
beforeEach(() => {
  servidor = servidorFalso();
  vi.stubGlobal("fetch", servidor.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("sincronização entre dois aparelhos", () => {
  it("a primeira sincronização envia tudo para a planilha", async () => {
    const cel = await aparelho();
    const r = await sincronizar(cel);
    expect(r.enviados).toBeGreaterThan(62);
    expect(servidor.abas.plantas.size).toBe(62);
  });

  it("a edição do celular chega ao computador, e a carga do computador não apaga a edição", async () => {
    const cel = await aparelho();
    await cel.plantas.update("P02", { objetivo: "teste" });
    await sincronizar(cel);

    const pc = await aparelho(); // computador com a carga original
    await sincronizar(pc);
    expect((await pc.plantas.get("P02"))!.objetivo).toBe("teste");
    expect(servidor.abas.plantas.get("P02")!.objetivo).toBe("teste");
  });

  it("vale a alteração mais recente e só vai o que mudou", async () => {
    const cel = await aparelho();
    const pc = await aparelho();
    await sincronizar(cel);
    await sincronizar(pc);

    await pc.plantas.update("P05", { zona: "Sala" });
    const r = await sincronizar(pc);
    expect(r.enviados).toBe(1);
    await sincronizar(cel);
    expect((await cel.plantas.get("P05"))!.zona).toBe("Sala");

    await new Promise((ok) => setTimeout(ok, 5));
    await cel.plantas.update("P05", { zona: "Varanda" });
    await sincronizar(cel);
    await sincronizar(pc);
    expect((await pc.plantas.get("P05"))!.zona).toBe("Varanda");
  });

  it("exclusão definitiva some do outro aparelho e da planilha", async () => {
    const cel = await aparelho();
    const pc = await aparelho();
    await sincronizar(cel);
    await sincronizar(pc);
    await excluirDefinitivamente(cel, "P46");
    await sincronizar(cel);
    expect(servidor.abas.plantas.has("P46")).toBe(false);
    expect(await cel.apagados.count()).toBe(0);
    await sincronizar(pc);
    expect(await pc.plantas.get("P46")).toBeUndefined();
  });

  it("a próxima ficha nunca volta para trás entre aparelhos", async () => {
    const cel = await aparelho();
    const pc = await aparelho();
    await sincronizar(cel);
    await sincronizar(pc);
    await definirFicha(cel, "P02", 70); // próxima vira 71 no celular
    await sincronizar(cel);
    await sincronizar(pc);
    expect(await lerMeta(pc, "proxima_ficha", 0)).toBe(71);
  });

  it("foto pendente vai para o Drive e libera o original", async () => {
    const cel = await aparelho();
    await cel.fotos.add({ id: "F1", planta_id: "P01", data: "2026-10-04", tipo: 1, arquivo_drive_id: null, nota_saude: null });
    await cel.arquivos_fotos.add({ id: "F1", original: new Blob(["x"], { type: "image/jpeg" }), miniatura: null });
    await sincronizar(cel);
    expect((await cel.fotos.get("F1"))!.arquivo_drive_id).toBe("drive-P01");
    expect((await cel.arquivos_fotos.get("F1"))!.original).toBeNull();
  });

  it("token errado dá mensagem clara", async () => {
    const cel = await aparelho();
    await gravarConfig(cel, "nuvem", { url: "https://exemplo/exec", token: "errado" });
    await expect(sincronizar(cel)).rejects.toThrow(/Token inválido/);
  });
});

describe("ajustes dos dados vindos da planilha", () => {
  it("converte números guardados como texto e vazios", () => {
    const r = normalizarRemoto("plantas", { id: "P1", ficha: "12", ph_min: "", tags: null, historico: null, luz: "Sol pleno" });
    expect(r.ficha).toBe(12);
    expect(r.ph_min).toBeNull();
    expect(r.tags).toEqual([]);
    expect(r.historico).toBe("");
    expect(r.luz).toBe("Sol pleno");
    expect(normalizarRemoto("medicoes", { id: "M", luz: "7" }).luz).toBe(7);
  });

  it("mescla próxima ficha e fichas excluídas", () => {
    expect(mesclarMeta("proxima_ficha", 60, 55)).toBe(60);
    expect(mesclarMeta("proxima_ficha", 50, 55)).toBeNull();
    expect(mesclarMeta("fichas_excluidas", [3], [5])).toEqual([3, 5]);
    expect(mesclarMeta("fichas_excluidas", [5], [5])).toBeNull();
    expect(mesclarMeta("ultimo_id_planta", "P70", "P65")).toBe("P70");
    expect(mesclarMeta("ultimo_id_planta", "P63", "P65")).toBeNull();
  });
});

describe("listas guardadas como texto na planilha", () => {
  it("marcos do projeto voltam como lista", () => {
    const r = normalizarRemoto("projetos", { id: "PR01", plantas: '["P41"]', marcos: '[{"data":"2026-10-20","texto":"Fase: A → B"}]' });
    expect(r.plantas).toEqual(["P41"]);
    expect(r.marcos).toEqual([{ data: "2026-10-20", texto: "Fase: A → B" }]);
    expect(normalizarRemoto("eventos", { id: "E", tentadas: "3", pegaram: "2" })).toMatchObject({ tentadas: 3, pegaram: 2 });
  });
});
