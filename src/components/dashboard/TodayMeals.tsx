import { Clock, Utensils } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RefeicaoPlano } from "@/types/domain";

export function TodayMeals({ refeicoes }: { refeicoes: RefeicaoPlano[] }) {
  if (refeicoes.length === 0) {
    return (
      <EmptyState
        icone={Utensils}
        titulo="Nenhuma refeição para hoje"
        descricao="Faça sua consulta nutricional para gerar um plano alimentar personalizado."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {refeicoes.map((refeicao) => (
        <li key={refeicao.id} className="flex items-center gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{refeicao.nome_refeicao}</p>
            <p className="text-xs text-muted">{refeicao.horario.slice(0, 5)}</p>
          </div>
          {refeicao.consumida && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
              Consumida
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
