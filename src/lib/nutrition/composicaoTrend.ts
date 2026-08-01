import type { AvaliacaoFisicaExtraida } from "../../types/domain.ts";

export type TendenciaComposicaoCorporal = "favoravel" | "estavel" | "atencao";

export interface InsightComposicaoCorporal {
  texto: string;
  tendencia: TendenciaComposicaoCorporal;
}

/** Variação mínima (em pontos percentuais ou kg) pra considerar que algo
 *  realmente mudou, em vez de ruído de medição entre aparelhos/dias
 *  diferentes — mesmo espírito do limiar usado em
 *  calculations.ts::avaliarTendenciaPeso, mas aqui olhando a tendência ao
 *  longo de TODO o histórico (1ª avaliação com laudo x mais recente com
 *  laudo), não só o par mais recente. */
const LIMIAR_VARIACAO_GORDURA_PP = 0.5;
const LIMIAR_VARIACAO_MASSA_MAGRA_KG = 0.5;

const VARIANTES_MELHORA = [
  (deltaGorduraAbs: number, deltaMassaMagra: number) =>
    `A composição corporal vem melhorando desde a primeira avaliação: gordura corporal caiu ${deltaGorduraAbs}pp` +
    (deltaMassaMagra > 0 ? ` e massa magra subiu ${deltaMassaMagra}kg` : "") +
    `. Sinal de que treino e alimentação estão trabalhando juntos.`,
  (deltaGorduraAbs: number, deltaMassaMagra: number) =>
    `Boa evolução na composição corporal: desde a primeira avaliação, a gordura caiu ${deltaGorduraAbs}pp` +
    (deltaMassaMagra > 0 ? ` e a massa magra subiu ${deltaMassaMagra}kg` : "") +
    `. Vale reforçar isso com o paciente na próxima consulta.`,
  (deltaGorduraAbs: number, deltaMassaMagra: number) =>
    `O histórico de avaliações mostra uma evolução consistente: gordura corporal ${deltaGorduraAbs}pp menor` +
    (deltaMassaMagra > 0 ? ` e ${deltaMassaMagra}kg a mais de massa magra` : "") +
    ` desde a primeira avaliação. Bom momento pra reconhecer isso com o paciente.`,
];

const VARIANTES_ATENCAO = [
  (deltaGordura: number, deltaMassaMagraAbs: number, massaMagraCaiu: boolean) =>
    `O peso vem se mantendo relativamente estável, mas isso pode estar escondendo uma mudança real por trás do ` +
    `número: desde a primeira avaliação, a gordura corporal subiu ${Math.max(0, deltaGordura)}pp` +
    (massaMagraCaiu ? ` e a massa magra caiu ${deltaMassaMagraAbs}kg` : "") +
    `. Vale abrir essa conversa com carinho na próxima consulta, olhando junto pra rotina de treino e sono.`,
  (deltaGordura: number, deltaMassaMagraAbs: number, massaMagraCaiu: boolean) =>
    `Vale um olhar atento aqui: a gordura corporal subiu ${Math.max(0, deltaGordura)}pp` +
    (massaMagraCaiu ? ` e a massa magra caiu ${deltaMassaMagraAbs}kg` : "") +
    ` desde a primeira avaliação. Sem julgamento — só um ponto importante pra conversar com calma na próxima consulta.`,
  (deltaGordura: number, deltaMassaMagraAbs: number, massaMagraCaiu: boolean) =>
    `O histórico de avaliações aponta uma mudança que merece atenção: gordura corporal ${Math.max(0, deltaGordura)}pp ` +
    `maior` +
    (massaMagraCaiu ? ` e ${deltaMassaMagraAbs}kg a menos de massa magra` : "") +
    ` desde a primeira avaliação. Um bom próximo passo é entender junto com o paciente o que mudou na rotina.`,
];

const VARIANTES_ESTAVEL = [
  () => "A composição corporal está estável desde a primeira avaliação — sem variações relevantes em gordura ou massa magra.",
  () => "Gordura corporal e massa magra seguem estáveis desde a primeira avaliação, sem grandes variações a destacar.",
];

/**
 * Compara a avaliação física mais antiga com a mais recente (dentre as que
 * têm laudo anexado) e gera um texto acolhedor sobre a tendência geral —
 * diferente dos cartões de evolução por consulta (calculations.ts::
 * montarEvolucaoComposicaoCorporal), que comparam só o par mais recente.
 * Aqui o objetivo é dar à nutricionista uma leitura da trajetória inteira do
 * paciente numa única frase, pra abrir a página de Evolução já sabendo se o
 * quadro geral está melhorando, estável ou pedindo atenção.
 *
 * Retorna null quando não há % de gordura em pelo menos duas avaliações
 * (não dá pra falar de tendência com um único ponto).
 *
 * `seed` roda as variantes de texto pra não repetir sempre a mesma frase —
 * passar algo que mude entre visitas à página (ex: número de consultas do
 * paciente) é suficiente; não precisa ser aleatório.
 */
export function gerarInsightComposicaoCorporal(
  laudoInicial: AvaliacaoFisicaExtraida,
  laudoAtual: AvaliacaoFisicaExtraida,
  seed: number
): InsightComposicaoCorporal | null {
  if (laudoInicial.percentualGordura == null || laudoAtual.percentualGordura == null) return null;

  const deltaGordura = arredondar1(laudoAtual.percentualGordura - laudoInicial.percentualGordura);
  const temMassaMagra = laudoInicial.massaMagraKg != null && laudoAtual.massaMagraKg != null;
  const deltaMassaMagra = temMassaMagra ? arredondar1(laudoAtual.massaMagraKg! - laudoInicial.massaMagraKg!) : 0;

  const gorduraSubiu = deltaGordura > LIMIAR_VARIACAO_GORDURA_PP;
  const gorduraCaiu = deltaGordura < -LIMIAR_VARIACAO_GORDURA_PP;
  const massaMagraCaiu = temMassaMagra && deltaMassaMagra < -LIMIAR_VARIACAO_MASSA_MAGRA_KG;
  const massaMagraSubiu = temMassaMagra && deltaMassaMagra > LIMIAR_VARIACAO_MASSA_MAGRA_KG;

  if (gorduraCaiu && !massaMagraCaiu) {
    const texto = VARIANTES_MELHORA[seed % VARIANTES_MELHORA.length](
      Math.abs(deltaGordura),
      massaMagraSubiu ? deltaMassaMagra : 0
    );
    return { texto, tendencia: "favoravel" };
  }

  if (gorduraSubiu || massaMagraCaiu) {
    const texto = VARIANTES_ATENCAO[seed % VARIANTES_ATENCAO.length](
      deltaGordura,
      Math.abs(deltaMassaMagra),
      massaMagraCaiu
    );
    return { texto, tendencia: "atencao" };
  }

  return { texto: VARIANTES_ESTAVEL[seed % VARIANTES_ESTAVEL.length](), tendencia: "estavel" };
}

function arredondar1(valor: number): number {
  return Math.round(valor * 10) / 10;
}
