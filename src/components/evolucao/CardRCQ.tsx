import { HeartPulse } from "lucide-react";
import { calcularRCQ } from "@/lib/nutrition/calculations";
import type { Genero } from "@/types/domain";

interface CardRCQProps {
  cinturaCm: number | null;
  quadrilCm: number | null;
  genero: Genero;
}

/** Relação cintura-quadril — indicador clássico de risco cardiovascular que
 *  todo nutricionista calcula quando tem as duas medidas disponíveis. */
export function CardRCQ({ cinturaCm, quadrilCm, genero }: CardRCQProps) {
  if (cinturaCm == null || quadrilCm == null) {
    return (
      <div className="rounded-2xl border border-border bg-white p-5">
        <p className="text-xs text-muted">Relação cintura-quadril</p>
        <p className="mt-2 text-sm text-muted">
          Registre cintura e quadril na mesma data (Acompanhamento → Medidas) para calcular aqui.
        </p>
      </div>
    );
  }

  const { valor, classificacao } = calcularRCQ(cinturaCm, quadrilCm, genero);
  const risco = classificacao !== "Risco baixo";

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <p className="text-xs text-muted">Relação cintura-quadril</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{valor}</p>
      <span
        className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
          risco ? "bg-warning-500/10 text-warning-500" : "bg-success-500/10 text-success-500"
        }`}
      >
        <HeartPulse className="h-3 w-3" />
        {classificacao}
      </span>
    </div>
  );
}
