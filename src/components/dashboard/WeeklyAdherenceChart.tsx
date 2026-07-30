export interface DiaAdesao {
  /** Ex: "S", "T", "Q"... — primeira letra do dia, Segunda a Domingo. */
  label: string;
  /** % de refeições do plano marcadas como consumidas nesse dia (0-100). */
  percentual: number;
  /** Dias depois de hoje ainda não aconteceram — mostrados como barra vazia
   *  (cinza), não como "0% de adesão", que pareceria uma falha. */
  futuro: boolean;
  hoje: boolean;
}

/**
 * Barra semanal de adesão ao plano alimentar — quantas refeições prescritas
 * pra cada dia da semana já foram marcadas como consumidas (ver
 * TodayMeals::alternarConsumida). Mesmo estilo visual do protótipo que a
 * nutricionista trouxe como referência: cantos arredondados, barras cheias
 * ao invés de linha, semana inteira visível de uma vez.
 */
export function WeeklyAdherenceChart({ dados }: { dados: DiaAdesao[] }) {
  return (
    <div>
      <h2 className="sr-only">Gráfico de barras mostrando a adesão ao plano alimentar em cada dia da semana</h2>
      <div className="flex items-end gap-2.5 sm:gap-3" style={{ height: 96 }}>
        {dados.map((dia, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="flex h-full w-full items-end">
              <div
                className={
                  "w-full rounded-lg transition-all " +
                  (dia.futuro ? "bg-black/[0.05]" : dia.hoje ? "bg-brand-500" : "bg-brand-300")
                }
                style={{ height: dia.futuro ? "10%" : `${Math.max(6, dia.percentual)}%` }}
              />
            </div>
            <span className={"text-[11px] " + (dia.hoje ? "font-semibold text-brand-700" : "text-muted")}>
              {dia.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
