import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Variante = "primaria" | "secundaria" | "fantasma" | "perigo";
type Tamanho = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
}

const VARIANTES: Record<Variante, string> = {
  primaria: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/20",
  secundaria: "bg-white text-brand-700 border border-border hover:bg-brand-50",
  fantasma: "bg-transparent text-foreground hover:bg-black/5",
  perigo: "bg-danger-500 text-white hover:bg-red-600",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante = "primaria", tamanho = "md", carregando, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || carregando}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
          VARIANTES[variante],
          TAMANHOS[tamanho],
          className
        )}
        {...props}
      >
        {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
