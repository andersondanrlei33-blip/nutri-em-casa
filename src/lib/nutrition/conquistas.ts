import type { ObjetivoNutricional } from "../../types/domain.ts";

/**
 * Selo de conquista pra tela de Evolução. Tudo aqui é calculado por código
 * a partir de dados reais que o paciente já registrou — nenhuma conquista é
 * gerada ou "julgada" por IA, pra nunca inventar uma vitória que não existe.
 */
export type TipoConquista = "meta_batida" | "progresso_peso" | "sequencia" | "tempo_acompanhamento";

export interface Conquista {
  tipo: TipoConquista;
  titulo: string;
  descricao: string;
}

interface ParamsConquistas {
  diasTotais: number;
  objetivo: ObjetivoNutricional;
  pesoInicial: number | null;
  pesoAtual: number | null;
  metaBatida: boolean;
  streakAtual: number;
}

/** Maior tier atingido numa lista ordenada do maior pro menor, ou null se nenhum. */
function maiorTier<T extends { limite: number }>(tiers: T[], valor: number): T | null {
  return tiers.find((t) => valor >= t.limite) ?? null;
}

export function calcularConquistas({
  diasTotais,
  objetivo,
  pesoInicial,
  pesoAtual,
  metaBatida,
  streakAtual,
}: ParamsConquistas): Conquista[] {
  const conquistas: Conquista[] = [];

  if (metaBatida) {
    conquistas.push({
      tipo: "meta_batida",
      titulo: "Meta batida!",
      descricao: "Você chegou no peso que definiu como meta.",
    });
  }

  // Progresso de peso só faz sentido pra quem tem objetivo de emagrecer ou
  // ganhar massa, e só conta se a mudança foi na direção certa (senão fica
  // estranho "comemorar" um resultado que na verdade é o oposto do desejado).
  if (pesoInicial != null && pesoAtual != null && pesoInicial > 0 && objetivo !== "manutencao") {
    const percentual = ((pesoAtual - pesoInicial) / pesoInicial) * 100;
    const direcaoFavoravel = objetivo === "emagrecimento" ? percentual < 0 : percentual > 0;

    if (direcaoFavoravel) {
      const tier = maiorTier(
        [
          { limite: 10, titulo: "10% de progresso", descricao: `Você já mudou 10% ou mais do seu peso inicial rumo ao objetivo.` },
          { limite: 5, titulo: "5% de progresso", descricao: `Você já mudou 5% ou mais do seu peso inicial rumo ao objetivo.` },
          { limite: 2, titulo: "Primeiros sinais", descricao: `Já dá pra ver os primeiros sinais de progresso no seu peso.` },
        ],
        Math.abs(percentual)
      );
      if (tier) {
        conquistas.push({ tipo: "progresso_peso", titulo: tier.titulo, descricao: tier.descricao });
      }
    }
  }

  const tierStreak = maiorTier(
    [
      { limite: 30, titulo: "30 dias seguidos", descricao: "Um mês inteiro registrando sem quebrar a sequência." },
      { limite: 14, titulo: "14 dias seguidos", descricao: "Duas semanas seguidas registrando seu progresso." },
      { limite: 7, titulo: "7 dias seguidos", descricao: "Uma semana inteira sem quebrar a sequência." },
      { limite: 3, titulo: "3 dias seguidos", descricao: "Você começou uma sequência de registros." },
    ],
    streakAtual
  );
  if (tierStreak) {
    conquistas.push({ tipo: "sequencia", titulo: tierStreak.titulo, descricao: tierStreak.descricao });
  }

  const tierTempo = maiorTier(
    [
      { limite: 90, titulo: "3 meses de jornada", descricao: "Você está com a gente há 3 meses ou mais." },
      { limite: 30, titulo: "1 mês de jornada", descricao: "Você está com a gente há 1 mês ou mais." },
      { limite: 7, titulo: "1 semana de jornada", descricao: "Sua primeira semana de acompanhamento completa." },
    ],
    diasTotais
  );
  if (tierTempo) {
    conquistas.push({ tipo: "tempo_acompanhamento", titulo: tierTempo.titulo, descricao: tierTempo.descricao });
  }

  return conquistas;
}
