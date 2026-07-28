import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface CardProgressoProps {
  titulo: string;
  valorInicial: number | null;
  valorAtual: number | null;
  unidade: string;
  /** Qual direção da mudança é positiva pra esse indicador. */
  favoravel: "queda" | "alta";
  casasDecimais?: number;
  rotuloVazio?: string;
}

export function CardProgresso({
  titulo,
  valorInicial,
  valorAtual,
  unidade,
  favoravel,
  casasDecimais = 1,
  rotuloVazio,
}: CardProgressoProps) {
  if (valorInicial == null || valorAtual == null) {
    return (
      <div className="rounded-2xl border border-border bg-white p-5">
        <p className="text-xs text-muted">{titulo}</p>
        <p className="mt-2 text-sm text-muted">{rotuloVazio ?? "Ainda sem dados suficientes."}</p>
      </div>
    );
  }

  const fator = 10 ** casasDecimais;
  const delta = Math.round((valorAtual - valorInicial) * fator) / fator;
  const bom = (favoravel === "queda" && delta < 0) || (favoravel === "alta" && delta > 0);
  const estavel = delta === 0;

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">
        {valorAtual}
        {unidade}
      </p>
      <p className="text-xs text-muted">
        era {valorInicial}
        {unidade}
      </p>
      {estavel ? (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-muted">
          <Minus className="h-3 w-3" /> Estável
        </span>
      ) : (
        <span
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            bom ? "bg-success-500/10 text-success-500" : "bg-brand-50 text-brand-700"
          }`}
        >
          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta > 0 ? "+" : ""}
          {delta}
          {unidade}
        </span>
      )}
    </div>
  );
}
