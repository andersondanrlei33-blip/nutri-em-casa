/**
 * Estima quanto falta para o paciente bater a meta de peso definida na
 * consulta, e — só quando o progresso está indo na direção certa — uma
 * estimativa de prazo baseada no ritmo observado até agora. É a pergunta
 * clássica de fechamento de consulta: "faltam quantos kg, e em quanto tempo".
 *
 * Também avalia se esse ritmo observado é seguro: referência clínica usual
 * é não perder/ganhar mais que ~1% do peso corporal por semana sem
 * acompanhamento presencial. Isso é calculado sobre o progresso REAL
 * (histórico de pesagens), não sobre a meta calórica definida na consulta —
 * então pega tanto um plano agressivo demais quanto alguém que, na prática,
 * está perdendo peso mais rápido do que o plano previa.
 */
const RITMO_SEMANAL_SEGURO_PERCENTUAL = 0.01; // 1% do peso corporal por semana

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
  ritmoSemanalKg: number | null;
  ritmoSeguro: boolean;
} {
  const diferenca = Math.round((pesoAtual - pesoMeta) * 10) / 10;
  const precisaPerder = diferenca > 0;
  const faltamKg = Math.abs(diferenca);

  const progressoTotal = pesoInicial - pesoAtual; // positivo = perdeu peso desde o início
  const direcaoCorreta = faltamKg === 0 ? true : precisaPerder ? progressoTotal > 0 : progressoTotal < 0;

  let semanasEstimadas: number | null = null;
  let ritmoSemanalKg: number | null = null;
  if (direcaoCorreta && faltamKg > 0 && diasDecorridos > 0 && Math.abs(progressoTotal) > 0.1) {
    const semanasDecorridas = diasDecorridos / 7;
    const ritmoSemanal = Math.abs(progressoTotal) / semanasDecorridas;
    ritmoSemanalKg = Math.round(ritmoSemanal * 100) / 100;
    if (ritmoSemanal > 0) {
      semanasEstimadas = Math.round(faltamKg / ritmoSemanal);
    }
  }

  const limiteSeguroKg = pesoAtual * RITMO_SEMANAL_SEGURO_PERCENTUAL;
  const ritmoSeguro = ritmoSemanalKg == null || ritmoSemanalKg <= limiteSeguroKg;

  return { faltamKg, precisaPerder, direcaoCorreta, semanasEstimadas, ritmoSemanalKg, ritmoSeguro };
}
