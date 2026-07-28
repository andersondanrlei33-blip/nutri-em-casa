"use client";

import { useMemo, useState } from "react";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { formatarData } from "@/lib/utils/date";
import type { AvaliacaoNutricional } from "@/types/domain";

interface LinhaComparativa {
  label: string;
  valorA: number;
  valorB: number;
  unidade: string;
  favoravel: "queda" | "alta" | "neutro";
}

/** Comparador lado a lado entre duas consultas quaisquer — é exatamente o
 *  que um nutricionista faz numa consulta de retorno: pega a ficha anterior
 *  e compara ponto a ponto com a atual. */
export function ComparadorConsultas({ avaliacoes }: { avaliacoes: AvaliacaoNutricional[] }) {
  const [idA, setIdA] = useState(avaliacoes[0]?.id ?? "");
  const [idB, setIdB] = useState(avaliacoes[avaliacoes.length - 1]?.id ?? "");

  const consultaA = avaliacoes.find((a) => a.id === idA) ?? null;
  const consultaB = avaliacoes.find((a) => a.id === idB) ?? null;

  const linhas: LinhaComparativa[] = useMemo(() => {
    if (!consultaA || !consultaB) return [];
    const favoravelPeso: "queda" | "alta" = consultaB.objetivo === "ganho_massa" ? "alta" : "queda";
    return [
      { label: "Peso", valorA: consultaA.peso_kg, valorB: consultaB.peso_kg, unidade: " kg", favoravel: favoravelPeso },
      { label: "IMC", valorA: consultaA.imc, valorB: consultaB.imc, unidade: "", favoravel: favoravelPeso },
      { label: "TMB", valorA: consultaA.tmb, valorB: consultaB.tmb, unidade: " kcal", favoravel: "neutro" },
      { label: "TDEE", valorA: consultaA.tdee, valorB: consultaB.tdee, unidade: " kcal", favoravel: "neutro" },
      { label: "Meta calórica", valorA: consultaA.meta_calorica, valorB: consultaB.meta_calorica, unidade: " kcal", favoravel: "neutro" },
      { label: "Proteína", valorA: consultaA.meta_proteina_g, valorB: consultaB.meta_proteina_g, unidade: "g", favoravel: "neutro" },
      { label: "Carboidrato", valorA: consultaA.meta_carboidrato_g, valorB: consultaB.meta_carboidrato_g, unidade: "g", favoravel: "neutro" },
      { label: "Gordura", valorA: consultaA.meta_gordura_g, valorB: consultaB.meta_gordura_g, unidade: "g", favoravel: "neutro" },
      { label: "Água recomendada", valorA: consultaA.meta_agua_ml, valorB: consultaB.meta_agua_ml, unidade: " ml", favoravel: "neutro" },
    ];
  }, [consultaA, consultaB]);

  if (avaliacoes.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparar consultas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Você precisa de pelo menos duas consultas para comparar a evolução. Faça uma consulta de retorno quando
            fizer sentido.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparar consultas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={idA} onChange={(e) => setIdA(e.target.value)} className="sm:max-w-[220px]">
            {avaliacoes.map((a) => (
              <option key={a.id} value={a.id}>
                {formatarData(a.criado_em)}
              </option>
            ))}
          </Select>
          <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted sm:block" />
          <Select value={idB} onChange={(e) => setIdB(e.target.value)} className="sm:max-w-[220px]">
            {avaliacoes.map((a) => (
              <option key={a.id} value={a.id}>
                {formatarData(a.criado_em)}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          {linhas.map((linha) => (
            <LinhaTabela key={linha.label} {...linha} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaTabela({ label, valorA, valorB, unidade, favoravel }: LinhaComparativa) {
  const delta = Math.round((valorB - valorA) * 10) / 10;
  const bom = favoravel !== "neutro" && ((favoravel === "queda" && delta < 0) || (favoravel === "alta" && delta > 0));
  const ruim = favoravel !== "neutro" && delta !== 0 && !bom;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/[0.02] px-4 py-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">
          {valorA}
          {unidade}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted" />
        <span className="font-semibold text-foreground">
          {valorB}
          {unidade}
        </span>
        {delta !== 0 && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              bom ? "bg-success-500/10 text-success-500" : ruim ? "bg-danger-500/10 text-danger-500" : "bg-black/5 text-muted"
            }`}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}
            {delta}
            {unidade}
          </span>
        )}
      </div>
    </div>
  );
}
