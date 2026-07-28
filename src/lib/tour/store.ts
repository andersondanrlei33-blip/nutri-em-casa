"use client";

import { create } from "zustand";
import { PASSOS_TOUR } from "./steps";

const CHAVE_STORAGE = "nutri-em-casa:tour-concluido";

interface TourStore {
  ativo: boolean;
  passoIndex: number;
  iniciar: () => void;
  proximo: () => void;
  anterior: () => void;
  pular: () => void;
}

export const useTourStore = create<TourStore>((set, get) => ({
  ativo: false,
  passoIndex: 0,
  iniciar: () => set({ ativo: true, passoIndex: 0 }),
  proximo: () => {
    const { passoIndex } = get();
    if (passoIndex >= PASSOS_TOUR.length - 1) {
      marcarComoVisto();
      set({ ativo: false });
      return;
    }
    set({ passoIndex: passoIndex + 1 });
  },
  anterior: () => set((s) => ({ passoIndex: Math.max(0, s.passoIndex - 1) })),
  pular: () => {
    marcarComoVisto();
    set({ ativo: false });
  },
}));

function marcarComoVisto() {
  try {
    localStorage.setItem(CHAVE_STORAGE, "1");
  } catch {
    // localStorage indisponível (modo privado etc.) — sem problema, o tour
    // apenas voltará a aparecer na próxima visita.
  }
}

export function tourJaFoiVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE_STORAGE) === "1";
  } catch {
    return false;
  }
}
