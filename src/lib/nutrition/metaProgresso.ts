/**
 * Estima quanto falta para o paciente bater a meta de peso definida na
 * consulta, e — só quando o progresso está indo na direção certa — uma
 * estimativa de prazo baseada no ritmo observado até agora. É a pergunta
 * clássica de fechamento de consulta: "faltam quantos kg, e em quanto tempo".
 */
export function estimarProgressoMeta({
  pesoAtual,
  pesoMeta,
  pesoInicial,
  diasDecorridos,
}: {
  pesoAtual: number;
  pesoMeta: number;
  pesoInicial: number;
  diasDecorridos: number;
}): {
  faltamKg: number;
  precisaPerder: boolean;
  direcaoCorreta: boolean;
  semanasEstimadas: number | null;
} {
  const diferenca = Math.round((pesoAtual - pesoMeta) * 10) / 10;
  const precisaPerder = diferenca > 0;
  const faltamKg = Math.abs(diferenca);

  const progressoTotal = pesoInicial - pesoAtual; // positivo = perdeu peso desde o início
  const direcaoCorreta = faltamKg === 0 ? true : precisaPerder ? progressoTotal > 0 : progressoTotal < 0;

  let semanasEstimadas: number | null = null;
  if (direcaoCorreta && faltamKg > 0 && diasDecorridos > 0 && Math.abs(progressoTotal) > 0.1) {
    const semanasDecorridas = diasDecorridos / 7;
    const ritmoSemanal = Math.abs(progressoTotal) / semanasDecorridas;
    if (ritmoSemanal > 0) {
      semanasEstimadas = Math.round(faltamKg / ritmoSemanal);
    }
  }

  return { faltamKg, precisaPerder, direcaoCorreta, semanasEstimadas };
}
