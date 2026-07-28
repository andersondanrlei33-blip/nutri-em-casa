import { cn } from "@/lib/utils/cn";

export function ProgressBar({
  valor,
  max,
  className,
  corClasse = "bg-brand-500",
}: {
  valor: number;
  max: number;
  className?: string;
  corClasse?: string;
}) {
  const percentual = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-black/5", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", corClasse)}
        style={{ width: `${percentual}%` }}
      />
    </div>
  );
}
