import { z } from "zod";
import type { AvaliacaoNutricional, CategoriaReceita, DiaSemana, Receita } from "@/types/domain";
import { getAnthropicClient, NUTRI_MODEL } from "@/lib/ai/anthropicClient";
import {
  construirFiltro,
  filtrarReceitasCompativeis,
  escolherReceita,
  textoContemAlergiaDoUsuario,
  type FiltroReceitas,
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

/**
 * Gera um plano alimentar semanal personalizado a partir da avaliação
 * nutricional. Usa a API da Anthropic quando ANTHROPIC_API_KEY estiver
 * configurada (recomendado em produção); caso contrário recorre a um
 * gerador determinístico baseado em templates, garantindo que o app
 * NUNCA fique sem funcionar por falta de uma chave de IA.
 *
 * Em ambos os caminhos, as refeições são vinculadas a receitas reais da
 * biblioteca (quando há uma compatível) — restrições e alergias filtram
 * a lista de receitas candidatas ANTES de qualquer geração, em vez de
 * depender só de uma instrução em prompt para IA seguir.
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
  const templates = escolherTemplates(avaliacao.refeicoes_por_dia);
  const categorias = [...new Set(templates.map((t) => t.categoria))];

  // Candidatas já filtradas por alergia/restrição — a IA só pode escolher
  // dentro dessas listas, nunca inventar um receita_id fora delas.
  const candidatasPorCategoria = new Map<CategoriaReceita, Receita[]>();
  const idsValidosPorCategoria = new Map<CategoriaReceita, Set<string>>();
  for (const categoria of categorias) {
    const candidatas = filtrarReceitasCompativeis(receitasDisponiveis, categoria, filtro);
    candidatasPorCategoria.set(categoria, candidatas);
    idsValidosPorCategoria.set(categoria, new Set(candidatas.map((r) => r.id)));
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

  const prompt = `Você é uma nutricionista virtual especialista do app "Nutri em Casa".
Crie um plano alimentar semanal (segunda a domingo) para o paciente abaixo, respeitando
EXATAMENTE as metas calóricas e de macronutrientes calculadas.

Dados do paciente:
- Objetivo: ${avaliacao.objetivo}
- Refeições por dia: ${avaliacao.refeicoes_por_dia}
- Restrições alimentares: ${avaliacao.restricoes_alimentares.join(", ") || "nenhuma"}
- Alergias: ${avaliacao.alergias.join(", ") || "nenhuma"}
- Alimentos evitados: ${avaliacao.alimentos_evitados.join(", ") || "nenhum"}
- Preferências alimentares: ${avaliacao.preferencias_alimentares.join(", ") || "nenhuma"}

Metas diárias (NÃO ultrapassar em mais de 5%):
- Calorias: ${avaliacao.meta_calorica} kcal
- Proteína: ${avaliacao.meta_proteina_g} g
- Carboidrato: ${avaliacao.meta_carboidrato_g} g
- Gordura: ${avaliacao.meta_gordura_g} g

REGRA DE SEGURANÇA OBRIGATÓRIA sobre alergias/restrições: para cada categoria de refeição,
aqui estão as ÚNICAS receitas da nossa biblioteca já filtradas como seguras para este paciente
(alergias e restrições já foram excluídas — NÃO escolha nada fora desta lista):
${JSON.stringify(resumoCandidatas, null, 2)}

Para cada refeição, se houver uma receita adequada na lista da categoria correspondente,
defina "receita_id" com o id exato dela e ajuste "quantidade_porcoes" (pode ser fracionário,
ex: 1.5) para que as calorias da receita escalada cheguem perto do alvo da refeição.
Se NENHUMA receita da lista servir para aquele horário/categoria, defina "receita_id" como null
e escreva uma "descricao" simples que NÃO cite nenhum alimento presente nas alergias do paciente.

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
Gere ${avaliacao.refeicoes_por_dia} refeições para cada um dos 7 dias.`;

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
  const plano = PlanoGeradoSchema.parse(bruto);

  // Segunda camada de segurança: nunca confiar cegamente no que a IA
  // devolveu. Qualquer receita_id fora da lista permitida pra aquela
  // categoria é descartado, e qualquer descrição livre que mencione uma
  // alergia do paciente derruba o plano inteiro (cai no fallback determinístico).
  const refeicoesValidadas: RefeicaoGerada[] = plano.refeicoes.map((refeicao) => {
    const idsValidos = idsValidosPorCategoria.get(refeicao.categoria) ?? new Set<string>();
    const receitaIdValido = refeicao.receita_id && idsValidos.has(refeicao.receita_id) ? refeicao.receita_id : null;

    if (!receitaIdValido && textoContemAlergiaDoUsuario(refeicao.descricao, avaliacao.alergias)) {
      throw new Error(
        `IA sugeriu refeição de texto livre mencionando possível alergia do paciente ("${refeicao.descricao}") — descartando plano por segurança.`
      );
    }

    return { ...refeicao, receita_id: receitaIdValido };
  });

  return { refeicoes: refeicoesValidadas, observacoes_nutricionista: plano.observacoes_nutricionista };
}

/**
 * Fallback determinístico: para cada horário do dia, escolhe a receita real
 * da biblioteca mais próxima da meta calórica daquele horário, já filtrada
 * por alergia/restrição. Quando não há nenhuma opção compatível na
 * categoria, usa uma descrição genérica (sem inventar alimento) e sinaliza
 * isso nas observações.
 */
function gerarPlanoTemplate(avaliacao: AvaliacaoNutricional, receitasDisponiveis: Receita[]): PlanoGerado {
  const templates = escolherTemplates(avaliacao.refeicoes_por_dia);
  const filtro: FiltroReceitas = construirFiltro(avaliacao);
  const refeicoes: RefeicaoGerada[] = [];
  const usadasPorCategoria = new Map<CategoriaReceita, Set<string>>();
  let algumaCategoriaSemOpcao = false;

  for (const dia of DIAS) {
    templates.forEach((template) => {
      const caloriasAlvo = Math.round(avaliacao.meta_calorica * template.percentual);
      const candidatas = filtrarReceitasCompativeis(receitasDisponiveis, template.categoria, filtro);
      const usadas = usadasPorCategoria.get(template.categoria) ?? new Set<string>();
      const escolhida = escolherReceita(candidatas, caloriasAlvo, usadas);

      if (escolhida) {
        usadas.add(escolhida.id);
        usadasPorCategoria.set(template.categoria, usadas);
        // Escala a porção para chegar perto do alvo calórico, com limites
        // sensatos (0.5x a 2x) pra não gerar porções absurdas.
        const escalaBruta = escolhida.calorias > 0 ? caloriasAlvo / escolhida.calorias : 1;
        const escala = Math.min(2, Math.max(0.5, escalaBruta));

        refeicoes.push({
          dia_semana: dia,
          nome_refeicao: escolhida.nome,
          horario: template.horario,
          categoria: template.categoria,
          descricao: escolhida.descricao ?? template.descricao,
          calorias: Math.round(escolhida.calorias * escala),
          proteina_g: Math.round(escolhida.proteina_g * escala),
          carboidrato_g: Math.round(escolhida.carboidrato_g * escala),
          gordura_g: Math.round(escolhida.gordura_g * escala),
          receita_id: escolhida.id,
          quantidade_porcoes: Math.round(escala * escolhida.porcoes * 100) / 100,
        });
      } else {
        algumaCategoriaSemOpcao = true;
        refeicoes.push({
          dia_semana: dia,
          nome_refeicao: template.nome,
          horario: template.horario,
          categoria: template.categoria,
          descricao: template.descricao,
          calorias: caloriasAlvo,
          proteina_g: Math.round(avaliacao.meta_proteina_g * template.percentual),
          carboidrato_g: Math.round(avaliacao.meta_carboidrato_g * template.percentual),
          gordura_g: Math.round(avaliacao.meta_gordura_g * template.percentual),
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
  percentual: number;
  descricao: string;
}

function escolherTemplates(refeicoesPorDia: number): TemplateRefeicao[] {
  const conjuntos: Record<number, TemplateRefeicao[]> = {
    3: [
      { nome: "Café da manhã", horario: "07:30", categoria: "cafe_da_manha", percentual: 0.25, descricao: "Refeição leve e proteica para começar o dia." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.4, descricao: "Refeição principal balanceada." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.35, descricao: "Refeição leve para a noite." },
    ],
    4: [
      { nome: "Café da manhã", horario: "07:30", categoria: "cafe_da_manha", percentual: 0.22, descricao: "Refeição leve e proteica." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.35, descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", percentual: 0.13, descricao: "Lanche funcional entre refeições." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.3, descricao: "Refeição leve para a noite." },
    ],
    5: [
      { nome: "Café da manhã", horario: "07:00", categoria: "cafe_da_manha", percentual: 0.2, descricao: "Refeição leve e proteica." },
      { nome: "Lanche da manhã", horario: "10:00", categoria: "lanche", percentual: 0.1, descricao: "Lanche leve." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.3, descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", percentual: 0.13, descricao: "Lanche funcional." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.27, descricao: "Refeição leve para a noite." },
    ],
    6: [
      { nome: "Café da manhã", horario: "07:00", categoria: "cafe_da_manha", percentual: 0.18, descricao: "Refeição leve e proteica." },
      { nome: "Lanche da manhã", horario: "10:00", categoria: "lanche", percentual: 0.1, descricao: "Lanche leve." },
      { nome: "Almoço", horario: "12:30", categoria: "almoco", percentual: 0.27, descricao: "Refeição principal balanceada." },
      { nome: "Lanche da tarde", horario: "16:00", categoria: "lanche", percentual: 0.12, descricao: "Lanche funcional." },
      { nome: "Jantar", horario: "19:30", categoria: "jantar", percentual: 0.23, descricao: "Refeição leve para a noite." },
      { nome: "Ceia", horario: "21:30", categoria: "lanche", percentual: 0.1, descricao: "Ceia leve antes de dormir." },
    ],
  };

  return conjuntos[refeicoesPorDia] ?? conjuntos[3];
}
