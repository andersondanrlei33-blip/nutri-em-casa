"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatarData } from "@/lib/utils/date";

interface Ponto {
  data: string;
  valor: number | null;
}

interface GraficoLinhaConsultaProps {
  pontos: Ponto[];
  unidade: string;
  cor: string;
  rotulo: string;
  mensagemVazio?: string;
}

/** Gráfico de linha genérico pra uma métrica ao longo das CONSULTAS (não do
 *  registro manual diário em Acompanhamento) — usado pra peso e % de
 *  gordura corporal na página de Evolução. Ignora pontos nulos (ex: uma
 *  consulta sem avaliação física anexada) em vez de quebrar a linha. */
export function GraficoLinhaConsulta({ pontos, unidade, cor, rotulo, mensagemVazio }: GraficoLinhaConsultaProps) {
  const validos = pontos.filter((p): p is { data: string; valor: number } => p.valor != null);

  if (validos.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-center text-sm text-muted">
        {mensagemVazio ?? "Ainda não há consultas suficientes com esse dado pra montar o gráfico."}
      </div>
    );
  }

  const dados = validos.map((p) => ({ dataFormatada: formatarData(p.data, "dd/MM"), valor: p.valor }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={dados} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e6" />
        <XAxis dataKey="dataFormatada" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e3e9e6", fontSize: 13 }}
          formatter={(valor: number) => [`${valor}${unidade}`, rotulo]}
        />
        <Line type="monotone" dataKey="valor" stroke={cor} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

