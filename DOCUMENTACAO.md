# Inventário Botânico — Documentação completa

> App pessoal do Wilson para cuidar da coleção de plantas em Patrocínio – MG (cerrado de altitude).
> Substitui a planilha "Inventário Botânico Mestre": fichas numeradas, grupos, regas, adubações com dose, medições, fotos, pendências, projetos e propagação, com identificação e diagnóstico por IA.

| | |
|---|---|
| **App (celular e computador)** | https://admwilsonoliveira.github.io/inventario-botanico/ |
| **Código** | https://github.com/admwilsonoliveira/inventario-botanico |
| **Planilha na nuvem** | "Inventário Botânico", no Google Drive do Wilson |
| **Fotos** | Google Drive → `Inventario Botanico/Fotos/<código> - <nome>` |
| **Versão atual** | 0.5.0 (todas as fases do plano concluídas) |
| **Custo de operação** | Zero (só serviços gratuitos) |

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Como funciona por dentro](#2-como-funciona-por-dentro)
3. [Guia de uso, tela por tela](#3-guia-de-uso-tela-por-tela)
4. [Regras de cultivo (motor de regras)](#4-regras-de-cultivo-motor-de-regras)
5. [Calculadora de doses](#5-calculadora-de-doses)
6. [Rotinas, clima e check-up](#6-rotinas-clima-e-check-up)
7. [Inteligência artificial](#7-inteligência-artificial)
8. [Nuvem: planilha, Drive e sincronização](#8-nuvem-planilha-drive-e-sincronização)
9. [Modelo de dados](#9-modelo-de-dados)
10. [O script do Google (Apps Script)](#10-o-script-do-google-apps-script)
11. [Para quem for mexer no código](#11-para-quem-for-mexer-no-código)
12. [Solução de problemas](#12-solução-de-problemas)
13. [Histórico do projeto e decisões](#13-histórico-do-projeto-e-decisões)
14. [Pendências e ideias](#14-pendências-e-ideias)

---

## 1. Visão geral

### O que o app faz

| Área | O que você consegue fazer |
|---|---|
| **Inventário** | 62 plantas da carga inicial (e as novas), cada uma com ficha numerada, grupo, zona, pH, gatilho de rega, luz, vaso, substrato, adubação, tags e proibições |
| **Registro rápido** | Reguei, Adubei (com calculadora de dose), Medi (diz se é para regar ou aguardar), Foto e Outro (poda, transplante, tratamento…) |
| **Regras** | 18 regras do seu protocolo conferidas antes de salvar qualquer registro, bloqueando ou alertando |
| **Hoje** | Clima de hoje e da semana, alertas (calor, ar seco, chuvas), lembretes de rotina, check-up do dia e pendências |
| **Escanear** | Identifica a planta pela foto (Pl@ntNet) e gera ficha da espécie e laudo de saúde (Gemini) |
| **Check-up e consultor** | Laudo de saúde a partir de fotos; conversa com a IA sobre uma planta específica |
| **Evolução** | Projetos com fases e marcos, propagação com taxa de sucesso, mapa de zonas de luz e fotos lado a lado |
| **Estoque** | Insumos em estoque, com baixa automática em gramas a cada adubação |
| **Nuvem** | Tudo espelhado numa planilha Google; fotos no Drive; celular e computador sincronizados |
| **Exportação** | Arquivo Excel (.xlsx) com todas as tabelas, a qualquer momento |
| **Etiquetas** | QR de cada planta em folha A4 (24 por folha); o QR abre a ficha |

### Requisitos que guiaram tudo

1. **Custo zero.** Só serviços gratuitos. Antes de qualquer coisa que pudesse gerar cobrança, a decisão foi do Wilson (e ele escolheu manter a cota grátis).
2. **Celular primeiro.** Botões grandes, uma mão, em pé ao lado do vaso.
3. **Funciona sem internet** para consultar e registrar; sincroniza quando a internet volta.
4. **Chaves de IA nunca no app.** Ficam guardadas no script do Google.
5. **Nada de dado inventado.** O que não veio do inventário fica vazio para o Wilson preencher; o que a IA sugere vem marcado como "parâmetros sugeridos".

---

## 2. Como funciona por dentro

```
                 ┌────────────────────────────── Celular / Computador ───────────────────────────────┐
                 │  App (PWA)  ──  banco local no aparelho (IndexedDB)  ──  funciona sem internet    │
                 └───────────────┬───────────────────────────────────────────────┬─────────────────┘
                                 │ sincroniza (com token)                         │ previsão do tempo
                                 ▼                                                ▼
              ┌──────────── Google (conta do Wilson) ────────────┐        Open-Meteo (sem chave)
              │  Apps Script "App da Web"  (guarda as chaves)    │
              │     ├── Planilha "Inventário Botânico" (abas)     │
              │     ├── Google Drive (fotos originais)            │
              │     ├── Pl@ntNet  → identificação                 │
              │     └── Gemini    → ficha, laudo, consultor, visor│
              └───────────────────────────────────────────────────┘
```

| Peça | Tecnologia | Por quê |
|---|---|---|
| App | PWA com Vite + React + TypeScript | Instala no celular como app e roda sem internet |
| Hospedagem | GitHub Pages | Grátis; publica sozinho a cada envio de código |
| Banco local | IndexedDB (biblioteca Dexie) | Rápido e offline; cada aparelho tem sua cópia |
| Nuvem | Google Sheets via Apps Script | Grátis; a planilha vira o espelho que o Wilson já conhece |
| Fotos | Google Drive | Grátis; uma pasta por planta |
| Identificação | Pl@ntNet | Especialista em plantas; 500 identificações grátis por dia |
| Ficha, laudo e conversa | Gemini (cota grátis) | Lê fotos e responde em JSON |
| Clima | Open-Meteo | Grátis e sem chave |

**PWA** = site que se instala como app ("Adicionar à tela inicial") e guarda uma cópia de si mesmo para abrir sem internet. Quando há versão nova, ele se atualiza sozinho ao abrir ou ao voltar para a tela.

---

## 3. Guia de uso, tela por tela

A barra de baixo tem 5 abas: **🌿 Plantas · 📅 Hoje · 📷 Escanear · 📝 Revisão · ⚙️ Config.**

### 🌿 Plantas (lista)

- Busca por nome popular, científico ou nº da ficha.
- **Por grupo** ou **Por zona**, com filtros no topo. O filtro escolhido é lembrado ao voltar da ficha.
- **🗑 Removidas** mostra as plantas que saíram da coleção.
- Atalhos: **+ Nova planta**, **⭐ Desejos**, **📐 Projetos**, **🌱 Propagação**, **🗺️ Zonas**.

Grupos atuais:

| Nº | Nome |
|---|---|
| 1 | Deserto e suculentas |
| 2 | Tropicais de folhagem |
| 3 | Floríferas |
| 4 | Mudas |
| 5 | Frutíferas e horta |

### Ficha da planta

Abre pela lista ou pelo **QR da etiqueta**. Mostra, de cima para baixo:

1. Nº da ficha, código (ex.: P08), nome e selos: situação, **parâmetros sugeridos** e ⚠ alertas.
2. **Registro rápido:** 💧 Reguei · 🧪 Adubei · 📏 Medi · 📷 Foto · 📝 Outro.
3. **🩺 Check-up com IA** e **💬 Perguntar à IA**.
4. **Última medição**, com "💧 Regar" ou "⏳ Aguardar" (e "✔ Regada" se já houve rega depois).
5. Dados da ficha (botão **Editar ficha**).
6. **Pendências** da planta (concluir, reabrir, apagar e criar nova).
7. **Fotos** (com link **ver evolução ›** quando há duas ou mais).
8. **Projetos** de que a planta faz parte.
9. **Histórico de eventos** (cada registro pode ser apagado no ✕).
10. **QR** da planta.
11. **Remover da coleção** → depois, na planta removida, **Voltar para a coleção** ou **Excluir definitivamente** (apaga ficha, eventos, medições, fotos e pendências; o nº da ficha e o código nunca são reaproveitados).

### Registro rápido

| Botão | O que pede | Observações |
|---|---|---|
| 💧 **Reguei** | Volume (opcional), data, observação | Protocolo: água de torneira |
| 🧪 **Adubei** | Produto em estoque, dose (g/L), água da rega (L), modo de aplicação | A calculadora mostra quanto pesar ou quantos ml de solução-mãe; dá baixa no estoque |
| 📏 **Medi** | Umidade 1–5 (botões grandes), sonda no colo/borda, pH, luz 1–9, temperatura | Responde **REGAR** ou **AGUARDAR**; botão **📷 Ler pelo visor** preenche pela foto do medidor |
| 📷 **Foto** | Tipo (1 a 7) e a foto | O original vai para o Drive na próxima sincronização |
| 📝 **Outro** | Tipo do evento, produto, aplicação, % de folhagem (podas), substrato usado (transplantes) | Poda, desponte, decapitação, transplante, renovação de substrato, lixiviação, acidificação, tratamento, propagação, plantio, colheita, tutoramento, mudança de lugar, chegada, observação, decisão |

Antes de salvar, as **regras** são conferidas: **⛔ Não permitido** bloqueia o botão; **⚠ Atenção** exige tocar "Salvar mesmo assim".

### 📅 Hoje

De cima para baixo:

1. **🌤️ Hoje:** temperatura e umidade do ar agora, máxima/mínima e chuva prevista.
2. **⛅ Próximos 7 dias** (sem alertas) ou os **alertas de clima** coloridos.
3. **🔁 Lembretes de rotina:** lixiviação, acidificação das acidófilas, retomada da adubação (em outubro), com atalhos para registrar.
4. **🩺 Check-up do dia:** cerca de 2 plantas por dia, mais as atrasadas do mês.
5. **Pendências:** atrasadas, hoje, próximos 7 dias, este mês e mais adiante. O círculo ○ conclui; "desfazer" volta atrás.
6. **+ Pendência**, **📝 Evento geral** e **Histórico geral de eventos**.

### 📷 Escanear

1. Fotos guiadas com moldura. **1 (porte inteiro)** e **2 (folha madura)** são obrigatórias; 3 a 7 são opcionais (flor ou fruto ajuda muito na identificação).
2. Foto tremida é recusada, mostrando a nitidez medida ("Está boa, usar" permite forçar).
3. **🔍 Identificar:** o Pl@ntNet mostra 3 espécies com %. Com 80% ou mais, já vem selecionada; abaixo disso, você escolhe ou tira outra foto.
4. **Seguir:**
   - se a espécie **já está no inventário**, o app pergunta se é a mesma planta → **check-up** (só laudo);
   - se for **nova** → o Gemini gera a **ficha da espécie + laudo**.
5. Decisão: **➕ Incluir no inventário** (cria com a próxima ficha e abre o questionário), **⭐ Lista de desejos** ou **Descartar**.
6. **Se o Gemini falhar** (sobrecarga do Google): **↻ Tentar de novo**, ou o plano B: **➕ Incluir só com a identificação**, **⭐ Lista de desejos** ou, no check-up, **💾 Guardar as fotos sem laudo**.

Durante a espera, a tela fica acesa, aparece um contador de segundos e há o botão **Cancelar**.

### 🩺 Laudo de saúde

- **Nota geral** de 0 a 10 e subnotas (vigor, cor/nutrição, pragas/doenças, estrutura, vaso/substrato).
- **👁 Visto nas fotos** — só o que aparece de fato.
- **❓ Suspeitas** — hipóteses com mecanismo e probabilidade (separadas do que foi visto).
- **📏 Para confirmar** — o que medir (foto não mostra raiz, pH nem umidade interna).
- **✅ Ações** — conferidas pelas regras: as bloqueadas aparecem riscadas com o motivo; insumo sem estoque vira "precisa comprar"; cada ação pode virar pendência.
- **Salvar check-up no histórico** grava o resumo como evento e manda as fotos para o Drive.

### 💬 Perguntar à IA (consultor)

Conversa sobre uma planta. A IA recebe a ficha, as proibições, o histórico, a última medição, o clima, os insumos em estoque e as 6 últimas perguntas. A resposta e as ações passam pelas regras. **Salvar conversa no histórico** grava tudo na ficha. Cada pergunta gasta uma análise da cota do dia.

### 📝 Revisão

Para os pontos da carga inicial que só o Wilson podia decidir:

1. **Conflitos e confirmações** — Confirmar, Editar ou Excluir.
2. **Números de ficha que faltam** — campo por planta ou **🔢 Numerar todas automaticamente**.
3. **Parâmetros sugeridos para conferir.**

### ⭐ Lista de desejos

Prioridade, espécie, luz que precisa, época e preço-alvo. Mostra **em que zonas da casa a planta cabe** pela luz e alerta **cor impossível** (ex.: "caládio azul" = indício de golpe na compra online). **Comprei** transforma o desejo em ficha nova.

### 📐 Projetos

Fase atual, próximo marco e linha do tempo. **Avançar fase** e **Marco atingido** registram a data; o marco aparece também no histórico de cada planta do projeto. Dá para incluir ou tirar plantas, editar e apagar.

### 🌱 Propagação

Lotes em andamento (status "em propagação" ou tag `propagacao`) com dias desde o início. **Registrar resultado** pergunta quantas pegaram: o lote vira planta ativa com essa quantidade (ou sai da coleção se nenhuma pegou). **Taxa de sucesso** por método (estaquia, semente, alporquia, divisão) e por espécie. **+ Nova propagação** parte da planta-mãe e herda a espécie, o grupo, os parâmetros e as proibições dela.

### 🗺️ Zonas

Cada zona com ☀️ sol pleno (5 h ou mais de sol direto), ⛅ meia-sombra (2 a 5 h) ou 🌥️ luz filtrada (até 2 h), calculado a partir do texto do horário de sol (ex.: "16h30–18h"). Mostra as plantas de cada zona e marca em **vermelho** as que pedem outra luz. Em "Sem zona definida", o seletor ao lado de cada planta põe a planta na zona.

### 🖼️ Evolução das fotos

Duas fotos lado a lado (por padrão, a primeira e a última do mesmo tipo). Toque em duas fotos para escolher. No computador, as fotos tiradas no celular vêm do Drive.

### ⚙️ Configurações

- **Nuvem:** endereço do App da Web + token; "Sincronizar agora".
- **Escaneamento e IA:** uso de hoje (Pl@ntNet e Gemini) e nitidez mínima das fotos.
- **Estoque e etiquetas:** 🧺 Insumos e 🏷️ Imprimir etiquetas.
- **Rotinas:** intervalo da acidificação (padrão de 14 dias).
- **Exportar para Excel.**
- **Regras:** ligar/desligar cada uma e editar o texto.
- **Dados neste aparelho** e **Restaurar carga inicial** (dupla confirmação: digitar RESTAURAR).

### 🏷️ Etiquetas

Folha A4 com 24 etiquetas (3 × 8, 70 × 37 mm): QR, nº da ficha, nome popular e científico, código e grupo. Escolha quais imprimir e "pule" as primeiras para aproveitar uma folha já usada. Imprima em **A4, margens: nenhuma, escala 100%**, e sempre pelo app publicado (o QR leva ao endereço de onde a página foi aberta).

---

## 4. Regras de cultivo (motor de regras)

O motor é código comum, **sem IA**. Ele roda (a) antes de salvar um evento e (b) sobre toda resposta da IA antes de mostrá-la. Uma regra dispara quando **todas** as suas condições são verdadeiras.

| Regra | Tipo | Quando | Mensagem (resumo) |
|---|---|---|---|
| R01 | ⛔ bloqueia | Forth Flores em planta com proibição `forth_flores` | Forth Flores é proibido para esta planta |
| R02 | ⛔ | Vermiculita em planta com proibição `vermiculita` | Risco de podridão |
| R03 | ⚠ alerta | Adubação de junho a setembro, sem a tag `excecao_pausa` | Pausa geral de adubação |
| R04 | ⛔ | Farinha de osso e Forth Flores na mesma planta em até 30 dias | Acúmulo de fósforo |
| R05 | ⛔ | Acidificação em planta sem a tag `acidofila` | Vinagre só nas acidófilas |
| R06 | ⛔ | Vinagre aplicado na folha | Proibido na folhagem |
| R07 | ⛔ | K-Othrine ou amido de milho | Produto proibido |
| R08 | ⛔ | Água de chuva | Só água de torneira |
| R09 | ⚠ | Anticloro | Introduz sódio e distorce o medidor |
| R10 | ⚠ | Poda acima de 33% da folhagem | Nunca mais de 1/3 |
| R11 | ⚠ | Transplante, poda estrutural ou renovação de substrato fora de outubro | Grandes intervenções em outubro |
| R12 | ⛔ | Adubo junto com a rega em planta com tag `periodo_seco` ou `sem_adubacao` | Não serve para período seco/dormência |
| R13 | ⛔ | Adubação em planta com proibição `adubacao` | Dormência induzida |
| R14 | ⚠ | Transplante em planta com proibição `transplante_duplo` | Evitar segundo transplante |
| R15 | ⚠ | Decapitação e transplante no mesmo dia | Não combinar |
| R16 | ⚠ | Recomendação da IA fala em "quarentena" | Protocolo sem quarentena desde 12/09/2026 |
| R17 | ⚠ | Desejo com cor impossível (caládio azul, morango azul, rosa arco-íris) | Indício de golpe |
| R18 | ⚠ | Forth Flores em planta com tag `cor_por_ph` (hortênsia) | Fósforo bloqueia o alumínio (azul) |

Protocolos que também vão em todo pedido à IA:

- só água de torneira;
- gatilho de rega pelo medidor no colo;
- pausa de adubação de junho a setembro;
- adubo líquido junto com a rega;
- grandes intervenções em outubro;
- sem quarentena;
- remédios permitidos: neem, sabão de potássio/detergente neutro à noite, canela;
- só insumos em estoque, ou "precisa comprar".

---

## 5. Calculadora de doses

- **Massa (g) = dose (g/L) × volume de rega (L).**
- A partir de 0,3 g → **pesar** na balança.
- Abaixo de 0,3 g → **solução-mãe**: ml na seringa = massa ÷ concentração da mãe (g/ml), arredondado a 0,1 ml. Exemplo do protocolo: 0,2 g/L em 1 L com mãe de 0,1 g/ml → **2,0 ml**.
- Seringa de 3 ml: acima disso, divide em puxadas iguais (ex.: 5 ml → 2 puxadas de 2,5 ml).
- A cada adubação salva com produto, dose e volume, o estoque desse produto diminui, se a quantidade estiver controlada em g ou kg na tela Insumos. Quando zera, o insumo vira "sem estoque".

---

## 6. Rotinas, clima e check-up

| Item | Regra |
|---|---|
| **Gatilho de rega** | Regar quando o medidor no colo marcar o nível do gatilho da planta ou menos (escala 1 = muito seco … 5 = muito molhado) |
| **Lixiviação** | Lembrete se a última lixiviação geral foi há 30 dias ou mais |
| **Acidificação** | Acidófilas (Azaleias, Ixora…) sem acidificação no intervalo configurado (padrão de 14 dias) |
| **Retomada da adubação** | Em outubro, lista as plantas ainda não adubadas no mês (fora dormência, "a plantar" e "a semear") |
| **Check-up do mês** | Cada planta tem um dia fixo no mês (ordem da ficha), cerca de 2 por dia; quem teve check-up nos últimos 15 dias não entra |
| **Alerta de calor** | Máxima prevista de 32 °C ou mais |
| **Alerta de ar seco** | Umidade mínima do ar de 30% ou menos |
| **Início das chuvas** | Menos de 5 mm nos 7 dias passados e um dia com 10 mm ou mais pela frente |

O clima vem do Open-Meteo para lat −18,94 / lon −46,99 e fica guardado por 1 hora.

---

## 7. Inteligência artificial

### Quem faz o quê

| Serviço | Uso | Cota grátis | Proteção |
|---|---|---|---|
| **Pl@ntNet** (`my-api.plantnet.org/v2/identify/all`) | Identificação: 3 espécies com % | 500 por dia | Para em 400 (80%) |
| **Gemini** (API "interactions") | Ficha da espécie, laudo, consultor, leitura do visor | Limite por modelo, visto no AI Studio | Para em 80% do `GEMINI_LIMITE_DIA` (padrão 20 → 16 por dia) |

- Nenhuma IA é chamada sozinha. Só quando o Wilson toca em Identificar, Seguir, Analisar, Perguntar ou Ler pelo visor.
- As fotos vão reduzidas a 1568 px (JPEG 80%); o original vai para o Drive.
- Órgãos enviados ao Pl@ntNet: foto 1 → `habit`; 2 e 3 → `leaf`; 5 → `flower` ou `fruit`. Os nomes vêm em `pt-br`.
- Na cota grátis, o Google pode usar o conteúdo enviado para melhorar os produtos dele. Foi aceito para fotos de plantas.

### Modelos do Gemini e sobrecarga

A cota grátis do Gemini às vezes responde **503 ("sobrecarregado")**. O script se defende assim:

1. Tenta primeiro o **último modelo que respondeu bem** (lembrado por 1 hora).
2. Se falhar, passa pelos modelos reserva: `gemini-3.8-flash` (principal) → 3.7-flash → 3.6-flash → 3.5-flash → 3.5-flash-lite → 3.1-flash-lite → 2.5-flash → 2.5-flash-lite.
3. Se todos falharem rápido, espera 10 s e faz **uma segunda rodada** (até cerca de 4 minutos no total).
4. Tentativas que falham **não contam** na cota do dia; ficam anotadas na aba `uso_ia` com o código e a mensagem do Google.
5. No app: **Tentar de novo** e o **plano B** sem IA (ver seção 3).

O modelo principal e a lista de reservas podem ser trocados nas Propriedades do script (`GEMINI_MODELO`, `GEMINI_RESERVA`) sem mexer no código.

### O que a IA recebe

Só o necessário:

- mês atual e clima de Patrocínio;
- tipos de foto enviados;
- espécie identificada e a confiança;
- ficha, parâmetros, tags, **proibições** e histórico da planta;
- última medição e últimos registros;
- grupos e **insumos em estoque**;
- protocolos fixos.

A resposta é pedida **só em JSON**, no formato do `CLAUDE.md` (ficha + laudo), ou nos formatos menores do laudo, do consultor e do visor.

---

## 8. Nuvem: planilha, Drive e sincronização

### O que vai para a nuvem

A planilha "Inventário Botânico" tem uma aba por tabela: `plantas`, `eventos`, `medicoes`, `pendencias`, `fotos`, `projetos`, `insumos`, `lista_desejos`, `zonas`, `regras`, `rotinas`, `meta`. Há ainda as abas de controle `_apagados` (exclusões) e `uso_ia` (cada chamada de IA). Textos ficam com formato "texto" para o Sheets não transformar "2026-10" em data; listas ficam como texto JSON.

### Como a sincronização decide

- Todo registro tem um **carimbo de alteração** (`atualizado_em`). **Vale a versão mais recente.**
- Os dados da carga inicial têm a "data zero", então qualquer edição sua sempre ganha deles. Por isso um aparelho novo, com a carga original, não apaga o que você fez no celular.
- Cada aparelho envia só o que mudou desde o último envio e recebe só o que chegou à planilha desde o último recebimento (pelo relógio do Google, não do aparelho).
- **Exclusões** são anotadas e repassadas, para sumirem nos outros aparelhos também.
- Valores que não podem voltar atrás são **juntados**: a próxima ficha vale a maior, as fichas excluídas são somadas, e o último código de planta usado vale o maior.
- Fotos: o original fica no aparelho até subir para o Drive; depois sobra só a miniatura.

### Quando sincroniza

Sozinho: ao abrir o app, ao voltar a internet, ao voltar para a tela e cerca de 8 s depois de cada alteração. Também pelo botão **Sincronizar agora** ou tocando na faixa "☁ Sincronizado". Sem internet, tudo continua funcionando e as alterações esperam.

### Numeração

- **Ficha:** a próxima é a maior já usada + 1. Nunca reaproveita número de ficha excluída. Em 04/10/2026, 55 fichas foram numeradas automaticamente por grupo (os números não batem com a planilha antiga).
- **Código da planta** (P01…P62, P63…): também nunca é reaproveitado.

---

## 9. Modelo de dados

| Tabela | Campos principais |
|---|---|
| **plantas** | id, ficha, nome_popular, nome_cientifico, grupo, quantidade, status, data_entrada, origem, zona, ph_min/max, rega_gatilho_min/max, luz, vaso, substrato, adubacao, objetivo, tags[], proibicoes[], historico, params_origem (inventario / sugerido / confirmado), alertas[], qr_code, excluida_em |
| **eventos** | id, planta_id (vazio = geral), data, tipo, produto, dose_g_l, volume_ml, observacao, aplicacao (rega/foliar/substrato), agua, insumos[], percentual_area_foliar, tentadas, pegaram, especie |
| **medicoes** | id, planta_id, data_hora, umidade (1–5), ph, luz (1–9), temperatura, local_sonda (colo/borda) |
| **fotos** | id, planta_id, data, tipo (1–7), arquivo_drive_id, nota_saude |
| **pendencias** | id, planta_id, data_prevista (dia, mês "2026-10" ou ano), acao, concluida_em |
| **projetos** | id, nome, plantas[], fase_atual, proximo_marco, marcos[] {data, texto} |
| **insumos** | nome, categoria (npk, nutricao, correcao, fitossanidade, estrutura), em_estoque, quantidade, unidade, observacao |
| **lista_desejos** | id, nome, especie, prioridade, zona_compativel, epoca_compra, preco_alvo, observacao |
| **zonas** | id, nome, sol_direto |
| **regras** | id, tipo (bloquear/alertar), quando {condições}, mensagem, ativa |
| **rotinas** | id, nome, frequencia, alvo, mes/meses |
| **meta** | proxima_ficha, fichas_excluidas, ultimo_id_planta, grupos, local, escalas, ferramentas… |

Todas as tabelas acima também têm `atualizado_em`. Só no aparelho (não vão para a nuvem): `apagados` (exclusões a enviar), `arquivos_fotos` (original e miniatura) e `config_local` (endereço, token, datas de sincronização, nitidez mínima, intervalo da acidificação).

**Status de planta:** ativa · em_propagacao · a_plantar · a_semear · pendente_confirmacao · dormencia_induzida · removida.

**Tipos de foto:** 1 porte inteiro · 2 folha madura · 3 verso da folha · 4 colo e substrato · 5 flor ou fruto · 6 sintoma · 7 visor do medidor.

**Datas parciais:** "2026-10" aparece como "out/2026" e vale para o mês inteiro nas pendências.

---

## 10. O script do Google (Apps Script)

Arquivo: `apps-script/Codigo.gs`, colado no editor de Apps Script da planilha (Extensões → Apps Script) e publicado como **App da Web** (Executar como: Eu; Acesso: Qualquer pessoa). Sem o token, ele recusa qualquer pedido.

### Ações

| Ação | O que faz |
|---|---|
| `ping` | Teste de conexão (usado no "Testar e ligar") |
| `sincronizar` | Grava as alterações enviadas, aplica exclusões e devolve o que é novo para o aparelho |
| `foto` | Guarda a foto original no Drive, na pasta da planta |
| `miniatura` | Devolve uma versão pequena (até 800 px) de uma foto do Drive |
| `identificar` | Manda as fotos ao Pl@ntNet e devolve as 3 espécies mais prováveis |
| `analisar` | Pede ao Gemini um JSON (ficha, laudo, consultor ou visor), com os modelos reserva |
| `uso_ia` | Quanto das cotas grátis já foi usado hoje |

### Funções para rodar pelo editor

- `configurar()` — gera o **TOKEN** (aparece no Registo de execução) e pede a autorização do Drive.
- `testarChaves()` — confere as chaves do Pl@ntNet e do Gemini (✅/❌ no registro).

### Propriedades do script

(⚙ Definições do projeto → Propriedades do script)

| Propriedade | Obrigatória | Para quê |
|---|---|---|
| `TOKEN` | sim | Senha que o app usa (criada pelo `configurar`) |
| `PLANTNET_KEY` | sim | Chave do my.plantnet.org |
| `GEMINI_KEY` | sim | Chave do aistudio.google.com/apikey |
| `GEMINI_MODELO` | não | Modelo principal (padrão `gemini-3.8-flash`) |
| `GEMINI_RESERVA` | não | Lista de reservas, separadas por vírgula |
| `GEMINI_LIMITE_DIA` | não | Limite diário de análises (padrão 20; o app para em 80%) |
| `PLANTNET_LIMITE_DIA` | não | Padrão 500 |

### Como atualizar o script quando o código mudar

1. Abrir `https://raw.githubusercontent.com/admwilsonoliveira/inventario-botanico/main/apps-script/Codigo.gs` → **Ctrl+A**, **Ctrl+C**.
2. No editor: clicar no código → **Ctrl+A**, **Delete**, **Ctrl+V**, **Ctrl+S**. Conferir que a linha 1 é `/**` e a última é só `}`.
3. **Implementar → Gerir implementações → ✏️ → Versão: Nova versão → Implementar.** O endereço `/exec` não muda.

### Segurança

- As chaves ficam só nas Propriedades do script; o app no celular guarda apenas o endereço e o token.
- Se alguma chave ou o token vazar, gere outra (no Pl@ntNet, no AI Studio ou apagando `TOKEN` e rodando `configurar()` de novo) e atualize onde ela é usada.
- **Não ativar faturamento** no projeto da chave do Gemini: a assinatura Google AI (Pro/Ultra) não cobre a API, e faturamento ativo poderia gerar cobrança.

---

## 11. Para quem for mexer no código

### Pastas

```
app-inventario-botanico/
├── CLAUDE.md                 instruções originais do projeto (requisitos e fases)
├── DOCUMENTACAO.md           este documento
├── COMO_COMECAR.md           guia inicial
├── seed/inventario_inicial.json   carga inicial (62 plantas, eventos, regras…)
├── apps-script/Codigo.gs     backend no Google
├── public/                   ícones do app
├── .github/workflows/deploy.yml   testa e publica no GitHub Pages a cada envio
└── src/
    ├── App.tsx, main.tsx, rotas.ts       rotas (#/planta/P01…) e atualização automática
    ├── db.ts                 banco local (Dexie), carimbo de alteração, tabelas
    ├── types.ts              tipos de dados e rótulos
    ├── carga.ts              carga inicial, fichas, criação/exclusão de planta, revisão
    ├── migracoes.ts          correções aplicadas uma vez em aparelhos antigos
    ├── sync.ts               sincronização com a planilha
    ├── regras.ts             motor de regras (uma função por condição)
    ├── calculadora.ts        doses e solução-mãe
    ├── registro.ts           eventos, medição, fotos, pendências, baixa de estoque
    ├── rotina.ts             check-up do mês, lembretes, alertas de clima, estoque
    ├── evolucao.ts           projetos, propagação, mapa de zonas, linha do tempo
    ├── zonas.ts              horas de sol e necessidade de luz
    ├── ia.ts                 pedidos à IA, esquemas JSON, clima, visor, miniaturas
    ├── nitidez.ts            teste de foto tremida (variância do Laplaciano)
    ├── exportar.ts           Excel (.xlsx)
    ├── formato.ts            datas e números em português
    ├── componentes.tsx, aviso.tsx, estilo.css
    └── telas/                uma tela por arquivo (Lista, Ficha, Registrar, Hoje,
                              Escanear, Camera, Revisao, Desejos, Projetos, Propagacao,
                              Zonas, Consultor, Evolucao, Insumos, Etiquetas, Config, Editar)
```

### Comandos

```bash
npm install        # instalar dependências
npm run dev        # rodar no computador (http://localhost:5174)
npm test           # 108 testes automáticos em 13 arquivos
npm run build      # conferir tipos e gerar a versão de produção em dist/
npm run icons      # regerar os ícones a partir de public/icon.svg
```

### Publicar

Basta enviar o código para a branch `main` do GitHub. O GitHub Actions roda os testes, monta o app e publica no GitHub Pages em cerca de 1 minuto. Os aparelhos pegam a versão nova ao abrir o app ou voltar para ele. Se o `Codigo.gs` mudou, atualize o script (seção 10).

### Testes

Cobrem a calculadora, o motor de regras (as 18 regras), a carga inicial e a numeração, as migrações e o carimbo, a sincronização (com dois "aparelhos" e um servidor de mentira), a exportação, a medição e as pendências, o estoque, as zonas, a nitidez, os pedidos à IA (protocolos, proibições, conferência das ações), as rotinas e o clima, e a evolução (projetos, propagação, mapa, linha do tempo).

### Cuidados

- Mudou o formato dos dados? Crie uma **migração** em `migracoes.ts`: a carga inicial não roda de novo em aparelhos que já têm dados.
- Campo novo em lista ou objeto? Inclua em `COLUNAS_JSON` no script e em `normalizarRemoto` no `sync.ts`.
- `useEffect` não pode devolver valor (o `scrollIntoView` desta versão do Chrome devolve uma Promise e quebrou a tela uma vez): use chaves `{ }`.
- Tudo o que o Wilson vê é em português do Brasil, inclusive as mensagens de commit.

---

## 12. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| A tela não mudou depois de uma atualização | O celular está usando a cópia guardada | Fechar o app pelos recentes e abrir de novo (às vezes duas vezes). No computador: **Ctrl+Shift+R** |
| "☁ Nuvem desligada" | Endereço/token não configurados neste aparelho | Config → Nuvem → colar o endereço `/exec` e o token → Testar e ligar |
| "Token inválido" | Token errado ou script recriado | Copiar o TOKEN em Propriedades do script e colar de novo |
| "Resposta inesperada… /exec" | Endereço errado ou acesso não está "Qualquer pessoa" | Conferir em Implementar → Gerir implementações |
| "O Gemini está sobrecarregado agora (503)" | Falta de capacidade na cota grátis do Google | Tentar de novo mais tarde, ou usar o plano B (incluir só com a identificação / guardar fotos sem laudo). Ver a aba `uso_ia` |
| "Cota grátis … chegou a 80%" | Limite do dia atingido | Esperar o dia seguinte. Se o limite real do modelo for maior, ajustar `GEMINI_LIMITE_DIA` |
| Análise "eternamente processando" | A tela apagou ou o app foi para segundo plano | Deixar o app aberto nessa tela (ele mantém a tela acesa); usar Cancelar e Tentar de novo |
| Foto recusada como tremida, mas está boa | Limiar de nitidez alto demais | "Está boa, usar", ou baixar a nitidez mínima em Config |
| O Pl@ntNet não reconhece | Foto pouco característica | Acrescentar flor ou fruto (foto 5) ou outra folha |
| Uma planta sumiu da lista | Foi removida | Plantas → 🗑 Removidas → abrir → Voltar para a coleção |
| Etiqueta abre o endereço errado | Foi impressa pela versão de teste | Imprimir pelo app publicado |
| "Erro ao abrir o banco local" | Dados do navegador apagados ou corrompidos | Recarregar; se persistir, apagar os dados do site; a nuvem devolve tudo na próxima sincronização |

---

## 13. Histórico do projeto e decisões

| Data | Marco |
|---|---|
| 04/10/2026 | **Fase 0** — PWA, banco local, carga inicial com revisão, fichas, etiquetas QR. Publicada e testada no celular |
| 04/10/2026 | Grupos ganham nome; o antigo Grupo 4 vira **Mudas**; caládios e alocasia → Grupo 2; gerânios e beijo-de-frade → Grupo 3 |
| 04/10/2026 | **Fase 1** — registro rápido, calculadora, motor de regras, pendências, Excel, planilha Google + Drive |
| 04/10/2026 | **Numeração automática** de 55 fichas pendentes (decisão do Wilson; não segue a planilha antiga) |
| 04/10/2026 | **Fase 2** — Escanear (Pl@ntNet + Gemini), lista de desejos, nova planta. Critério: 10/10 plantas identificadas |
| 04/10/2026 | Decisão: **manter a cota grátis do Gemini** (sem API paga) |
| 04/10/2026 | **Fase 3** — clima, lembretes, check-up do mês, leitura do visor, estoque. Critério: o laudo acertou um caso conhecido |
| 04/10/2026 | Check-up que travava: o script passa a usar primeiro o último modelo que respondeu; o app mantém a tela acesa (~20 s por análise) |
| 04/10/2026 | **Fase 4** — projetos, propagação, zonas, consultor e evolução das fotos. Todos os testes no celular aprovados |
| 05/10/2026 | Gemini 503 em todos os modelos: 8 modelos reserva, segunda rodada, mensagem do Google anotada e plano B sem IA |

Decisões que valem lembrar:

- **Fase 1 aprovada antes das 2 semanas de uso** previstas: o Wilson preferiu seguir e usar em paralelo.
- **Gemini só na cota grátis.** Sem faturamento; se a capacidade grátis faltar, o app oferece seguir sem IA.
- **Um passo por vez:** as instruções para o Wilson vêm uma ação por mensagem.
- **Importação da planilha antiga (.xlsx)**, prevista no `CLAUDE.md`, não foi feita: ela servia sobretudo para os números de ficha, resolvidos pela numeração automática.

---

## 14. Pendências e ideias

- [ ] Atualizar o script para a versão de 530 linhas (modelos reserva e segunda rodada), se ainda não foi feito.
- [ ] Testar **📷 Ler pelo visor** com o medidor numa planta.
- [ ] Registrar o resultado das **estacas de buganvília** em 🌱 Propagação.
- [ ] Pôr as plantas "sem zona" nas zonas certas (🗺️ Zonas), para os avisos de luz valerem para todas.
- [ ] Conferir no AI Studio o limite diário real do modelo e ajustar `GEMINI_LIMITE_DIA`.
- [ ] (Opcional) Importar dados da planilha antiga, se houver algo além dos números de ficha.
- [ ] (Ideia) Fila de "laudos pendentes": guardar o pedido quando o Gemini falhar e tentar sozinho mais tarde.
