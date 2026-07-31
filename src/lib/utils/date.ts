import { format, parseISO, startOfWeek, addDays, isToday as isTodayFns } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Fuso horário usado em toda a exibição de datas/horas do app — o público é
 *  majoritariamente brasileiro, mas o servidor (Vercel) roda em UTC. O
 *  Brasil não usa mais horário de verão desde 2019, então o deslocamento de
 *  -3h (Brasília) é fixo; se isso mudar, é só ajustar aqui. */
const OFFSET_BRASILIA_HORAS = 3;

/** Converte um instante (UTC) pro "horário de parede" de Brasília, mas ainda
 *  como um objeto Date lido com os getters locais (getHours, getDate...) —
 *  é assim que o date-fns (format, startOfWeek etc.) e o próprio JS
 *  interpretam esse valor no servidor, que roda em UTC. */
function paraHorarioLocal(data: Date): Date {
  return new Date(data.getTime() - OFFSET_BRASILIA_HORAS * 60 * 60 * 1000);
}

/** "Agora", já no horário de Brasília. */
function agoraLocal(): Date {
  return paraHorarioLocal(new Date());
}

export const hojeISO = () => format(agoraLocal(), "yyyy-MM-dd");

export function formatarData(data: string | Date, padrao = "dd/MM/yyyy") {
  const d = typeof data === "string" ? parseISO(data) : data;
  return format(paraHorarioLocal(d), padrao, { locale: ptBR });
}

export function formatarDataLonga(data: string | Date) {
  return formatarData(data, "EEEE, d 'de' MMMM");
}

export function isHoje(data: string | Date) {
  const d = typeof data === "string" ? parseISO(data) : data;
  return isTodayFns(paraHorarioLocal(d));
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

/** Retorna as datas (segunda a domingo) da semana corrente, já no horário de Brasília. */
export function semanaAtual(referencia = agoraLocal()) {
  const inicio = startOfWeek(referencia, { weekStartsOn: 1 });
  return DIAS_SEMANA.map((dia, i) => ({ dia, data: addDays(inicio, i) }));
}

/** Dia da semana de hoje (horário de Brasília), no mesmo formato usado em dia_semana (segunda..domingo). */
export function diaSemanaHoje() {
  const indiceDiaJs = agoraLocal().getDay(); // 0 = domingo
  return DIAS_SEMANA[(indiceDiaJs + 6) % 7];
}

/**
 * Calcula a sequência atual de dias consecutivos com pelo menos um registro
 * (peso, água, sono, humor, exercício, medidas ou refeição comida), a partir
 * de uma lista de datas em formato "yyyy-MM-dd" (podem se repetir e vir de
 * fontes diferentes). Se hoje ainda não tem nenhum registro, isso não quebra
 * a sequência — o dia ainda não terminou — e a contagem passa a considerar
 * a partir de ontem. Tudo calculado no horário de Brasília.
 */
export function calcularSequenciaAtual(datas: string[]): number {
  const unicas = new Set(datas);
  let cursor = agoraLocal();
  if (!unicas.has(format(cursor, "yyyy-MM-dd"))) {
    cursor = addDays(cursor, -1);
  }
  let sequencia = 0;
  while (unicas.has(format(cursor, "yyyy-MM-dd"))) {
    sequencia++;
    cursor = addDays(cursor, -1);
  }
  return sequencia;
}
