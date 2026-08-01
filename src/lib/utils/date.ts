import { format, parseISO, startOfWeek, addDays, isToday as isTodayFns } from "date-fns";
import { ptBR } from "date-fns/locale";

export const hojeISO = () => format(new Date(), "yyyy-MM-dd");

/** Intervalo mínimo entre consultas — a nutricionista atende em ciclos de
 *  15 dias (duas consultas por mês). Usado pela trava real em
 *  app/api/gerar-plano/route.ts, pelo bloqueio visual em
 *  app/(app)/consulta/page.tsx e pelo selo informativo em
 *  app/(app)/evolucao/page.tsx — os três leem esta mesma constante, pra
 *  nunca ficarem dessincronizados entre si. */
export const INTERVALO_MINIMO_ENTRE_CONSULTAS_DIAS = 15;

/** Data em que a próxima consulta é liberada, dado o intervalo mínimo
 *  configurado acima (ou um valor customizado, se informado). */
export function calcularProximaLiberacao(
  ultimaData: string | Date,
  intervaloDias: number = INTERVALO_MINIMO_ENTRE_CONSULTAS_DIAS
): Date {
  const d = typeof ultimaData === "string" ? parseISO(ultimaData) : ultimaData;
  return addDays(d, intervaloDias);
}

export function formatarData(data: string | Date, padrao = "dd/MM/yyyy") {
  const d = typeof data === "string" ? parseISO(data) : data;
  return format(d, padrao, { locale: ptBR });
}

export function formatarDataLonga(data: string | Date) {
  return formatarData(data, "EEEE, d 'de' MMMM");
}

export function isHoje(data: string | Date) {
  const d = typeof data === "string" ? parseISO(data) : data;
  return isTodayFns(d);
}

/** Quantos dias inteiros já se passaram desde a data informada. */
export function diasDesde(data: string | Date) {
  const d = typeof data === "string" ? parseISO(data) : data;
  const diffMs = Date.now() - d.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export const DIAS_SEMANA = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
] as const;

export const DIAS_SEMANA_LABEL: Record<(typeof DIAS_SEMANA)[number], string> = {
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
  domingo: "Domingo",
};

/** Retorna as datas (segunda a domingo) da semana corrente. */
export function semanaAtual(referencia = new Date()) {
  const inicio = startOfWeek(referencia, { weekStartsOn: 1 });
  return DIAS_SEMANA.map((dia, i) => ({ dia, data: addDays(inicio, i) }));
}

/** Dia da semana de hoje, no mesmo formato usado em dia_semana (segunda..domingo). */
export function diaSemanaHoje() {
  const indiceDiaJs = new Date().getDay(); // 0 = domingo
  return DIAS_SEMANA[(indiceDiaJs + 6) % 7];
}

/**
 * Sequência atual de dias consecutivos com pelo menos um registro (peso,
 * água, sono, humor, exercício ou medidas — qualquer um conta como "usei o
 * app hoje"). Conta pra trás a partir de hoje; se hoje ainda não tem
 * registro, começa a contar a partir de ontem (não quebra a sequência só
 * porque a pessoa ainda não abriu o app hoje). Datas devem estar no formato
 * "yyyy-MM-dd" (aceita duplicadas e fora de ordem).
 */
export function calcularSequenciaAtual(datas: string[], referencia = new Date()): number {
  const unicas = new Set(datas.map((d) => d.slice(0, 10)));
  if (unicas.size === 0) return 0;

  const hoje = format(referencia, "yyyy-MM-dd");
  let cursor = unicas.has(hoje) ? referencia : addDays(referencia, -1);

  // Se nem hoje nem ontem têm registro, a sequência foi quebrada.
  if (!unicas.has(format(cursor, "yyyy-MM-dd"))) return 0;

  let sequencia = 0;
  while (unicas.has(format(cursor, "yyyy-MM-dd"))) {
    sequencia++;
    cursor = addDays(cursor, -1);
  }
  return sequencia;
}
