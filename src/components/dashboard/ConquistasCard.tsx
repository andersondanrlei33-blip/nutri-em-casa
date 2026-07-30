import { Trophy, TrendingUp, Flame, CalendarCheck, LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Conquista, TipoConquista } from "@/lib/nutrition/conquistas";

const ICONES: Record<TipoConquista, LucideIcon> = {
  meta_batida: Trophy,
  progresso_peso: TrendingUp,
  sequencia: Flame,
  tempo_acompanhamento: CalendarCheck,
};

/** Mostra as conquistas/marcos que o paciente já bateu (ver lib/nutrition/conquistas.ts). */
export function ConquistasCard({ conquistas }: { conquistas: Conquista[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conquistas</CardTitle>
      </CardHeader>
      <CardContent>
        {conquistas.length === 0 ? (
          <EmptyState
            icone={Trophy}
            titulo="Suas conquistas aparecem aqui"
            descricao="Continue registrando seus dados para desbloquear marcos de progresso."
          />
        ) : (
          <ul className="space-y-3">
            {conquistas.map((conquista, i) => {
              const Icone = ICONES[conquista.tipo];
              return (
                <li key={i} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Icone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{conquista.titulo}</p>
                    <p className="text-xs text-muted">{conquista.descricao}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
