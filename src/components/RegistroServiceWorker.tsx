"use client";

import { useEffect } from "react";

/** Registra o service worker do PWA no primeiro carregamento no cliente. */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch((erro) => {
      console.error("Falha ao registrar o service worker:", erro);
    });
  }, []);

  return null;
}
