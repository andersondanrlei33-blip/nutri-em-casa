import { Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";

interface HeroProgressoProps {
  mensagem: string;
  /** 0-100, ou null quando ainda não há meta de peso definida. */
  percentualMeta: number | null;
  streakAtual: number;
}

const RAIO = 34;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

export function HeroProgresso({ mensagem, percentualMeta, streakAtual }: HeroProgressoProps) {
  const percentual = percentualMeta == null ? 0 : Math.min(100, Math.max(0, percentualMeta));
  const offset = CIRCUNFERENCIA - (percentual / 100) * CIRCUNFERENCIA;

  return (
    <Card className="border-brand-200 bg-brand-50">
      <CardContent className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:items-center">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
            <circle cx="40" cy="40" r={RAIO} fill="none" stroke="var(--brand-100)" strokeWidth="8" />
            {percentualMeta != null && (
              <circle
                cx="40"
                cy="40"
                r={RAIO}
                fill="none"
                stroke="var(--brand-500)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRCUNFERENCIA}
                strokeDashoffset={offset}
                className="transition-all duration-700"
              />
            )}
          </svg>
          <span className="absolute text-sm font-bold text-brand-700">
            {percentualMeta != null ? `${Math.round(percentual)}%` : "—"}
          </span>
        </div>

        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm text-foreground">{mensagem}</p>
          {streakAtual >= 2 && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-brand-700">
              <Flame className="h-3.5 w-3.5 text-warning-500" />
              {streakAtual} dias seguidos registrando
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
