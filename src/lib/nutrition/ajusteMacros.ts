import type { AvaliacaoNutricional, DiaSemana, Receita } from "@/types/domain";
import { construirFiltro, receitaEhSegura } from "./receitaMatching";
import type { RefeicaoGerada } from "./mealPlanGenerator";

/**
 * Motor de ajuste de macros — roda por cima do plano da semana já montado
 * (tanto pelo caminho com IA quanto pelo fallback determinístico), compara
 * o total de cada dia com a meta DIÁRIA do paciente e, quando algum macro
 * fica abaixo da tolerância, completa com um "complemento" da biblioteca
 * (categoria "complemento" — arroz, batata doce, whey, claras de ovo etc.,
 * ver migration seed_receitas_complemento) escolhido especificamente pra
 * fechar aquele gap.
 *
 * Por que isso não mexe em receitas já escolhidas: escalar a porção de uma
 * receita (o que já acontece na seleção inicial) só muda o TAMANHO do
 * prato — a proporção interna de proteína/carboidrato/gordura da receita
 * continua a mesma, então escalar nunca corrige um desalinhamento de
 * proporção. Só dá pra corrigir isso adicionando algo com a proporção
 * certa ao lado do prato — exatamente o que uma nutricionista faz na
 * prática ("esse prato + 4 colheres de arroz").
 *
 * Funciona igual pra qualquer objetivo (emagrecimento, manutenção, ganho de
 * massa) porque só olha os números da meta (avaliacao.meta_*), nunca o
 * objetivo em si — o objetivo já foi traduzido em números antes disso, em
 * calculations.ts.
 *
 * Só ADICIONA quando falta (nunca remove o que já foi escolhido, o que
 * exigiria descartar uma refeição inteira) — por isso resolve bem o caso
 * mais comum visto na prática (carboidrato faltando), mas não "desinfla"
 * proteína/gordura que vieram acima da meta. Isso é intencional: sobra de
 * proteína/gordura não é um problema de segurança do mesmo jeito que faltar
 * um macro inteiro, e a escolha por macro em escolherReceitaPorMacro já
 * reduz bastante esse excesso na origem.
 */

const TOLERANCIA_RELATIVA = 0.12; // 12% de desvio abaixo da meta, tolerado sem ajuste
const MAX_COMPLEMENTOS_POR_DIA = 2;

type TipoComplemento = "carboidrato" | "proteina" | "gordura";
type ChaveMacro = "proteina_g" | "carboidrato_g" | "gordura_g";

interface ComplementoClassificado {
  receita: Receita;
  tipo: TipoComplemento;
}

/** Classifica um complemento pelo macro que domina sua composição calórica
 *  (>=60% das calorias vindas de carboidrato ou gordura, >=50% de
 *  proteína — proteína pesa menos porque nenhum alimento comum chega perto
 *  de 60% de calorias vindas só de proteína). Receitas que não têm um
 *  macro claramente dominante (ex: pratos completos) retornam null e não
 *  entram no pool do motor de ajuste — só o que foi desenhado como
 *  complemento simples (ver seed_receitas_complemento) deve se qualificar. */
function classificarComplemento(receita: Receita): TipoComplemento | null {
  const kcalProteina = receita.proteina_g * 4;
  const kcalCarboidrato = receita.carboidrato_g * 4;
  const kcalGordura = receita.gordura_g * 9;
  const total = kcalProteina + kcalCarboidrato + kcalGordura;
  if (total <= 0) return null;
  if (kcalCarboidrato / total >= 0.6) return "carboidrato";
  if (kcalProteina / total >= 0.5) return "proteina";
  if (kcalGordura / total >= 0.6) return "gordura";
  return null;
}

const CHAVE_POR_TIPO: Record<TipoComplemento, ChaveMacro> = {
  carboidrato: "carboidrato_g",
  proteina: "proteina_g",
  gordura: "gordura_g",
};

export function ajustarPlanoParaMetas(
  refeicoes: RefeicaoGerada[],
  avaliacao: AvaliacaoNutricional,
  receitasDisponiveis: Receita[]
): RefeicaoGerada[] {
  // Complementos passam pelo MESMO filtro de segurança (alergia/restrição)
  // que qualquer outra receita do plano — nunca um atalho por serem "só um
  // acompanhamento".
  const filtro = construirFiltro(avaliacao);
  const complementos: ComplementoClassificado[] = receitasDisponiveis
    .filter((r) => r.categoria === "complemento" && receitaEhSegura(r, filtro))
    .map((r) => ({ receita: r, tipo: classificarComplemento(r) }))
    .filter((c): c is ComplementoClassificado => c.tipo !== null);

  // Biblioteca ainda sem complemento compatível com esse paciente (ex:
  // todos batem alguma alergia) — não trava o plano, só segue sem ajuste.
  if (complementos.length === 0) return refeicoes;

  const porDia = new Map<DiaSemana, RefeicaoGerada[]>();
  for (const refeicao of refeicoes) {
    const lista = porDia.get(refeicao.dia_semana) ?? [];
    lista.push(refeicao);
    porDia.set(refeicao.dia_semana, lista);
  }

  const extras: RefeicaoGerada[] = [];

  for (const [dia, refeicoesDoDia] of porDia) {
    const totais = refeicoesDoDia.reduce(
      (acc, r) => ({
        proteina_g: acc.proteina_g + r.proteina_g,
        carboidrato_g: acc.carboidrato_g + r.carboidrato_g,
        gordura_g: acc.gordura_g + r.gordura_g,
      }),
      { proteina_g: 0, carboidrato_g: 0, gordura_g: 0 }
    );

    // Restante por macro, recalculado a cada complemento adicionado — assim
    // os slots do dia (até MAX_COMPLEMENTOS_POR_DIA) vão todos pro macro que
    // realmente está faltando, em vez de "um por tipo". Isso importa muito
    // na prática: um paciente pode estar com só carboidrato faltando (o caso
    // mais comum, reportado pelo usuário) e precisar de mais de um
    // complemento de carboidrato pra fechar um gap grande, não um só.
    const restante = {
      carboidrato: avaliacao.meta_carboidrato_g - totais.carboidrato_g,
      proteina: avaliacao.meta_proteina_g - totais.proteina_g,
      gordura: avaliacao.meta_gordura_g - totais.gordura_g,
    };
    const metas = {
      carboidrato: avaliacao.meta_carboidrato_g,
      proteina: avaliacao.meta_proteina_g,
      gordura: avaliacao.meta_gordura_g,
    };

    const usadosNesseDia = new Set<string>();
    const tiposEsgotados = new Set<TipoComplemento>();
    const ultimaRefeicao = refeicoesDoDia[refeicoesDoDia.length - 1];
    let adicionadosNoDia = 0;

    while (adicionadosNoDia < MAX_COMPLEMENTOS_POR_DIA) {
      // Recalcula, a cada volta, qual macro está com o maior desvio relativo
      // ainda dentro do que falta corrigir (só déficit — nunca reduz o que
      // já foi escolhido, isso exigiria descartar uma refeição inteira).
      const tipos: TipoComplemento[] = ["carboidrato", "proteina", "gordura"];
      const maiorGap = tipos
        .filter((tipo) => !tiposEsgotados.has(tipo))
        .map((tipo) => ({
          tipo,
          deltaAbsoluto: restante[tipo],
          deltaRelativo: metas[tipo] > 0 ? restante[tipo] / metas[tipo] : 0,
        }))
        .filter((g) => g.deltaRelativo > TOLERANCIA_RELATIVA)
        .sort((a, b) => b.deltaRelativo - a.deltaRelativo)[0];

      if (!maiorGap) break; // nenhum macro fora da tolerância — dia OK

      const chaveMacro = CHAVE_POR_TIPO[maiorGap.tipo];
      const candidatos = complementos.filter(
        (c) => c.tipo === maiorGap.tipo && !usadosNesseDia.has(c.receita.id)
      );
      if (candidatos.length === 0) {
        // Sem mais complemento desse tipo pra usar hoje (já usou todos) —
        // marca como esgotado pra não girar em loop tentando de novo, mas
        // deixa os outros macros/slots seguirem normalmente.
        tiposEsgotados.add(maiorGap.tipo);
        continue;
      }

      // Entre os complementos do tipo certo, escolhe a combinação
      // candidato + porção (1x a 2x, em passos de 0.5) que chega mais perto
      // de fechar o gap sem estourar muito pra cima.
      let melhorCandidato: ComplementoClassificado | null = null;
      let melhorEscala = 1;
      let melhorDesvio = Infinity;
      for (const candidato of candidatos) {
        const porUnidade = candidato.receita[chaveMacro];
        if (porUnidade <= 0) continue;
        const escalaBruta = maiorGap.deltaAbsoluto / porUnidade;
        const escala = Math.min(2, Math.max(1, Math.round(escalaBruta * 2) / 2));
        const desvio = Math.abs(porUnidade * escala - maiorGap.deltaAbsoluto);
        if (desvio < melhorDesvio) {
          melhorDesvio = desvio;
          melhorCandidato = candidato;
          melhorEscala = escala;
        }
      }
      if (!melhorCandidato) {
        tiposEsgotados.add(maiorGap.tipo);
        continue;
      }

      const receita = melhorCandidato.receita;
      usadosNesseDia.add(receita.id);
      adicionadosNoDia++;
      restante[maiorGap.tipo] -= receita[chaveMacro] * melhorEscala;

      extras.push({
        dia_semana: dia,
        nome_refeicao: `Complemento: ${receita.nome}`,
        horario: ultimaRefeicao?.horario ?? "12:00",
        categoria: "complemento",
        descricao: receita.descricao ?? receita.nome,
        calorias: Math.round(receita.calorias * melhorEscala),
        proteina_g: Math.round(receita.proteina_g * melhorEscala),
        carboidrato_g: Math.round(receita.carboidrato_g * melhorEscala),
        gordura_g: Math.round(receita.gordura_g * melhorEscala),
        receita_id: receita.id,
        quantidade_porcoes: melhorEscala,
      });
    }
  }

  return [...refeicoes, ...extras];
}
