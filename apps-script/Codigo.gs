/**
 * Inventário Botânico — backend no Google Apps Script.
 *
 * Fica "preso" à planilha Google do inventário (Extensões → Apps Script) e é publicado como App da Web.
 * O app do celular chama este script para:
 *   - sincronizar: grava as alterações do aparelho (uma aba por tabela) e devolve as que vieram de outros aparelhos;
 *   - foto: guarda a foto original no Drive, em /Inventario Botanico/Fotos/<id> - <nome>.
 *
 * Segurança: toda chamada precisa do token gerado pela função configurar() (fica nas Propriedades do script).
 * As chaves de IA das próximas fases também ficarão aqui, nunca no app.
 */

const EPOCA = "1970-01-01T00:00:00.000Z";

// Tabela → campo que identifica a linha
const CHAVES = {
  plantas: "id", fotos: "id", medicoes: "id", eventos: "id", pendencias: "id", projetos: "id",
  insumos: "nome", lista_desejos: "id", zonas: "id", regras: "id", rotinas: "id", meta: "chave"
};

// Colunas guardadas como texto JSON (listas e objetos)
const COLUNAS_JSON = ["tags", "proibicoes", "alertas", "plantas", "insumos", "meses", "quando", "valor"];
// Colunas de sim/não
const COLUNAS_SIM_NAO = ["em_estoque", "ativa"];

const ABA_APAGADOS = "_apagados";

/** Rode UMA vez pelo editor (botão Executar) para gerar o token. Ele aparece no Registro de execução. */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty("TOKEN");
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, "");
    props.setProperty("TOKEN", token);
  }
  // cria as pastas de fotos já agora, para pedir a autorização do Drive de uma vez
  pastaDaPlanta_("_teste", "autorizacao").setTrashed(true);
  Logger.log("Seu token (copie e cole no app, em Configurações → Nuvem): " + token);
}

function doGet() {
  return responder_({ ok: true, app: "inventario-botanico" });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (!token || req.token !== token) return responder_({ erro: "Token inválido. Confira o token em Configurações → Nuvem." });
    if (req.acao === "sincronizar") return responder_(sincronizar_(req));
    if (req.acao === "foto") return responder_(salvarFoto_(req));
    if (req.acao === "ping") return responder_({ ok: true });
    return responder_({ erro: "Ação desconhecida: " + req.acao });
  } catch (err) {
    return responder_({ erro: String(err && err.message ? err.message : err) });
  }
}

function responder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------------

/**
 * req = { mudancas: { tabela: [registro, ...] }, apagados: [{tabela, chave, em}], desde: "ISO" | null }
 * Regra: vale a versão com "atualizado_em" mais recente. "_recebido_em" (hora do servidor) diz o que é novo para cada aparelho.
 */
function sincronizar_(req) {
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const agora = new Date().toISOString();
    const aceitos = {}; // tabela → chaves gravadas agora (não precisam voltar para quem enviou)

    // 1. grava o que o aparelho mandou
    const mudancas = req.mudancas || {};
    Object.keys(mudancas).forEach(function (tabela) {
      if (!CHAVES[tabela]) return;
      const chave = CHAVES[tabela];
      const aba = lerAba_(planilha, tabela);
      aceitos[tabela] = {};
      let mudou = false;
      mudancas[tabela].forEach(function (reg) {
        const k = String(reg[chave]);
        const atual = aba.porChave[k];
        if (atual && (reg.atualizado_em || EPOCA) <= (atual.atualizado_em || EPOCA)) return; // a da planilha é igual ou mais nova
        const novo = Object.assign({}, reg, { _recebido_em: agora });
        if (atual) aba.linhas[aba.linhas.indexOf(atual)] = novo; else aba.linhas.push(novo);
        aba.porChave[k] = novo;
        aceitos[tabela][k] = true;
        mudou = true;
      });
      if (mudou) escreverAba_(aba);
    });

    // 2. exclusões
    const apagados = req.apagados || [];
    if (apagados.length) {
      const abaAp = lerAba_(planilha, ABA_APAGADOS);
      const porTabela = {};
      apagados.forEach(function (a) {
        if (!CHAVES[a.tabela]) return;
        abaAp.linhas.push({ tabela: a.tabela, chave: String(a.chave), em: a.em, _recebido_em: agora });
        (porTabela[a.tabela] = porTabela[a.tabela] || []).push(a);
      });
      escreverAba_(abaAp);
      Object.keys(porTabela).forEach(function (tabela) {
        const aba = lerAba_(planilha, tabela);
        const antes = aba.linhas.length;
        porTabela[tabela].forEach(function (a) {
          const atual = aba.porChave[String(a.chave)];
          if (atual && (atual.atualizado_em || EPOCA) <= a.em) aba.linhas.splice(aba.linhas.indexOf(atual), 1);
        });
        if (aba.linhas.length !== antes) escreverAba_(aba);
      });
    }

    // 3. devolve o que é novo para este aparelho
    const desde = req.desde || "";
    const saida = {};
    Object.keys(CHAVES).forEach(function (tabela) {
      const aba = lerAba_(planilha, tabela);
      const chave = CHAVES[tabela];
      const novos = aba.linhas.filter(function (l) {
        return (l._recebido_em || "") > desde && !(aceitos[tabela] && aceitos[tabela][String(l[chave])]);
      }).map(function (l) {
        const c = Object.assign({}, l);
        delete c._recebido_em;
        return c;
      });
      if (novos.length) saida[tabela] = novos;
    });
    const apagadosSaida = lerAba_(planilha, ABA_APAGADOS).linhas
      .filter(function (a) { return (a._recebido_em || "") > desde; })
      .map(function (a) { return { tabela: a.tabela, chave: a.chave, em: a.em }; });

    return { ok: true, agora: agora, mudancas: saida, apagados: apagadosSaida };
  } finally {
    trava.releaseLock();
  }
}

/** Lê uma aba inteira como lista de objetos (a primeira linha é o cabeçalho). Cria a aba se não existir. */
function lerAba_(planilha, nome) {
  let sheet = planilha.getSheetByName(nome);
  if (!sheet) sheet = planilha.insertSheet(nome);
  const valores = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
  const cabecalho = valores.length ? valores[0].map(String).filter(function (c) { return c !== ""; }) : [];
  const chave = CHAVES[nome];
  const linhas = [];
  const porChave = {};
  for (let i = 1; i < valores.length; i++) {
    const obj = {};
    let vazia = true;
    cabecalho.forEach(function (col, j) {
      const v = deCelula_(col, valores[i][j]);
      if (v !== null) vazia = false;
      obj[col] = v;
    });
    if (vazia) continue;
    linhas.push(obj);
    if (chave) porChave[String(obj[chave])] = obj;
  }
  return { sheet: sheet, nome: nome, cabecalho: cabecalho, linhas: linhas, porChave: porChave };
}

/** Reescreve a aba inteira. Colunas novas entram no fim; textos ficam com formato "texto" para o Sheets não virar data. */
function escreverAba_(aba) {
  const chave = CHAVES[aba.nome];
  const colunas = aba.cabecalho.slice();
  const inicio = chave ? [chave] : ["tabela", "chave", "em"];
  inicio.forEach(function (c) { if (colunas.indexOf(c) < 0) colunas.unshift(c); });
  aba.linhas.forEach(function (l) {
    Object.keys(l).forEach(function (c) { if (colunas.indexOf(c) < 0) colunas.push(c); });
  });
  // "_recebido_em" sempre na última coluna
  colunas.splice(colunas.indexOf("_recebido_em") >= 0 ? colunas.indexOf("_recebido_em") : colunas.length, 1);
  colunas.push("_recebido_em");

  const matriz = [colunas].concat(aba.linhas.map(function (l) {
    return colunas.map(function (c) { return paraCelula_(c, l[c]); });
  }));
  const sheet = aba.sheet;
  sheet.clearContents();
  // coluna com algum texto → formato texto (senão o Sheets transforma "2026-10" em data)
  colunas.forEach(function (c, j) {
    const temTexto = matriz.some(function (linha, i) { return i > 0 && typeof linha[j] === "string" && linha[j] !== ""; });
    if (temTexto) sheet.getRange(1, j + 1, Math.max(matriz.length, 2), 1).setNumberFormat("@");
  });
  sheet.getRange(1, 1, matriz.length, colunas.length).setValues(matriz);
  sheet.setFrozenRows(1);
  aba.cabecalho = colunas;
}

function paraCelula_(col, v) {
  if (v === null || v === undefined) return "";
  if (COLUNAS_JSON.indexOf(col) >= 0 || (typeof v === "object")) return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return v;
}

function deCelula_(col, v) {
  if (v === "" || v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (COLUNAS_JSON.indexOf(col) >= 0 && typeof v === "string") {
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  if (COLUNAS_SIM_NAO.indexOf(col) >= 0) return v === true || v === "true" || v === "TRUE";
  return v;
}

// ---------------------------------------------------------------------------
// Fotos no Drive
// ---------------------------------------------------------------------------

/** req = { planta_id, nome_planta, nome_arquivo, mime, base64 } → { ok, id } */
function salvarFoto_(req) {
  const pasta = pastaDaPlanta_(req.planta_id, req.nome_planta);
  const blob = Utilities.newBlob(Utilities.base64Decode(req.base64), req.mime || "image/jpeg", req.nome_arquivo);
  const arquivo = pasta.createFile(blob);
  return { ok: true, id: arquivo.getId() };
}

function pastaDaPlanta_(id, nome) {
  const raiz = subpasta_(DriveApp.getRootFolder(), "Inventario Botanico");
  const fotos = subpasta_(raiz, "Fotos");
  return subpasta_(fotos, id + " - " + (nome || ""));
}

function subpasta_(mae, nome) {
  const it = mae.getFoldersByName(nome);
  return it.hasNext() ? it.next() : mae.createFolder(nome);
}
