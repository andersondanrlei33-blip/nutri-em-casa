import { format, parseISO, startOfWeek, addDays, isToday as isTodayFns } from "date-fns";
import { ptBR } from "date-fns/locale";

export const hojeISO = () => format(new Date(), "yyyy-MM-dd");

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
