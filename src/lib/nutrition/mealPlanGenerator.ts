import { z } from "zod";
import type { AvaliacaoNutricional, CategoriaReceita, CondicaoSaude, DiaSemana, IndicacaoSaudeReceita, Receita } from "@/types/domain";
import { getAnthropicClient, NUTRI_MODEL } from "@/lib/ai/anthropicClient";
import { identificarCondicaoClinicaComplexa } from "./calculations";
import {
  construirFiltro,
  filtrarReceitasCompativeis,
  escolherReceita,
  textoContemAlergiaDoUsuario,
  normalizar,
  INDICACOES_SAUDE_VOCABULARIO,
  type FiltroReceitas,
  type MetasRefeicao,
} from "./receitaMatching";
const DIAS: DiaSemana[] = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
];
const RefeicaoGeradaSchema = z.object({
  dia_semana: z.enum(["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]),
  nome_refeicao: z.string(),
  horario: z.string(),
  categoria: z.enum([
    "cafe_da_manha",
    "almoco",
    "jantar",
    "lanche",
    "sobremesa",
    "pre_treino",
    "pos_treino",
  ]),
  descricao: z.string(),
  calorias: z.number(),
  proteina_g: z.number(),
  carboidrato_g: z.number(),
  gordura_g: z.number(),
  /** Vínculo com uma receita real da biblioteca — null quando não há opção
   *  compatível na biblioteca e a refeição é só uma descrição de texto. */
  receita_id: z.string().nullable().optional(),
  quantidade_porcoes: z.number().positive().optional(),
});
const PlanoGeradoSchema = z.object({
  refeicoes: z.array(RefeicaoGeradaSchema),
  observacoes_nutricionista: z.string(),
});
export type RefeicaoGerada = z.infer<typeof RefeicaoGeradaSchema>;
export type PlanoGerado = z.infer<typeof PlanoGeradoSchema>;
/** Metas diárias totais (não por refeição) de calorias e macronutrientes. */
interface MetaDiaria {
  calorias: number;
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
}
interface SlotAlocavel {
  categoria: CategoriaReceita;
}
interface ResultadoAlocacaoSlot<T extends SlotAlocavel> {
  slot: T;
  receita: Receita | null;
  escala: number;
}
/**
 * Aloca uma receita pra cada slot (refeição) de UM dia, olhando pro que
 * AINDA falta bater da meta diária a cada passo — não numa fatia fixa por
 * horário. Antes, cada refeição perseguia sua própria fatia pré-definida da
 * meta (ex: almoço sempre 35%) de forma isolada; agora, se uma refeição
 * ficar um pouco abaixo do que devia (por causa do limite de 0.5x-2x na
 * porção), as refeições seguintes do mesmo dia herdam essa diferença e
 * tentam compensar, fechando o dia mais perto do exato do que seria
 * possível com fatias fixas. `usadasPorCategoria` é mutado e deve ser
 * compartilhado entre os dias da semana, pra variar as receitas ao longo
 * dela.
 */
function alocarReceitasDoDia<T extends SlotAlocavel>(
  slots: T[],
  metaDiaria: MetaDiaria,
  candidatasPorCategoria: Map<CategoriaReceita, Receita[]>,
  usadasPorCategoria: Map<CategoriaReceita, Set<string>>
): ResultadoAlocacaoSlot<T>[] {
  const alocado = { calorias: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0 };
  return slots.map((slot, indice) => {
    const slotsRestantes = slots.length - indice;
    const metaSlot: MetasRefeicao = {
      calorias: Math.max(0, (metaDiaria.calorias - alocado.calorias) / slotsRestantes),
      proteinaG: Math.max(0, (metaDiaria.proteinaG - alocado.proteinaG) / slotsRestantes),
      carboidratoG: Math.max(0, (metaDiaria.carboidratoG - alocado.carboidratoG) / slotsRestantes),
      gorduraG: Math.max(0, (metaDiaria.gorduraG - alocado.gorduraG) / slotsRestantes),
    };
    const candidatas = candidatasPorCategoria.get(slot.categoria) ?? [];
    const usadas = usadasPorCategoria.get(slot.categoria) ?? new Set<string>();
    const escolhida = escolherReceita(candidatas, metaSlot, usadas);
    if (!escolhida) return { slot, receita: null, escala: 1 };
    usadas.add(escolhida.id);
    usadasPorCategoria.set(slot.categoria, usadas);
    const escalaBruta = escolhida.calorias > 0 ? metaSlot.calorias / escolhida.calorias : 1;
    const escala = Math.min(2, Math.max(0.5, escalaBruta));
    alocado.calorias += escolhida.calorias * escala;
    alocado.proteinaG += escolhida.proteina_g * escala;
    alocado.carboidratoG += escolhida.carboidrato_g * escala;
    alocado.gorduraG += escolhida.gordura_g * escala;
    return { slot, receita: escolhida, escala };
  });
}
/**
 * Gera um plano alimentar semanal personalizado a partir da avaliação
 * nutricional. Usa a API da Anthropic quando ANTHROPIC_API_KEY estiver
 * configurada (recomendado em produção); caso contrário recorre a um
 * gerador determinístico baseado em templates, garantindo que o app
 * NUNCA fique sem funcionar por falta de uma chave de IA.
 *
 * Em ambos os caminhos, as refeições são vinculadas a receitas reais da
 * biblioteca (quando há uma compatível) — restrições e alergias filtram a
 * lista de receitas candidatas ANTES de qualquer geração. E em ambos os
 * caminhos, a ESCOLHA de qual receita entra em cada refeição e a
 * quantidade de porções são feitas pelo mesmo código determinístico
 * (alocarReceitasDoDia, que usa escolherReceita de receitaMatching.ts) —
 * a IA nunca decide isso sozinha, só ajuda a escrever as observações e a
 * descrição quando não há receita compatível.
 */
export async function gerarPlanoAlimentar(
  avaliacao: AvaliacaoNutricional,
  receitasDisponiveis: Receita[]
): Promise<PlanoGerado> {
  const anthropic = getAnthropicClient();
  if (anthropic) {
    try {
      return await gerarPlanoComIA(avaliacao, receitasDisponiveis);
    } catch (erro) {
      console.error("Falha ao gerar plano com IA, usando fallback determinístico:", erro);
    }
  }
  return gerarPlanoTemplate(avaliacao, receitasDisponiveis);
}
/**
 * Orientações de seleção de alimentos por condição de saúde — usadas no
 * prompt da IA. Antes dessa função, condições de saúde só geravam um aviso
 * de texto separado (avaliarCondicoesSaude em calculations.ts) que nunca
 * chegava na geração do cardápio: a IA escolhia comida olhando só pra
 * preferências do paciente, sem saber que ele tinha diabetes/colesterol
 * alto/hipertensão. Essas instruções têm prioridade sobre preferência
 * alimentar quando as duas conflitarem (ex: paciente diabético que prefere
 * doce — a IA deve moderar o doce, não ignorar a condição).
 */
function construirOrientacoesCondicoesSaude(condicoes: CondicaoSaude[]): string[] {
  const orientacoes: string[] = [];
  if (condicoes.includes("diabetes_tipo1") || condicoes.includes("diabetes_tipo2")) {
    orientacoes.push(
      "Diabetes: priorize carboidratos complexos e com fibra; evite ou reduza fortemente açúcar refinado/doces " +
        "concentrados (ex: doce de leite, brigadeiro, mel em excesso, refrigerante). Se o paciente disse preferir " +
        "algo assim, inclua no máximo em 1 refeição da semana, em porção pequena, nunca repetido em vários dias."
    );
  }
  if (condicoes.includes("colesterol_alto")) {
    orientacoes.push(
      "Colesterol alto: priorize gorduras insaturadas (azeite, peixes, castanhas, abacate) e evite ou reduza " +
        "receitas fritas ou muito ricas em gordura saturada (frituras, embutidos, carnes muito gordurosas)."
    );
  }
  if (condicoes.includes("hipertensao")) {
    orientacoes.push(
      "Hipertensão: modere receitas com alto teor de sódio (embutidos, enlatados, temperos industrializados, " +
        "salgadinhos); prefira preparações com pouco sal."
    );
  }
  if (condicoes.includes("doenca_renal")) {
    orientacoes.push(
      "Doença renal: modere alimentos ricos em potássio (banana, laranja, batata, tomate em grande quantidade) e " +
        "em fósforo (leite e derivados em excesso, refrigerantes escuros, embutidos); evite sal em excesso. Não " +
        "existe substituto do sal light (rico em potássio) recomendado para esse paciente."
    );
  }
  if (condicoes.includes("hipotireoidismo")) {
    orientacoes.push(
      "Hipotireoidismo: garanta iodo adequado (sal iodado, peixes, ovos) sem exagerar; evite grandes quantidades " +
        "de vegetais crucíferos crus (repolho, brócolis) na mesma refeição — cozidos não é problema; priorize " +
        "fibra, que ajuda com a constipação comum nessa condição."
    );
  }
  if (condicoes.includes("hipertireoidismo")) {
    orientacoes.push(
      "Hipertireoidismo: o metabolismo acelerado pode pedir mais calorias e proteína pra evitar perda de massa " +
        "muscular; inclua boas fontes de cálcio (leite, iogurte, folhas verde-escuras); modere cafeína, que pode " +
        "piorar sintomas como palpitação e ansiedade."
    );
  }
  return orientacoes;
}
/**
 * Classifica o texto livre de "outra condição não listada" dentro do
 * vocabulário FECHADO de indicações de receita — a IA escolhe apenas entre
 * as tags existentes, nunca inventa uma regra nova (mesmo princípio de
 * nunca dar liberdade total pra IA decidir algo de saúde sozinha). Só deve
 * ser chamada depois de confirmar que o texto NÃO bateu com nenhum termo de
 * condição clínica complexa (essas já vão pro modo seguro antes — ver
 * calculations.ts::identificarCondicaoClinicaComplexa). Em qualquer erro ou
 * resposta fora do esperado, retorna lista vazia — comportamento seguro,
 * só significa que a receita não ganha a prioridade extra.
 */
async function classificarCondicaoLivre(texto: string): Promise<IndicacaoSaudeReceita[]> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return [];
  try {
    const resposta = await anthropic.messages.create({
      model: NUTRI_MODEL,
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            `Um paciente escreveu esta condição de saúde em texto livre numa consulta nutricional: "${texto}"\n\n` +
            "Escolha APENAS entre estas tags (zero, uma ou mais, separadas por vírgula — responda \"nenhuma\" se " +
            `nenhuma se aplicar):\n${INDICACOES_SAUDE_VOCABULARIO.join(", ")}\n\n` +
            "Responda SOMENTE com as tags escolhidas (ou \"nenhuma\"), sem nenhuma explicação.",
        },
      ],
    });
    const textoResposta = resposta.content
      .filter((bloco) => bloco.type === "text")
      .map((bloco) => (bloco as { text: string }).text)
      .join(" ");
    const candidatas = textoResposta.split(",").map((t) => normalizar(t));
    return INDICACOES_SAUDE_VOCABULARIO.filter((tag) => candidatas.some((c) => c.includes(tag)));
  } catch (erro) {
    console.error("Falha ao classificar condição livre, seguindo sem prioridade extra:", erro);
    return [];
  }
}
interface CandidataResumo {
  id: string;
  nome: string;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
}
async function gerarPlanoComIA(
  avaliacao: AvaliacaoNutricional,
  receitasDisponiveis: Receita[]
): Promise<PlanoGerado> {
  const anthropic = getAnthropicClient()!;
  const filtro = construirFiltro(avaliacao);
  // "Outra condição" em texto livre: só tentamos extrair uma indicação de
  // receita dela quando NÃO for um caso de condição clínica complexa (essas
  // já forçam o modo seguro lá em calculations.ts, e não faz sentido
  // "otimizar receita" pra um caso que a mensagem é "procure um profissional").
  if (
    avaliacao.condicoes_saude_outras?.trim() &&
    !identificarCondicaoClinicaComplexa(avaliacao.condicoes_saude_outras)
  ) {
    const tagsExtras = await classificarCondicaoLivre(avaliacao.condicoes_saude_outras);
    tagsExtras.forEach((tag) => filtro.indicacoesPreferidas.add(tag));
  }
  const templates = escolherTemplates(avaliacao.refeicoes_por_dia, avaliacao.meta_calorica);
  const categorias = [...new Set(templates.map((t) => t.categoria))];
  // Candidatas já filtradas por alergia/restrição — a única fonte de onde
  // uma receita pode vir, tanto pra IA (que só vê essa lista no prompt,
  // como referência) quanto pra escolha final feita em código.
  const candidatasPorCategoria = new Map<CategoriaReceita, Receita[]>();
  for (const categoria of categorias) {
    candidatasPorCategoria.set(categoria, filtrarReceitasCompativeis(receitasDisponiveis, categoria, filtro));
  }
  const resumoCandidatas: Record<string, CandidataResumo[]> = {};
  for (const [categoria, receitas] of candidatasPorCategoria) {
    resumoCandidatas[categoria] = receitas.map((r) => ({
      id: r.id,
      nome: r.nome,
      calorias: r.calorias,
      proteina_g: r.proteina_g,
      carboidrato_g: r.carboidrato_g,
      gordura_g: r.gordura_g,
    }));
  }
  const orientacoesCondicoes = construirOrientacoesCondicoesSaude(avaliacao.condicoes_saude ?? []);
  const prompt = `Você é uma nutricionista virtual especialista do app "Nutri em Casa".
Crie um plano alimentar semanal (segunda a domingo) para o paciente abaixo, respeitando
EXATAMENTE as metas calóricas e de macronutrientes calculadas.
Dados do paciente:
- Objetivo: ${avaliacao.objetivo}
- Restrições alimentares: ${avaliacao.restricoes_alimentares.join(", ") || "nenhuma"}
- Alergias: ${avaliacao.alergias.join(", ") || "nenhuma"}
- Alimentos evitados: ${avaliacao.alimentos_evitados.join(", ") || "nenhum"}
- Preferências alimentares: ${avaliacao.preferencias_alimentares.join(", ") || "nenhuma"}
${
  avaliacao.observacoes?.trim()
    ? `- Contexto adicional que o paciente compartilhou: "${avaliacao.observacoes.trim()}" — use isso pra tornar o ` +
      "plano mais realista pro dia a dia dele(a) (ex: receitas mais rápidas se ele(a) viaja muito ou cozinha pouco), " +
      "mas isso NUNCA tem prioridade sobre as regras de segurança de alergia/condição de saúde abaixo.\n"
    : ""
}
${
  orientacoesCondicoes.length > 0
    ? `\nCONDIÇÕES DE SAÚDE — estas orientações têm PRIORIDADE sobre as preferências alimentares acima quando ` +
      `houver conflito (ex: paciente prefere doce mas tem diabetes → modere o doce, não ignore a condição):\n` +
      orientacoesCondicoes.map((o) => `- ${o}`).join("\n") +
      `\nSe precisar reduzir ou não atender uma preferência do paciente por causa de uma condição de saúde, ` +
      `explique isso brevemente em "observacoes_nutricionista".\n`
    : ""
}
Metas diárias (NÃO ultrapassar em mais de 5%):
- Calorias: ${avaliacao.meta_calorica} kcal
- Proteína: ${avaliacao.meta_proteina_g} g
- Carboidrato: ${avaliacao.meta_carboidrato_g} g
- Gordura: ${avaliacao.meta_gordura_g} g
Aqui estão as receitas disponíveis por categoria, só como referência (a escolha final de
qual receita entra em cada horário é feita depois, automaticamente, pra garantir o melhor
equilíbrio de calorias e macros ao longo do dia — você não precisa acertar isso com precisão):
${JSON.stringify(resumoCandidatas, null, 2)}
Para cada refeição, defina "receita_id" com o id de alguma receita da categoria correspondente
que pareça uma boa opção (ou null se nenhuma servir para aquele horário), e escreva uma
"descricao" com o nome da opção escolhida ou uma sugestão de texto livre. Preencha "calorias",
"proteina_g", "carboidrato_g" e "gordura_g" com sua melhor estimativa — esses valores também
serão recalculados automaticamente depois a partir da receita realmente escolhida.
Se nenhuma receita da lista servir para aquele horário/categoria, escreva uma "descricao"
simples que NÃO cite nenhum alimento presente nas alergias do paciente.
IMPORTANTE: o campo "dia_semana" deve ser exatamente um destes valores, SEM acento: "segunda",
"terca", "quarta", "quinta", "sexta", "sabado", "domingo".
Responda APENAS com um JSON válido no formato:
{
  "refeicoes": [
    { "dia_semana": "segunda", "nome_refeicao": "Café da manhã", "horario": "07:30",
      "categoria": "cafe_da_manha", "descricao": "...", "calorias": 000,
      "proteina_g": 00, "carboidrato_g": 00, "gordura_g": 00,
      "receita_id": "uuid-da-lista-ou-null", "quantidade_porcoes": 1 }
  ],
  "observacoes_nutricionista": "..."
}
Gere exatamente ${templates.length} refeições para cada um dos 7 dias, seguindo estes horários e categorias
(pode ajustar o horário em minutos se fizer sentido, mas mantenha a categoria e a ordem):
${templates.map((t) => `- ${t.horario} — ${t.categoria} (${t.nome})`).join("\n")}`;
  const resposta = await anthropic.messages.create({
    model: NUTRI_MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });
  const textoResposta = resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => (bloco as { text: string }).text)
    .join("\n");
  const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta da IA não continha JSON válido.");
  const bruto = JSON.parse(jsonMatch[0]);
  // O modelo (Haiku) às vezes devolve "dia_semana" acentuado (ex: "terça",
  // "sábado") mesmo pedindo sem acento no prompt, e às vezes deixa
  // "descricao" como null. Normaliza os dois casos antes de validar contra
  // o schema — derrubar o plano inteiro por isso seria jogar fora uma
  // resposta boa por um detalhe de formatação.
  if (Array.isArray(bruto?.refeicoes)) {
    bruto.refeicoes = bruto.refeicoes.map((refeicao: Record<string, unknown>) => {
      const diaBruto = refeicao.dia_semana;
      const diaNormalizado = typeof diaBruto === "string" ? normalizar(diaBruto) : diaBruto;
      const descricaoValida =
        typeof refeicao.descricao === "string" && refeicao.descricao.trim() !== "";
      return {
        ...refeicao,
        dia_semana: DIAS.includes(diaNormalizado as DiaSemana) ? diaNormalizado : diaBruto,
        descricao: descricaoValida
          ? refeicao.descricao
          : (typeof refeicao.nome_refeicao === "string" ? refeicao.nome_refeicao : "Refeição sugerida"),
      };
    });
  }
  const plano = PlanoGeradoSchema.parse(bruto);
  // A escolha de QUAL receita entra em cada refeição, e quanto dela, nunca
  // fica a cargo da IA — ela ajuda a estruturar os dias/horários e a
  // escrever descrição/observações, mas quem decide isso é o mesmo código
  // determinístico do fallback sem IA (alocarReceitasDoDia, que olha pro
  // que ainda falta bater da meta diária a cada refeição — não só calorias,
  // também os 3 macros).
  const refeicoesPorDiaAgrupadas = new Map<string, RefeicaoGerada[]>();
  plano.refeicoes.forEach((r) => {
    const lista = refeicoesPorDiaAgrupadas.get(r.dia_semana) ?? [];
    lista.push(r);
    refeicoesPorDiaAgrupadas.set(r.dia_semana, lista);
  });
  const metaDiaria: MetaDiaria = {
    calorias: avaliacao.meta_calorica,
    proteinaG: avaliacao.meta_proteina_g,
    carboidratoG: avaliacao.meta_carboidrato_g,
    gorduraG: avaliacao.meta_gordura_g,
  };
  const usadasPorCategoria = new Map<CategoriaReceita, Set<string>>();
  const refeicoesValidadas: RefeicaoGerada[] = [];
  for (const lista of refeicoesPorDiaAgrupadas.values()) {
    const ordenada = [...lista].sort((a, b) => a.horario.localeCompare(b.horario));
    const alocacoes = alocarReceitasDoDia(ordenada, metaDiaria, candidatasPorCategoria, usadasPorCategoria);
    alocacoes.forEach(({ slot: refeicao, receita, escala }) => {
      if (receita) {
        refeicoesValidadas.push({
          ...refeicao,
          receita_id: receita.id,
          descricao: receita.descricao ?? refeicao.descricao,
          calorias: Math.round(receita.calorias * escala),
          proteina_g: Math.round(receita.proteina_g * escala),
          carboidrato_g: Math.round(receita.carboidrato_g * escala),
          gordura_g: Math.round(receita.gordura_g * escala),
          quantidade_porcoes: Math.round(escala * receita.porcoes * 100) / 100,
        });
      } else {
        // Nenhuma receita da biblioteca serve pra essa categoria — mantém a
        // descrição de texto livre da IA, mas só depois de confirmar que
        // ela não cita nenhuma alergia real do paciente (segunda camada de
        // segurança, além do filtro estrutural por tags).
        if (textoContemAlergiaDoUsuario(refeicao.descricao, avaliacao.alergias)) {
          throw new Error(
            `IA sugeriu refeição de texto livre mencionando possível alergia do paciente ("${refeicao.descricao}") — descartando plano por segurança.`
          );
        }
        refeicoesValidadas.push({ ...refeicao, receita_id: null, quantidade_porcoes: 1 });
      }
    });
  }
  return { refeicoes: refeicoesValidadas, observacoes_nutricionista: plano.observacoes_nutricionista };
}
/**
 * Fallback determinístico: pra cada dia, aloca as receitas reais da
 * biblioteca olhando pro que falta bater da meta diária (calorias e os 3
 * macros — ver alocarReceitasDoDia), já filtradas por alergia/restrição.
 * Quando não há nenhuma opção compatível na categoria, usa uma descrição
 * genérica (sem inventar alimento) e sinaliza isso nas observações.
 */
function gerarPlanoTemplate(avaliacao: AvaliacaoNutricional, receitasDisponiveis: Receita[]): PlanoGerado {
  const templates = escolherTemplates(avaliacao.refeicoes_por_dia, avaliacao.meta_calorica);
  const filtro: FiltroReceitas = construirFiltro(avaliacao);
  const candidatasPorCategoria = new Map<CategoriaReceita, Receita[]>();
  for (const categoria of new Set(templates.map((t) => t.categoria))) {
    candidatasPorCategoria.set(categoria, filtrarReceitasCompativeis(receitasDisponiveis, categoria, filtro));
  }
  const usadasPorCategoria = new Map<CategoriaReceita, Set<string>>();
  const metaDiaria: MetaDiaria = {
    calorias: avaliacao.meta_calorica,
    proteinaG: avaliacao.meta_proteina_g,
    carboidratoG: avaliacao.meta_carboidrato_g,
    gorduraG: avaliacao.meta_gordura_g,
  };
  const refeicoes: RefeicaoGerada[] = [];
  let algumaCategoriaSemOpcao = false;
  for (const dia of DIAS) {
    const alocacoes = alocarReceitasDoDia(templates, metaDiaria, candidatasPorCategoria, usadasPorCategoria);
    alocacoes.forEach(({ slot: template, receita, escala }) => {
      if (receita) {
        refeicoes.push({
          dia_semana: dia,
          nome_refeicao: receita.nome,
          horario: template.horario,
          categoria: template.categoria,
          descricao: receita.descricao ?? template.descricao,
          calorias: Math.round(receita.calorias * escala),
          proteina_g: Math.round(receita.proteina_g * escala),
          carboidrato_g: Math.round(receita.carboidrato_g * escala),
          gordura_g: Math.round(receita.gordura_g * escala),
          receita_id: receita.id,
          quantidade_porcoes: Math.round(escala * receita.porcoes * 100) / 100,
        });
      } else {
        algumaCategoriaSemOpcao = true;
        const fatia = 1 / templates.length;
        refeicoes.push({
          dia_semana: dia,
          nome_refeicao: template.nome,
          horario: template.horario,
          categoria: template.categoria,
          descricao: template.descricao,
          calorias: Math.round(metaDiaria.calorias * fatia),
          proteina_g: Math.round(metaDiaria.proteinaG * fatia),
          carboidrato_g: Math.round(metaDiaria.carboidratoG * fatia),
          gordura_g: Math.round(metaDiaria.gorduraG * fatia),
          receita_id: null,
          quantidade_porcoes: 1,
        });
      }
    });
  }
  const observacoes =
    "Plano gerado automaticamente com base nas suas metas calóricas e de macronutrientes, priorizando receitas " +
    "da nossa biblioteca compatíveis com as restrições e alergias que você informou." +
    (algumaCategoriaSemOpcao
      ? " Algumas refeições ainda não têm uma receita da biblioteca compatível com o que você informou — troque-as " +
        "manualmente pela lista de Receitas quando adicionarmos mais opções para o seu perfil."
      : " Troque qualquer refeição pela biblioteca de receitas a qualquer momento — os valores nutricionais do dia " +
        "são recalculados automaticamente.");
  return { refeicoes, observacoes_nutricionista: observacoes };
}
interface TemplateRefeicao {
  nome: string;
  horario: string;
  categoria: CategoriaReceita;
  descricao: string;
}
/**
 * Escolhe o conjunto de refeições do dia. Parte do número de refeições que
 * o paciente informou na consulta, mas AUMENTA automaticamente (até 6) se a
 * meta calórica for alta demais pra esse número de refeições — ex: uma meta
 * de 3254 kcal em só 4 refeições exigiria ~813 kcal por refeição, mas a
 * maior receita da biblioteca tem uns 550 kcal e a porção é limitada a no
 * máximo 2x o tamanho original, então nunca daria pra bater a meta direito.
 * Dividindo em mais refeições, cada uma pede uma porção realista.
 */
function escolherTemplates(refeicoesPorDia: number, metaCalorica: number): TemplateRefeicao[] {
  const conjuntos: Record<number, TemplateRefeicao[]> = {
    3: [
      { nome: "Café da manhã", horario: "07:30", categoria: "cafe_da_manha", descricao: "Refeição leve e proteica para começar o dia." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", descricao: "Refeição principal balanceada." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", descricao: "Refeição leve para a noite." },
    ],
    4: [
      { nome: "Café da manhã", horario: "07:30", categoria: "cafe_da_manha", descricao: "Refeição leve e proteica." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", descricao: "Lanche funcional entre refeições." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", descricao: "Refeição leve para a noite." },
    ],
    5: [
      { nome: "Café da manhã", horario: "07:00", categoria: "cafe_da_manha", descricao: "Refeição leve e proteica." },
      { nome: "Lanche da manhã", horario: "10:00", categoria: "lanche", descricao: "Lanche leve." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", descricao: "Lanche funcional." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", descricao: "Refeição leve para a noite." },
    ],
    6: [
      { nome: "Café da manhã", horario: "07:00", categoria: "cafe_da_manha", descricao: "Refeição leve e proteica." },
      { nome: "Lanche da manhã", horario: "10:00", categoria: "lanche", descricao: "Lanche leve." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", descricao: "Lanche funcional." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", descricao: "Refeição leve para a noite." },
      { nome: "Ceia", horario: "21:30", categoria: "lanche", descricao: "Ceia leve antes de dormir." },
    ],
  };
  const LIMITE_KCAL_POR_REFEICAO = 600;
  let contagem = conjuntos[refeicoesPorDia] ? refeicoesPorDia : 3;
  while (metaCalorica / contagem > LIMITE_KCAL_POR_REFEICAO && conjuntos[contagem + 1]) {
    contagem += 1;
  }
  return conjuntos[contagem];
}
