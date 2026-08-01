import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface ComparacaoSemanalProps {
  mediaAtual: number;
  mediaAnterior: number;
  deltaKg: number;
  /** Qual direção é favorável pro objetivo do paciente. */
  favoravel: "queda" | "alta";
}

/** Vitória de curto prazo: compara a média de peso dos últimos 7 dias com a
 *  semana anterior. Complementa a comparação "desde o início", que nas
 *  primeiras semanas pode parecer distante demais pra ser motivadora. */
export function ComparacaoSemanal({ mediaAtual, mediaAnterior, deltaKg, favoravel }: ComparacaoSemanalProps) {
  const estavel = deltaKg === 0;
  const bom = (favoravel === "queda" && deltaKg < 0) || (favoravel === "alta" && deltaKg > 0);

  return (
    <div className="flex items-center justify-between rounded-xl bg-black/[0.02] px-4 py-3">
      <div>
        <p className="text-xs text-muted">Peso: essa semana vs. semana passada</p>
        <p className="mt-0.5 text-sm text-foreground">
          {mediaAtual}kg <span className="text-muted">(era {mediaAnterior}kg)</span>
        </p>
      </div>
      {estavel ? (
        <span className="flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-muted">
          <Minus className="h-3 w-3" /> Estável
        </span>
      ) : (
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            bom ? "bg-success-500/10 text-success-500" : "bg-brand-50 text-brand-700"
          }`}
        >
          {deltaKg > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {deltaKg > 0 ? "+" : ""}
          {deltaKg}kg
        </span>
      )}
    </div>
  );
}
