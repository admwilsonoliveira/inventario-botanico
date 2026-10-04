# Como começar no Claude Code

## O que tem neste pacote

| Arquivo | Para que serve |
| --- | --- |
| `CLAUDE.md` | Instruções do projeto. O Claude Code lê este arquivo sozinho sempre que abre a pasta. |
| `seed/inventario_inicial.json` | Seu inventário atual: 62 registros de plantas, lista de desejos, eventos, pendências de outubro, projetos, zonas de luz, insumos e regras. O app carrega isso na primeira abertura. |
| `COMO_COMECAR.md` | Este passo a passo. |

## Passo a passo

1. Crie no computador uma pasta chamada `app-inventario-botanico`.
2. Copie para dentro dela o `CLAUDE.md` (na raiz) e a pasta `seed` com o JSON dentro.
3. Abra essa pasta no Claude Code.
4. Cole este primeiro pedido:

   > Leia o CLAUDE.md e o seed/inventario_inicial.json. Antes de escrever código, me explique em português o plano da Fase 0, liste as contas e chaves que vou precisar criar e o que cada uma faz. Depois execute só a Fase 0.

5. Siga as instruções que ele der para criar as contas. Você vai precisar de:
    1. Conta no GitHub (gratuita) — para hospedar o app.
    2. Sua conta Google — para a planilha, as fotos no Drive e o Apps Script.
    3. Chave do Pl@ntNet (gratuita) — identificação das plantas; só na Fase 2.
    4. Chave do Gemini no Google AI Studio (cota gratuita) — ficha e laudo; só na Fase 2.
6. Ao fim de cada fase, teste no celular com o roteiro que ele entregar e só então peça a próxima: "Fase 0 aprovada, siga para a Fase 1".

## Quando o app abrir pela primeira vez

Vai aparecer a tela "Revisão da carga inicial". Nela estão:

- Plantas com conflito de registro para você decidir (ex.: grupo da Coroa-de-cristo, sol da Dipladênia branca, adubação da Morganville).
- Plantas ainda não confirmadas no inventário (Alocasia cucullata, Beijo-de-frade).
- Plantas que saíram da coleção: exclua direto ali.
- Números de ficha que faltam: as fichas 1 a 46 vieram sem número (só o nome); preencha com os números da sua planilha.

## Consumo

- A construção no Claude Code consome a cota do seu plano Claude.
- O app pronto não usa o Claude: a IA dele é o Pl@ntNet + Gemini nas cotas gratuitas, controladas pelo próprio app.
