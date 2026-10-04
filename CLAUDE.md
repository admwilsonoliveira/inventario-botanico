# App Inventário Botânico — instruções para o Claude Code

## 1. Contexto

Este é um app pessoal para o Wilson controlar a coleção de plantas dele (Patrocínio – MG, cerrado de altitude). Ele substitui a planilha Excel "Inventário Botânico Mestre": fichas numeradas, grupos, fórmulas de substrato, doses em gramas, log de eventos e calendário.

O Wilson fala só português. **Toda a interface, mensagens, comentários de commit e explicações para ele devem ser em português do Brasil.** Ele tem mentalidade de engenheiro: explique o porquê das decisões técnicas em linguagem simples, sem jargão não explicado. Ele não é programador profissional; antes de cada passo que exija ação dele (criar conta, gerar chave, publicar), dê instruções numeradas.

## 2. Requisitos não negociáveis

1. **Custo zero de operação.** Só serviços gratuitos. Se algo puder gerar cobrança, pare e pergunte.
2. **Celular primeiro.** Tudo deve funcionar com uma mão, em pé ao lado do vaso. Botões grandes, fluxo curto.
3. **Funciona sem internet** para consultar fichas e registrar eventos; sincroniza quando voltar.
4. **Chaves de API nunca no código do navegador.** Ficam no backend (Script Properties do Google Apps Script).
5. **Carga inicial automática** a partir de `seed/inventario_inicial.json` (seção 6).
6. **O Wilson pode editar e excluir qualquer planta** carregada da carga inicial.
7. **Exportar para Excel (.xlsx)** a qualquer momento, com todas as tabelas.

## 3. Arquitetura (decidida)

| Camada | Tecnologia | Motivo |
| --- | --- | --- |
| Frontend | PWA com Vite + React + TypeScript | Instala no celular como app, roda offline |
| Hospedagem | GitHub Pages | Gratuito |
| Banco local | IndexedDB (via Dexie) | Offline e rápido |
| Banco na nuvem | Google Sheets (uma aba por tabela), acessado por Google Apps Script publicado como Web App | Gratuito; a planilha vira o espelho que o Wilson já conhece |
| Fotos | Google Drive, uma pasta por planta (`/Inventario Botanico/Fotos/<id> - <nome>`) | Gratuito, já usado pelo Wilson |
| Identificação | API Pl@ntNet (chave gratuita de uso pessoal) | Especializada em identificação por órgão da planta |
| Ficha e laudo | API Gemini, cota gratuita, modelo com visão | Gratuito dentro da cota |
| Clima | Open-Meteo (sem chave) para Patrocínio: lat −18.94, lon −46.99 | Gratuito |

O Apps Script é o único que fala com Pl@ntNet e Gemini (proxy). O frontend chama o Apps Script com um token secreto simples guardado no próprio aparelho na primeira configuração.

**Antes de escrever código de integração**, confirme na documentação oficial atual: endpoint e limites do Pl@ntNet, nome do modelo Gemini disponível na cota gratuita e seus limites, e quotas do Apps Script. Não use valores de memória.

Registre cada chamada de IA numa aba `uso_ia` (data, tipo, tokens ou contagem) e bloqueie novas chamadas no dia se chegar a 80% da cota gratuita.

## 4. Modelo de dados

As tabelas abaixo existem no IndexedDB e como abas na planilha Google. Campos com o mesmo nome do JSON de carga inicial.

- **plantas**: id, ficha, nome_popular, nome_cientifico, grupo (1–5), quantidade, status, data_entrada, origem, zona, ph_min, ph_max, rega_gatilho_min, rega_gatilho_max, luz, vaso, substrato, adubacao, objetivo, tags[], proibicoes[], historico, params_origem, alertas[], qr_code, excluida_em.
- **fotos**: id, planta_id, data, tipo (1 a 7, seção 7), arquivo_drive_id, nota_saude.
- **medicoes**: id, planta_id, data_hora, umidade (1–5), ph, luz (1–9), temperatura, local_sonda (colo/borda).
- **eventos**: id, planta_id (nulo = evento geral), data, tipo, produto, dose_g_l, volume_ml, observacao.
- **pendencias**: id, planta_id, data_prevista, acao, concluida_em.
- **projetos**: id, nome, plantas[], fase_atual, proximo_marco.
- **insumos**: nome, categoria, em_estoque, quantidade, unidade, observacao.
- **lista_desejos**: id, nome, especie, prioridade, zona_compativel, epoca_compra, preco_alvo, observacao.
- **zonas**: id, nome, sol_direto.
- **regras** e **rotinas**: ver seção 8.

Status de planta: `ativa`, `em_propagacao`, `a_plantar`, `a_semear`, `pendente_confirmacao`, `dormencia_induzida`, `removida`.

Excluir planta: primeiro marca `removida` (some das listas, fica no histórico). Na tela da planta removida, botão "Excluir definitivamente" com confirmação apaga ficha, eventos e medições.

Datas podem ser parciais na carga inicial (`2026-10` = outubro sem dia definido). Mostre como "out/2026".

## 5. Numeração das fichas

- `ficha` nula = número ainda não informado. Mostre "nº pendente" e um campo para o Wilson preencher.
- Nova planta recebe `proxima_ficha` (53 na carga inicial) e incrementa.
- Nunca reutilize número de ficha excluída.

## 6. Carga inicial

Na primeira abertura, se o banco estiver vazio:

1. Ler `seed/inventario_inicial.json` (empacotado no build).
2. Importar todas as seções: plantas, lista_desejos, eventos, pendencias, projetos, zonas, insumos, regras, rotinas, proxima_ficha.
3. Mostrar uma tela "Revisão da carga inicial" listando as plantas com `alertas` não vazios e as de status `pendente_confirmacao`, com botões: confirmar, editar, excluir. Os alertas são conflitos de registro que o Wilson precisa decidir.
4. Plantas com `params_origem = "sugerido"` mostram um selo "parâmetros sugeridos" até o Wilson confirmar.
5. Nunca rodar a carga de novo se já houver dados. Criar um botão em Configurações para "restaurar carga inicial" com dupla confirmação.

Também criar importação de .xlsx para depois reconciliar com a planilha antiga (casar por nome popular; perguntar em caso de dúvida).

## 7. Protocolo de fotos (escaneamento)

Obrigatórias: 1 (porte inteiro) e 2 (folha madura). Opcionais: 3 (verso da folha), 4 (colo e substrato), 5 (flor ou fruto), 6 (sintoma), 7 (visor do medidor 4-em-1).

Na captura:
- Moldura de enquadramento e instrução curta por tipo.
- Recusar foto tremida (variância do Laplaciano abaixo de um limiar calibrado) antes do envio.
- Guardar a original no Drive e enviar para análise uma cópia reduzida a 1568 px no lado maior, JPEG ~80%.

Mapear para os órgãos do Pl@ntNet: 1 → habit, 2 e 3 → leaf, 5 → flower ou fruit.

## 8. Motor de regras

Código determinístico, sem IA. Roda em dois momentos: (a) antes de salvar um evento; (b) sobre toda recomendação vinda da IA antes de mostrá-la.

As regras estão em `regras` no JSON. `bloquear` impede salvar/mostrar e explica o motivo; `alertar` mostra aviso e permite seguir. Implementar cada condição como função pura com teste unitário. O Wilson deve conseguir ativar/desativar e editar o texto das regras em Configurações.

Protocolos fixos que também valem para os prompts da IA:
- Só água de torneira. Anticloro não é rotina.
- Gatilho de rega pelo medidor no colo: nível 2 na maioria; 3 para hortênsia e cebolinha; 1–2 deserto/suculentas.
- Pausa de adubação jun–set; retomada em outubro. Exceções marcadas com tag `excecao_pausa`.
- Adubo líquido vai com a rega: concentração fixa, volume proporcional ao vaso.
- Grandes intervenções em outubro.
- Sem quarentena: inspeção → transplante com escarificação do torrão → integração.
- Remédios permitidos: óleo de neem, sabão de potássio/detergente neutro (à noite), canela em pó.
- Recomendar só insumos com `em_estoque = true`; se precisar de outro, dizer explicitamente "precisa comprar".

## 9. Calculadora de doses

- Dose (g/L) × volume de rega (L) = massa (g).
- Abaixo de 0,3 g: método de diluição. Solução-mãe de concentração C (g/ml); volume na seringa = D × V_rega ÷ C. Exemplo: 0,2 g/L em 1 L com mãe de 0,1 g/ml → 2,0 ml.
- Arredondar volume de seringa a 0,1 ml (seringa de 3 ml). Se passar de 3 ml, dividir em puxadas e dizer quantas.
- Testes unitários obrigatórios com esses exemplos.

## 10. Fluxo do escaneamento

1. Captura guiada (seção 7).
2. Foto nítida? Se não, refazer.
3. Pl@ntNet → 3 candidatas com %.
4. Confiança ≥ 80%? Se não, o Wilson escolhe entre as candidatas ou envia outra foto (flor, outro órgão).
5. Já existe no inventário (mesma espécie)? Pergunte se é a mesma planta. Se for, gerar só **check-up** (laudo) e registrar no histórico.
6. Se for nova: Gemini gera ficha da espécie + laudo de saúde em JSON (esquema abaixo). Passar o resultado pelo motor de regras.
7. Decisão: incluir no inventário (abre questionário já preenchido com a próxima ficha), lista de desejos ou descartar.

Prompt da IA: enviar só o contexto necessário (protocolos da seção 8, insumos em estoque, grupo e ficha da planta se existir, mês atual, clima de Patrocínio). Pedir resposta **somente em JSON**:

```json
{
  "identificacao": {"nome_popular": "", "nome_cientifico": "", "familia": "", "variedade_provavel": ""},
  "origem_historia": "",
  "habito": "",
  "paisagismo": "",
  "toxicidade": "",
  "parametros": {"ph_min": 0, "ph_max": 0, "rega_gatilho_min": 0, "rega_gatilho_max": 0, "luz_1a9": 0, "temperatura": ""},
  "substrato_percentual": [{"insumo": "", "percentual": 0}],
  "adubacao": [{"produto": "", "dose_g_l": 0, "fase": ""}],
  "propagacao": "",
  "pragas_comuns": [""],
  "grupo_sugerido": 0,
  "laudo": {
    "nota": 0,
    "subnotas": {"vigor": 0, "nutricao_cor": 0, "pragas_doencas": 0, "estrutura": 0, "vaso_substrato": 0},
    "sinais_vistos": [{"sinal": "", "onde": ""}],
    "hipoteses": [{"causa": "", "mecanismo": "", "probabilidade": ""}],
    "perguntas_confirmacao": [""],
    "acoes": [{"acao": "", "quando": "", "insumo": ""}]
  }
}
```

O laudo deve separar o que foi visto na foto do que é suspeita. Foto não mostra raiz, pH nem umidade interna: nesses casos, pedir leitura do medidor.

## 11. Fases de construção

Construa uma fase por vez. Ao fim de cada fase: rode os testes, publique, e entregue ao Wilson um roteiro de teste em português. Só comece a próxima depois que ele aprovar.

**Fase 0 — Migração**
- Estrutura do projeto, PWA instalável, IndexedDB.
- Carga inicial (seção 6) com tela de revisão.
- Gerar QR por planta (link `#/planta/<id>`) e uma página de impressão de etiquetas em folha A4 (24 por folha).
- Critério de pronto: toda ficha abre pelo QR com os dados da carga conferidos.

**Fase 1 — Inventário vivo (MVP)**
- Telas: lista por grupo/zona, ficha, histórico, registro rápido (reguei, adubei, medi, fotografei), pendências do dia/semana.
- Medição com resposta "regar" ou "aguardar" pelo gatilho da planta.
- Calculadora de doses, motor de regras, exportação .xlsx.
- Backend Apps Script + sincronização com Google Sheets.
- Critério: 2 semanas de uso no lugar da planilha.

**Fase 2 — Escaneamento**
- Captura guiada, Pl@ntNet, ficha da espécie (Gemini), decisão inventário/desejos/descarte.
- Lista de desejos com alerta de cor impossível e compatibilidade de zona de luz.
- Critério: 10 plantas conhecidas identificadas corretamente.

**Fase 3 — Saúde e rotina**
- Laudo de saúde, check-up periódico (distribuir no mês, ~2 plantas por dia), leitura do visor do medidor por foto.
- Lembretes de lixiviação mensal e acidificação das acidófilas; alertas de clima (calor, umidade do ar baixa, início das chuvas); estoque com baixa automática.
- Critério: laudo acerta casos já resolvidos do histórico.

**Fase 4 — Formação e evolução**
- Linha do tempo de fotos (lado a lado), projetos com fases e marcos, propagação com taxa de sucesso, mapa de zonas de luz, consultor no chat com contexto da planta.

## 12. Regras de trabalho

- Commits pequenos, mensagens em português.
- Testes unitários para calculadora, motor de regras e importação da carga inicial.
- Nenhuma chamada de IA automática ao abrir o app; só quando o Wilson tocar em "analisar".
- Não invente dados de planta: o que não estiver no JSON fica vazio para ele preencher.
- Ao terminar cada tarefa, resuma em português o que foi feito e o próximo passo.
