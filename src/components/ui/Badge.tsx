import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Tom = "brand" | "accent" | "neutro" | "perigo" | "sucesso";

const TONS: Record<Tom, string> = {
  brand: "bg-brand-100 text-brand-700",
  accent: "bg-orange-100 text-accent-600",
  neutro: "bg-black/5 text-muted",
  perigo: "bg-red-100 text-danger-500",
  sucesso: "bg-green-100 text-success-500",
};

export function Badge({
  tom = "brand",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tom?: Tom }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TONS[tom],
        className
      )}
      {...props}
    />
  );
}
