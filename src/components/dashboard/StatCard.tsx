import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface StatCardProps {
  icone: LucideIcon;
  titulo: string;
  valor: string;
  sub?: string;
  progresso?: { atual: number; meta: number };
  acao?: ReactNode;
}

export function StatCard({ icone: Icone, titulo, valor, sub, progresso, acao }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
          <Icone className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <p className="text-xs text-muted">{titulo}</p>
          <p className="text-xl font-semibold text-foreground">{valor}</p>
        </div>
      </div>
      {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
      {progresso && (
        <div className="mt-3">
          <ProgressBar valor={progresso.atual} max={progresso.meta} />
        </div>
      )}
      {acao && <div className="mt-3">{acao}</div>}
    </Card>
  );
}
