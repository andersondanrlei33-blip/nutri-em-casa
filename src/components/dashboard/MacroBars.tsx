import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface Macros {
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
}

const MACROS: { chave: keyof Macros; label: string; cor: string }[] = [
  { chave: "proteinaG", label: "Proteína", cor: "bg-brand-500" },
  { chave: "carboidratoG", label: "Carboidrato", cor: "bg-amber-400" },
  { chave: "gorduraG", label: "Gordura", cor: "bg-sky-400" },
];

/**
 * Barras de progresso dos macronutrientes consumidos hoje vs. a meta
 * calculada na consulta nutricional. `consumido` vem só das refeições já
 * marcadas como consumidas (ver TodayMeals), nunca uma estimativa.
 */
export function MacroBars({ consumido, meta }: { consumido: Macros; meta: Macros }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Macros de hoje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {MACROS.map(({ chave, label, cor }) => {
          const atual = Math.round(consumido[chave]);
          const alvo = Math.round(meta[chave]);
          const percentual = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0;
          return (
            <div key={chave}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-muted">
                  {atual}g / {alvo}g
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.05]">
                <div className={`h-full rounded-full ${cor}`} style={{ width: `${percentual}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
