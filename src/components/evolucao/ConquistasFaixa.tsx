import type { ComponentType } from "react";
import { Trophy, TrendingUp, Flame, CalendarCheck } from "lucide-react";
import type { Conquista, TipoConquista } from "@/lib/nutrition/conquistas";

const ICONE_POR_TIPO: Record<TipoConquista, ComponentType<{ className?: string }>> = {
  meta_batida: Trophy,
  progresso_peso: TrendingUp,
  sequencia: Flame,
  tempo_acompanhamento: CalendarCheck,
};

const COR_POR_TIPO: Record<TipoConquista, string> = {
  meta_batida: "bg-warning-500/10 text-warning-500",
  progresso_peso: "bg-success-500/10 text-success-500",
  sequencia: "bg-danger-500/10 text-danger-500",
  tempo_acompanhamento: "bg-brand-50 text-brand-700",
};

export function ConquistasFaixa({ conquistas }: { conquistas: Conquista[] }) {
  if (conquistas.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {conquistas.map((c) => {
        const Icone = ICONE_POR_TIPO[c.tipo];
        return (
          <div
            key={c.tipo}
            title={c.descricao}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-white py-2 pl-2.5 pr-4"
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${COR_POR_TIPO[c.tipo]}`}>
              <Icone className="h-3.5 w-3.5" />
            </span>
            <span className="whitespace-nowrap text-xs font-medium text-foreground">{c.titulo}</span>
          </div>
        );
      })}
    </div>
  );
}
