import type { ObjetivoNutricional } from "@/types/domain";

/**
 * Gera uma mensagem no tom de um nutricionista revisando o progresso do
 * paciente numa consulta de retorno: reconhece o esforço, contextualiza o
 * número (ritmo por semana) e reforça se está dentro do que é esperado/seguro.
 */
export function gerarMensagemMotivacional({
  pesoInicial,
  pesoAtual,
  diasTotais,
  objetivo,
}: {
  pesoInicial: number | null;
  pesoAtual: number | null;
  diasTotais: number;
  objetivo: ObjetivoNutricional;
}): string {
  if (pesoInicial == null || pesoAtual == null || diasTotais < 1) {
    return "Continue registrando seu peso e medidas — quanto mais dados, mais preciso fica o seu acompanhamento.";
  }

  const delta = Math.round((pesoAtual - pesoInicial) * 10) / 10;
  const semanas = Math.max(1, Math.round(diasTotais / 7));
  const ritmoSemanal = Math.round((Math.abs(delta) / semanas) * 100) / 100;

  if (objetivo === "emagrecimento") {
    if (delta < -0.1) {
      const ritmoOk = ritmoSemanal <= 1;
      return (
        `Parabéns! Você perdeu ${Math.abs(delta)}kg em ${diasTotais} dias — um ritmo de ~${ritmoSemanal}kg/semana` +
        (ritmoOk
          ? ", dentro da faixa considerada segura e sustentável. Continue assim!"
          : ", um pouco acima do ideal (até 1kg/semana). Vale conversar sobre isso na próxima consulta de retorno.")
      );
    }
    if (delta > 0.1) {
      return `Seu peso subiu ${delta}kg em ${diasTotais} dias. Isso acontece — vale revisar sua rotina e, se quiser, fazer uma consulta de retorno para reajustar o plano.`;
    }
    return "Seu peso está estável nesse período. Se o objetivo é emagrecimento, pode ser hora de reajustar sua meta calórica numa consulta de retorno.";
  }

  if (objetivo === "ganho_massa") {
    if (delta > 0.1) {
      return `Você ganhou ${delta}kg em ${diasTotais} dias — ótimo progresso rumo ao seu objetivo de ganho de massa. Continue priorizando a proteína diária.`;
    }
    return "Seu peso está estável nesse período. Se o objetivo é ganho de massa, vale revisar se está batendo sua meta calórica todos os dias.";
  }

  if (Math.abs(delta) < 1) {
    return "Seu peso está estável nesse período — ótimo trabalho de manutenção!";
  }
  return `Seu peso variou ${delta > 0 ? "+" : ""}${delta}kg em ${diasTotais} dias. Continue registrando para acompanharmos de perto.`;
}
