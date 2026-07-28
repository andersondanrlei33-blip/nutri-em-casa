"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { useTourStore } from "@/lib/tour/store";
import { PASSOS_TOUR } from "@/lib/tour/steps";

interface Retangulo {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGEM = 8;

export function TourOverlay() {
  const { ativo, passoIndex, proximo, anterior, pular } = useTourStore();
  const [rect, setRect] = useState<Retangulo | null>(null);

  const passo = PASSOS_TOUR[passoIndex];
  const ultimo = passoIndex === PASSOS_TOUR.length - 1;
  const primeiro = passoIndex === 0;

  useEffect(() => {
    if (!ativo) return;

    function medir() {
      if (!passo.alvo) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${passo.alvo}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    // dá tempo do menu mobile abrir/renderizar antes de medir a posição real
    const t1 = setTimeout(medir, 50);
    const t2 = setTimeout(medir, 250);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [ativo, passo.alvo, passoIndex]);

  if (!ativo) return null;

  const alvoComRect = passo.alvo && rect ? rect : null;

  return (
    <div className="fixed inset-0 z-[100]">
      {alvoComRect ? (
        <RecortesSpotlight rect={alvoComRect} />
      ) : (
        <div className="absolute inset-0 bg-black/50" onClick={pular} />
      )}

      {alvoComRect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-400 ring-offset-2 transition-all duration-300"
          style={{
            top: alvoComRect.top - MARGEM,
            left: alvoComRect.left - MARGEM,
            width: alvoComRect.width + MARGEM * 2,
            height: alvoComRect.height + MARGEM * 2,
          }}
        />
      )}

      <TooltipTour
        rect={alvoComRect}
        titulo={passo.titulo}
        descricao={passo.descricao}
        indice={passoIndex}
        total={PASSOS_TOUR.length}
        primeiro={primeiro}
        ultimo={ultimo}
        aoAnterior={anterior}
        aoProximo={proximo}
        aoPular={pular}
      />
    </div>
  );
}

function RecortesSpotlight({ rect }: { rect: Retangulo }) {
  const top = rect.top - MARGEM;
  const left = rect.left - MARGEM;
  const largura = rect.width + MARGEM * 2;
  const altura = rect.height + MARGEM * 2;

  return (
    <>
      <div
        className="absolute bg-black/50 transition-all duration-300"
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }}
      />
      <div
        className="absolute bg-black/50 transition-all duration-300"
        style={{ top, left: 0, width: Math.max(0, left), height: altura }}
      />
      <div
        className="absolute bg-black/50 transition-all duration-300"
        style={{ top, left: left + largura, right: 0, height: altura }}
      />
      <div
        className="absolute bg-black/50 transition-all duration-300"
        style={{ top: top + altura, left: 0, right: 0, bottom: 0 }}
      />
    </>
  );
}

function TooltipTour({
  rect,
  titulo,
  descricao,
  indice,
  total,
  primeiro,
  ultimo,
  aoAnterior,
  aoProximo,
  aoPular,
}: {
  rect: Retangulo | null;
  titulo: string;
  descricao: string;
  indice: number;
  total: number;
  primeiro: boolean;
  ultimo: boolean;
  aoAnterior: () => void;
  aoProximo: () => void;
  aoPular: () => void;
}) {
  const estilo = calcularPosicaoTooltip(rect);

  return (
    <div
      className="absolute rounded-2xl border border-border bg-white p-5 shadow-xl transition-all duration-300"
      style={estilo}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
        <button
          onClick={aoPular}
          className="shrink-0 text-muted hover:text-foreground"
          aria-label="Fechar tour"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">{descricao}</p>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === indice ? "bg-brand-500" : "bg-black/10"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {!primeiro && (
            <button
              onClick={aoAnterior}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-black/[0.03]"
            >
              Voltar
            </button>
          )}
          <button
            onClick={aoProximo}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            {ultimo ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function calcularPosicaoTooltip(rect: Retangulo | null): CSSProperties {
  if (typeof window === "undefined") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 320 };
  }

  const larguraJanela = window.innerWidth;
  const alturaJanela = window.innerHeight;
  const larguraCard = Math.min(384, larguraJanela - 32);

  if (!rect) {
    return {
      top: "50%",
      left: "50%",
      width: larguraCard,
      transform: "translate(-50%, -50%)",
    };
  }

  const espacoAbaixo = alturaJanela - (rect.top + rect.height + MARGEM);
  const espacoAcima = rect.top - MARGEM;

  let top: number;
  if (espacoAbaixo > 220 || espacoAbaixo > espacoAcima) {
    top = rect.top + rect.height + MARGEM + 12;
  } else {
    top = rect.top - MARGEM - 12 - 200;
  }
  top = Math.min(top, alturaJanela - 16 - 220);
  top = Math.max(16, top);

  let left = rect.left;
  left = Math.min(left, larguraJanela - larguraCard - 16);
  left = Math.max(16, left);

  return { top, left, width: larguraCard };
}
