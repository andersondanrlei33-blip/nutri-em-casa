import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface EmptyStateProps {
  icone: LucideIcon;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}

/** Estado vazio elegante e consistente, usado em todos os módulos com listas. */
export function EmptyState({ icone: Icone, titulo, descricao, acao }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-brand-50/40 px-6 py-14 text-center animate-fade-in-up">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
        <Icone className="h-6 w-6 text-brand-600" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
      {descricao && <p className="mt-1.5 max-w-sm text-sm text-muted">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}
