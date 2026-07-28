/**
 * Filtro de receitas por alergia/restrição alimentar.
 *
 * Por que isso existe: alergia é informação de segurança, não deveria
 * depender só de um modelo de IA "seguir a instrução" num prompt. Aqui a
 * exclusão é feita em código, contra tags estruturadas (`alergenos` e
 * `dietas_atendidas`) gravadas em cada receita — determinístico e testável.
 */
import type { AvaliacaoNutricional, CategoriaReceita, Receita } from "@/types/domain";

/** Vocabulário fechado de alérgenos reconhecidos. */
const MAPA_ALERGENOS: Record<string, string> = {
  amendoim: "amendoim",
  leite: "lactose",
  lactose: "lactose",
  laticinio: "lactose",
  laticinios: "lactose",
  gluten: "gluten",
  trigo: "gluten",
  ovo: "ovo",
  ovos: "ovo",
  castanha: "castanhas",
  castanhas: "castanhas",
  noz: "castanhas",
  nozes: "castanhas",
  amendoa: "castanhas",
  amendoas: "castanhas",
  peixe: "peixe",
  camarao: "frutos_do_mar",
  marisco: "frutos_do_mar",
  "frutos do mar": "frutos_do_mar",
  soja: "soja",
};

/** Vocabulário fechado de dietas/restrições reconhecidas. */
const MAPA_DIETAS: Record<string, string> = {
  vegetariano: "vegetariano",
  vegetariana: "vegetariano",
  vegano: "vegano",
  vegana: "vegano",
  "sem gluten": "sem_gluten",
  "sem glúten": "sem_gluten",
  celiaco: "sem_gluten",
  celíaco: "sem_gluten",
  "sem lactose": "sem_lactose",
  "intolerante a lactose": "sem_lactose",
  "intolerante à lactose": "sem_lactose",
};

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[̀-ͯ]", "g"), "")
    .trim();
}

function extrairTags(itens: string[], mapa: Record<string, string>): Set<string> {
  const normalizados = itens.map(normalizar);
  const tags = new Set<string>();
  for (const [chave, tag] of Object.entries(mapa)) {
    const chaveNorm = normalizar(chave);
    if (normalizados.some((item) => item.includes(chaveNorm))) tags.add(tag);
  }
  return tags;
}

export interface FiltroReceitas {
  /** Alérgenos que NENHUMA receita sugerida pode conter (bloqueio duro). */
  alergiasBloqueadas: Set<string>;
  /** Dietas que TODA receita sugerida precisa atender (bloqueio duro). */
  dietasExigidas: Set<string>;
  /** Palavras de alimentos que o usuário disse não gostar (sinal fraco, só desempate). */
  alimentosEvitados: string[];
}

export function construirFiltro(avaliacao: AvaliacaoNutricional): FiltroReceitas {
  return {
    alergiasBloqueadas: extrairTags(avaliacao.alergias, MAPA_ALERGENOS),
    dietasExigidas: extrairTags(avaliacao.restricoes_alimentares, MAPA_DIETAS),
    alimentosEvitados: avaliacao.alimentos_evitados.map(normalizar).filter(Boolean),
  };
}

/** Uma receita é segura se não contém nenhum alérgeno bloqueado e atende a todas as dietas exigidas. */
export function receitaEhSegura(receita: Receita, filtro: FiltroReceitas): boolean {
  const alergenos = new Set(receita.alergenos ?? []);
  for (const bloqueado of filtro.alergiasBloqueadas) {
    if (alergenos.has(bloqueado)) return false;
  }
  const dietas = new Set(receita.dietas_atendidas ?? []);
  for (const exigida of filtro.dietasExigidas) {
    if (!dietas.has(exigida)) return false;
  }
  return true;
}

function receitaContemAlimentoEvitado(receita: Receita, filtro: FiltroReceitas): boolean {
  if (filtro.alimentosEvitados.length === 0) return false;
  return receita.ingredientes.some((ing) =>
    filtro.alimentosEvitados.some((evitado) => normalizar(ing.nome).includes(evitado))
  );
}

/** Também usado para checar o texto livre gerado por IA contra alergias reais do usuário
 *  (segunda camada de segurança, além do filtro estrutural por tags). */
export function textoContemAlergiaDoUsuario(texto: string, alergias: string[]): boolean {
  const textoNorm = normalizar(texto);
  return alergias.some((a) => {
    const termo = normalizar(a);
    return termo.length > 2 && textoNorm.includes(termo);
  });
}

/** Receitas da categoria pedida que respeitam alergias/restrições, priorizando
 *  as que também evitam o que o usuário disse não gostar. */
export function filtrarReceitasCompativeis(
  receitas: Receita[],
  categoria: CategoriaReceita,
  filtro: FiltroReceitas
): Receita[] {
  const daCategoria = receitas.filter((r) => r.categoria === categoria);
  const seguras = daCategoria.filter((r) => receitaEhSegura(r, filtro));
  const preferidas = seguras.filter((r) => !receitaContemAlimentoEvitado(r, filtro));
  return preferidas.length > 0 ? preferidas : seguras;
}

/** Escolhe a receita com calorias mais próximas do alvo, evitando repetir
 *  uma já usada recentemente na semana quando há alternativa. */
export function escolherReceita(
  candidatas: Receita[],
  caloriasAlvo: number,
  usadasRecentemente: Set<string>
): Receita | null {
  if (candidatas.length === 0) return null;
  const naoRepetidas = candidatas.filter((r) => !usadasRecentemente.has(r.id));
  const pool = naoRepetidas.length > 0 ? naoRepetidas : candidatas;
  return pool.reduce((melhor, atual) =>
    Math.abs(atual.calorias - caloriasAlvo) < Math.abs(melhor.calorias - caloriasAlvo) ? atual : melhor
  );
}
