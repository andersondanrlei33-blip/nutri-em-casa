"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatarData } from "@/lib/utils/date";
import type { AvaliacaoNutricional } from "@/types/domain";

/** Barras empilhadas de massa magra + massa gorda por consulta — só entram
 *  no gráfico as consultas cujo laudo de avaliação física trouxe os dois
 *  valores. Complementa o gráfico de % de gordura mostrando o quadro em kg,
 *  que é o que costuma tornar uma variação de composição corporal mais
 *  concreta pro paciente do que só a porcentagem. */
export function GraficoComposicaoCorporal({ avaliacoes }: { avaliacoes: AvaliacaoNutricional[] }) {
  const dados = avaliacoes
    .filter((a) => a.avaliacao_fisica_dados?.massaMagraKg != null && a.avaliacao_fisica_dados?.massaGordaKg != null)
    .map((a) => ({
      dataFormatada: formatarData(a.criado_em, "dd/MM"),
      "Massa magra": a.avaliacao_fisica_dados!.massaMagraKg as number,
      "Massa gorda": a.avaliacao_fisica_dados!.massaGordaKg as number,
    }));

  if (dados.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-center text-sm text-muted">
        Ainda não há consultas suficientes com massa magra e massa gorda extraídas do laudo pra montar o gráfico.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={dados} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e6" />
        <XAxis dataKey="dataFormatada" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} unit="kg" />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e3e9e6", fontSize: 13 }}
          formatter={(valor: number) => `${valor}kg`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Massa magra" stackId="composicao" fill="#22a86a" radius={[0, 0, 4, 4]} />
        <Bar dataKey="Massa gorda" stackId="composicao" fill="#f0973b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

