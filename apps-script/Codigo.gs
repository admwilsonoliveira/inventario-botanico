/**
 * Inventário Botânico — backend no Google Apps Script.
 *
 * Fica "preso" à planilha Google do inventário (Extensões → Apps Script) e é publicado como App da Web.
 * O app do celular chama este script para:
 *   - sincronizar: grava as alterações do aparelho (uma aba por tabela) e devolve as que vieram de outros aparelhos;
 *   - foto: guarda a foto original no Drive, em /Inventario Botanico/Fotos/<id> - <nome>;
 *   - identificar: manda as fotos ao Pl@ntNet e devolve as 3 espécies mais prováveis;
 *   - analisar: pede ao Gemini a ficha da espécie e/ou o laudo de saúde, em JSON;
 *   - uso_ia: quanto da cota grátis de cada IA já foi usado hoje;
 *   - miniatura: versão pequena de uma foto do Drive (para a linha do tempo em outro aparelho).
 *
 * Segurança: toda chamada precisa do token gerado pela função configurar() (fica nas Propriedades do script).
 * As chaves de IA ficam só aqui, nas Propriedades do script (nunca no app):
 *   PLANTNET_KEY, GEMINI_KEY — obrigatórias para a Fase 2;
 *   GEMINI_MODELO (padrão gemini-3.8-flash), GEMINI_RESERVA (padrão gemini-3.7-flash,gemini-3.5-flash),
 *   GEMINI_LIMITE_DIA (padrão 20), PLANTNET_LIMITE_DIA (padrão 500) — opcionais.
 * Cada chamada de IA é anotada na aba "uso_ia"; ao chegar a 80% do limite do dia, novas chamadas são recusadas.
 */

const EPOCA = "1970-01-01T00:00:00.000Z";

// Tabela → campo que identifica a linha
const CHAVES = {
  plantas: "id", fotos: "id", medicoes: "id", eventos: "id", pendencias: "id", projetos: "id",
  insumos: "nome", lista_desejos: "id", zonas: "id", regras: "id", rotinas: "id", meta: "chave"
};

// Colunas guardadas como texto JSON (listas e objetos)
const COLUNAS_JSON = ["tags", "proibicoes", "alertas", "plantas", "insumos", "meses", "quando", "valor", "marcos"];
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
    if (req.acao === "identificar") return responder_(identificar_(req));
    if (req.acao === "analisar") return responder_(analisar_(req));
    if (req.acao === "uso_ia") return responder_({ ok: true, uso: usoHoje_() });
    if (req.acao === "miniatura") return responder_(miniatura_(req));
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

// ---------------------------------------------------------------------------
// IA: Pl@ntNet (identificação) e Gemini (ficha e laudo)
// ---------------------------------------------------------------------------

const ABA_USO_IA = "uso_ia";
const PLANTNET_URL = "https://my-api.plantnet.org/v2/identify/all";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

function prop_(nome, padrao) {
  const v = PropertiesService.getScriptProperties().getProperty(nome);
  return v === null || v === "" ? padrao : v;
}

function limites_() {
  return {
    plantnet: Number(prop_("PLANTNET_LIMITE_DIA", "500")),
    gemini: Number(prop_("GEMINI_LIMITE_DIA", "20"))
  };
}

function hoje_() {
  return Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
}

/** Contagem de chamadas de hoje por tipo, com o limite e o teto de 80%. */
function usoHoje_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_USO_IA);
  const contagem = { plantnet: 0, gemini: 0, tokens_gemini: 0 };
  if (sheet && sheet.getLastRow() > 1) {
    const hoje = hoje_();
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().forEach(function (l) {
      const data = l[0] instanceof Date ? Utilities.formatDate(l[0], "America/Sao_Paulo", "yyyy-MM-dd") : String(l[0]);
      if (data !== hoje) return;
      if (l[2] === "plantnet") contagem.plantnet += Number(l[3]) || 0;
      if (l[2] === "gemini") { contagem.gemini += Number(l[3]) || 0; contagem.tokens_gemini += Number(l[4]) || 0; }
    });
  }
  const lim = limites_();
  return {
    plantnet: { usado: contagem.plantnet, limite: lim.plantnet, teto: Math.floor(lim.plantnet * 0.8) },
    gemini: { usado: contagem.gemini, limite: lim.gemini, teto: Math.floor(lim.gemini * 0.8), tokens: contagem.tokens_gemini },
    modelo: prop_("GEMINI_MODELO", "gemini-3.8-flash")
  };
}

function anotarUso_(tipo, quantidade, tokens, detalhe) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = planilha.getSheetByName(ABA_USO_IA);
  if (!sheet) {
    sheet = planilha.insertSheet(ABA_USO_IA);
    sheet.appendRow(["data", "hora", "tipo", "quantidade", "tokens", "detalhe"]);
    sheet.setFrozenRows(1);
    sheet.getRange("A:B").setNumberFormat("@");
  }
  const agora = new Date();
  sheet.appendRow([hoje_(), Utilities.formatDate(agora, "America/Sao_Paulo", "HH:mm:ss"), tipo, quantidade, tokens || "", detalhe || ""]);
}

function conferirCota_(tipo) {
  const u = usoHoje_()[tipo];
  if (u.usado >= u.teto) {
    throw new Error("Cota grátis de hoje do " + (tipo === "plantnet" ? "Pl@ntNet" : "Gemini") +
      " chegou a 80% (" + u.usado + " de " + u.limite + "). Tente amanhã.");
  }
}

/** Monta um corpo multipart/form-data com vários campos de mesmo nome (o Pl@ntNet pede assim). */
function multipart_(campos, fronteira) {
  let bytes = [];
  const texto = function (s) { bytes = bytes.concat(Utilities.newBlob(s).getBytes()); };
  campos.forEach(function (c) {
    texto("--" + fronteira + "\r\n");
    if (c.blob) {
      texto('Content-Disposition: form-data; name="' + c.nome + '"; filename="' + c.blob.getName() + '"\r\n' +
        "Content-Type: " + c.blob.getContentType() + "\r\n\r\n");
      bytes = bytes.concat(c.blob.getBytes());
      texto("\r\n");
    } else {
      texto('Content-Disposition: form-data; name="' + c.nome + '"\r\n\r\n' + c.valor + "\r\n");
    }
  });
  texto("--" + fronteira + "--\r\n");
  return bytes;
}

/**
 * req = { imagens: [{ base64, mime, orgao }] }  (orgao: habit, leaf, flower, fruit, auto)
 * → { ok, candidatos: [{ score, nome_cientifico, nome_cientifico_autor, genero, familia, nomes_populares[] }], restantes }
 */
function identificar_(req) {
  const chave = prop_("PLANTNET_KEY", "");
  if (!chave) throw new Error("Falta a chave do Pl@ntNet (PLANTNET_KEY) nas Propriedades do script.");
  const imagens = (req.imagens || []).slice(0, 5);
  if (!imagens.length) throw new Error("Nenhuma foto enviada.");
  conferirCota_("plantnet");

  const campos = [];
  imagens.forEach(function (img, i) {
    campos.push({ nome: "images", blob: Utilities.newBlob(Utilities.base64Decode(img.base64), img.mime || "image/jpeg", "foto" + (i + 1) + ".jpg") });
  });
  imagens.forEach(function (img) { campos.push({ nome: "organs", valor: img.orgao || "auto" }); });
  const fronteira = "----inventario" + Utilities.getUuid().replace(/-/g, "");
  const url = PLANTNET_URL + "?api-key=" + encodeURIComponent(chave) + "&lang=pt-br&nb-results=3&include-related-images=false";
  const resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "multipart/form-data; boundary=" + fronteira,
    payload: multipart_(campos, fronteira),
    muteHttpExceptions: true
  });
  const codigo = resp.getResponseCode();
  anotarUso_("plantnet", 1, "", "HTTP " + codigo);
  if (codigo === 404) return { ok: true, candidatos: [], restantes: null };
  if (codigo === 429) throw new Error("O Pl@ntNet recusou: limite de uso atingido. Tente amanhã.");
  if (codigo === 401) throw new Error("O Pl@ntNet recusou a chave (PLANTNET_KEY). Confira nas Propriedades do script.");
  if (codigo !== 200) throw new Error("Erro do Pl@ntNet (" + codigo + "): " + resp.getContentText().slice(0, 200));

  const json = JSON.parse(resp.getContentText());
  const candidatos = (json.results || []).slice(0, 3).map(function (r) {
    const sp = r.species || {};
    return {
      score: r.score,
      nome_cientifico: sp.scientificNameWithoutAuthor || "",
      nome_cientifico_autor: sp.scientificName || "",
      genero: sp.genus ? sp.genus.scientificNameWithoutAuthor : "",
      familia: sp.family ? sp.family.scientificNameWithoutAuthor : "",
      nomes_populares: sp.commonNames || []
    };
  });
  return { ok: true, candidatos: candidatos, restantes: json.remainingIdentificationRequests };
}

/**
 * req = { instrucoes: "texto", imagens: [{ base64, mime }], esquema: {JSON Schema} }
 * → { ok, resultado: {objeto JSON}, tokens }
 */
function analisar_(req) {
  const chave = prop_("GEMINI_KEY", "");
  if (!chave) throw new Error("Falta a chave do Gemini (GEMINI_KEY) nas Propriedades do script.");
  conferirCota_("gemini");
  // modelo principal e reservas (todos com cota grátis), usados se o principal estiver sobrecarregado.
  // O último modelo que respondeu bem vai primeiro (lembrado por 1 hora), para não esperar o sobrecarregado de novo.
  let modelos = [prop_("GEMINI_MODELO", "gemini-3.8-flash")].concat(
    prop_("GEMINI_RESERVA", "gemini-3.7-flash,gemini-3.5-flash").split(",").map(function (m) { return m.trim(); }).filter(Boolean)
  );
  const cache = CacheService.getScriptCache();
  const ultimoOk = cache.get("gemini_modelo_ok");
  if (ultimoOk && modelos.indexOf(ultimoOk) > 0) modelos = [ultimoOk].concat(modelos.filter(function (m) { return m !== ultimoOk; }));

  const entrada = [{ type: "text", text: req.instrucoes }].concat((req.imagens || []).slice(0, 6).map(function (img) {
    return { type: "image", data: img.base64, mime_type: img.mime || "image/jpeg" };
  }));

  let ultimo = null;
  for (let m = 0; m < modelos.length; m++) {
    const modelo = modelos[m];
    for (let tentativa = 0; tentativa < 1; tentativa++) { // uma tentativa por modelo: sobrecarga costuma demorar ~1 min para responder
      const corpo = { model: modelo, input: entrada, store: false };
      if (req.esquema) corpo.response_format = { type: "text", mime_type: "application/json", schema: req.esquema };
      let resp = chamarGemini_(GEMINI_URL, corpo, chave);
      // se o formato com esquema for recusado, tenta de novo pedindo só JSON no texto
      if (resp.getResponseCode() === 400 && corpo.response_format) {
        delete corpo.response_format;
        resp = chamarGemini_(GEMINI_URL, corpo, chave);
      }
      const codigo = resp.getResponseCode();
      if (codigo === 200) {
        const json = JSON.parse(resp.getContentText());
        const tokens = (json.usage && json.usage.total_tokens) || (json.usageMetadata && json.usageMetadata.totalTokenCount) || "";
        anotarUso_("gemini", 1, tokens, modelo);
        cache.put("gemini_modelo_ok", modelo, 3600);
        const texto = textoDaResposta_(json);
        if (!texto) throw new Error("O Gemini não devolveu texto.");
        return { ok: true, resultado: lerJson_(texto), tokens: tokens, modelo: modelo };
      }
      // falha não conta na cota do dia (quantidade 0), só fica anotada
      anotarUso_("gemini", 0, "", modelo + " HTTP " + codigo);
      ultimo = { codigo: codigo, texto: resp.getContentText().slice(0, 200), modelo: modelo };
      if (codigo === 400 || codigo === 401 || codigo === 403) {
        throw new Error("O Gemini recusou o pedido (" + codigo + "). Confira a chave GEMINI_KEY e o modelo " + modelo + ". " + ultimo.texto);
      }
      // sobrecarga (503/500), modelo indisponível (404) ou cota dele esgotada (429): vai para a reserva
      if (cache.get("gemini_modelo_ok") === modelo) cache.remove("gemini_modelo_ok");
    }
  }
  if (ultimo && ultimo.codigo === 429) throw new Error("O Gemini recusou: cota grátis atingida em todos os modelos. Tente mais tarde.");
  throw new Error("O Gemini está sobrecarregado agora (" + (ultimo ? ultimo.codigo : "?") + "). Isso costuma passar em alguns minutos: tente de novo.");
}

function chamarGemini_(url, corpo, chave) {
  return UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": chave },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
}

/** Junta o texto da resposta, aceitando os formatos conhecidos da API. */
function textoDaResposta_(json) {
  if (typeof json.output_text === "string") return json.output_text;
  const partes = [];
  (json.steps || []).forEach(function (s) {
    (s.content || []).forEach(function (c) { if (c.type === "text" && c.text) partes.push(c.text); });
  });
  (json.outputs || []).forEach(function (o) { if (o.text) partes.push(o.text); });
  if (!partes.length && json.candidates && json.candidates[0] && json.candidates[0].content) {
    (json.candidates[0].content.parts || []).forEach(function (p) { if (p.text) partes.push(p.text); });
  }
  return partes.join("");
}

function lerJson_(texto) {
  const cerca = String.fromCharCode(96, 96, 96); // três crases
  let limpo = texto.trim();
  if (limpo.indexOf(cerca) === 0) limpo = limpo.replace(/^\S*\s*/, "");
  if (limpo.lastIndexOf(cerca) === limpo.length - 3) limpo = limpo.slice(0, -3);
  limpo = limpo.trim();
  try {
    return JSON.parse(limpo);
  } catch (e) {
    const ini = limpo.indexOf("{"), fim = limpo.lastIndexOf("}");
    if (ini >= 0 && fim > ini) return JSON.parse(limpo.slice(ini, fim + 1));
    throw new Error("A resposta do Gemini não veio em JSON.");
  }
}

/** Rode pelo editor depois de colocar as chaves: confere as duas e pede a autorização de acesso à internet. */
function testarChaves() {
  const pn = prop_("PLANTNET_KEY", "");
  if (!pn) Logger.log("❌ Falta PLANTNET_KEY");
  else {
    const r = UrlFetchApp.fetch("https://my-api.plantnet.org/v2/quota/daily?api-key=" + encodeURIComponent(pn), { muteHttpExceptions: true });
    Logger.log(r.getResponseCode() === 200 ? "✅ Pl@ntNet ok: " + r.getContentText().slice(0, 200) : "❌ Pl@ntNet recusou (" + r.getResponseCode() + ")");
  }
  const gm = prop_("GEMINI_KEY", "");
  if (!gm) Logger.log("❌ Falta GEMINI_KEY");
  else {
    const modelo = prop_("GEMINI_MODELO", "gemini-3.8-flash");
    const r = chamarGemini_(GEMINI_URL, { model: modelo, input: "Responda só: ok", store: false }, gm);
    Logger.log(r.getResponseCode() === 200
      ? "✅ Gemini ok (" + modelo + "): " + textoDaResposta_(JSON.parse(r.getContentText())).slice(0, 50)
      : "❌ Gemini recusou (" + r.getResponseCode() + "): " + r.getContentText().slice(0, 300));
  }
}

/** req = { id } (arquivo do Drive) → { ok, base64, mime } com até 800 px de largura. */
function miniatura_(req) {
  const arquivo = DriveApp.getFileById(req.id);
  const r = UrlFetchApp.fetch("https://drive.google.com/thumbnail?id=" + encodeURIComponent(req.id) + "&sz=w800", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const blob = r.getResponseCode() === 200 ? r.getBlob() : arquivo.getThumbnail();
  return { ok: true, base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() || "image/jpeg" };
}
