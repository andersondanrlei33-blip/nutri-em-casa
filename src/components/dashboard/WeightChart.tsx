"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatarData } from "@/lib/utils/date";

interface Ponto {
  data: string;
  peso_kg: number;
}

export function WeightChart({ pontos }: { pontos: Ponto[] }) {
  if (pontos.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted">
        Registre seu peso por alguns dias para ver a evolução aqui.
      </div>
    );
  }

  const dados = pontos.map((p) => ({ ...p, dataFormatada: formatarData(p.data, "dd/MM") }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={dados} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e6" />
        <XAxis dataKey="dataFormatada" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e3e9e6", fontSize: 13 }}
          formatter={(valor: number) => [`${valor} kg`, "Peso"]}
        />
        <Line type="monotone" dataKey="peso_kg" stroke="#22a86a" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
