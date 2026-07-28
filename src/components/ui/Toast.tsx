"use client";

import { create } from "zustand";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type TipoToast = "sucesso" | "erro" | "info";

interface ToastItem {
  id: string;
  mensagem: string;
  tipo: TipoToast;
}

interface ToastStore {
  itens: ToastItem[];
  adicionar: (mensagem: string, tipo?: TipoToast) => void;
  remover: (id: string) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  itens: [],
  adicionar: (mensagem, tipo = "info") =>
    set((s) => ({ itens: [...s.itens, { id: crypto.randomUUID(), mensagem, tipo }] })),
  remover: (id) => set((s) => ({ itens: s.itens.filter((i) => i.id !== id) })),
}));

/** API simples para disparar feedback visual de qualquer lugar do app. */
export const toast = {
  sucesso: (mensagem: string) => useToastStore.getState().adicionar(mensagem, "sucesso"),
  erro: (mensagem: string) => useToastStore.getState().adicionar(mensagem, "erro"),
  info: (mensagem: string) => useToastStore.getState().adicionar(mensagem, "info"),
};

const ICONES: Record<TipoToast, typeof CheckCircle2> = {
  sucesso: CheckCircle2,
  erro: XCircle,
  info: Info,
};
const CORES: Record<TipoToast, string> = {
  sucesso: "border-l-4 border-success-500",
  erro: "border-l-4 border-danger-500",
  info: "border-l-4 border-brand-400",
};

export function ToastViewport() {
  const { itens, remover } = useToastStore();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    const timers = itens.map((item) => setTimeout(() => remover(item.id), 4000));
    return () => timers.forEach(clearTimeout);
  }, [itens, remover]);

  if (!montado) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:bottom-6 sm:right-6">
      {itens.map((item) => {
        const Icone = ICONES[item.tipo];
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 shadow-lg animate-fade-in-up ${CORES[item.tipo]}`}
          >
            <Icone className="h-4.5 w-4.5 shrink-0 text-foreground/80" />
            <p className="text-sm text-foreground">{item.mensagem}</p>
            <button onClick={() => remover(item.id)} className="ml-2 text-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
