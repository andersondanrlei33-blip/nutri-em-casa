import { HeartPulse } from "lucide-react";
import { calcularRCQ, classificarRCQ } from "@/lib/nutrition/calculations";
import type { Genero } from "@/types/domain";

interface CardRCQProps {
  cinturaCm: number | null;
  quadrilCm: number | null;
  genero: Genero;
  /** RCQ já vindo pronto de um laudo de bioimpedância (avaliacao_fisica_dados
   *  .relacaoCinturaQuadril) — usado como fallback quando o paciente não tem
   *  cintura e quadril registrados na mesma data em Acompanhamento. O
   *  aparelho já calcula esse valor sozinho, então não recalculamos a partir
   *  de cm nesse caso — só classificamos o número que ele já deu. */
  valorDoLaudo?: number | null;
}

/** Relação cintura-quadril — indicador clássico de risco cardiovascular que
 *  todo nutricionista calcula quando tem as duas medidas disponíveis.
 *  Prioriza cintura+quadril registrados manualmente (mais preciso, medido na
 *  mesma data); cai para o valor já calculado pelo aparelho de bioimpedância
 *  quando não há registro manual. */
export function CardRCQ({ cinturaCm, quadrilCm, genero, valorDoLaudo }: CardRCQProps) {
  if (cinturaCm != null && quadrilCm != null) {
    const { valor, classificacao } = calcularRCQ(cinturaCm, quadrilCm, genero);
    return <CorpoCardRCQ valor={valor} classificacao={classificacao} />;
  }

  if (valorDoLaudo != null) {
    return <CorpoCardRCQ valor={valorDoLaudo} classificacao={classificarRCQ(valorDoLaudo, genero)} />;
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <p className="text-xs text-muted">Relação cintura-quadril</p>
      <p className="mt-2 text-sm text-muted">
        Registre cintura e quadril na mesma data (Acompanhamento → Medidas), ou anexe uma avaliação física com esse
        dado numa consulta.
      </p>
    </div>
  );
}

function CorpoCardRCQ({ valor, classificacao }: { valor: number; classificacao: string }) {
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
