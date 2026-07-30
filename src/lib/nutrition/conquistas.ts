export type TipoConquista = "meta_batida" | "progresso_peso" | "sequencia" | "tempo_acompanhamento";

export interface Conquista {
  tipo: TipoConquista;
  titulo: string;
  descricao: string;
}

interface ParametrosConquistas {
  diasTotais: number;
  objetivo: string;
  pesoInicial: number | null;
  pesoAtual: number | null;
  metaBatida: boolean;
  streakAtual: number;
}

/**
 * Conquistas/badges pra reforçar engajamento no Dashboard — motor simples
 * baseado em marcos que o paciente já bateu (não é gamificação com pontos,
 * só reconhecimento de progresso real).
 */
export function calcularConquistas({
  diasTotais,
  objetivo,
  pesoInicial,
  pesoAtual,
  metaBatida,
  streakAtual,
}: ParametrosConquistas): Conquista[] {
  const conquistas: Conquista[] = [];

  if (metaBatida) {
    conquistas.push({
      tipo: "meta_batida",
      titulo: "Meta batida!",
      descricao: "Você alcançou o peso que definiu como meta. Parabéns!",
    });
  }

  if (pesoInicial != null && pesoAtual != null) {
    const diferenca = pesoInicial - pesoAtual;
    const perdeu = diferenca > 0.3;
    const ganhou = diferenca < -0.3;
    if (objetivo === "emagrecimento" && perdeu) {
      conquistas.push({
        tipo: "progresso_peso",
        titulo: `${diferenca.toFixed(1)} kg a menos`,
        descricao: "Desde o início do acompanhamento até agora.",
      });
    } else if (objetivo === "ganho_de_massa" && ganhou) {
      conquistas.push({
        tipo: "progresso_peso",
        titulo: `${Math.abs(diferenca).toFixed(1)} kg a mais`,
        descricao: "Desde o início do acompanhamento até agora.",
      });
    }
  }

  if (streakAtual >= 3) {
    conquistas.push({
      tipo: "sequencia",
      titulo: `${streakAtual} dias seguidos`,
      descricao: "Com pelo menos um registro no app.",
    });
  }

  if (diasTotais >= 30) {
    conquistas.push({
      tipo: "tempo_acompanhamento",
      titulo: `${diasTotais} dias de jornada`,
      descricao: "Tempo total desde sua primeira consulta.",
    });
  }

  return conquistas;
}
