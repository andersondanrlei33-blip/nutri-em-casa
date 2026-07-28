"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatarData } from "@/lib/utils/date";
import type { RegistroMedidas } from "@/types/domain";

export function GraficoMedidas({ registros }: { registros: RegistroMedidas[] }) {
  const comMedida = registros.filter((r) => r.cintura_cm != null || r.quadril_cm != null);

  if (comMedida.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-center text-sm text-muted">
        Registre cintura e quadril em pelo menos duas ocasiões (aba Medidas em Acompanhamento) para ver o gráfico aqui.
      </div>
    );
  }

  const dados = comMedida.map((r) => ({
    dataFormatada: formatarData(r.data, "dd/MM"),
    cintura: r.cintura_cm,
    quadril: r.quadril_cm,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={dados} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e3e9e6" />
        <XAxis dataKey="dataFormatada" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e3e9e6", fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" name="Cintura (cm)" dataKey="cintura" stroke="#22a86a" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" name="Quadril (cm)" dataKey="quadril" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
