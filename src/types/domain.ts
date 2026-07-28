/**
 * Domain types shared across the app. These mirror the Supabase schema
 * defined in supabase/migrations/0001_init.sql — keep both in sync.
 */

export type Genero = "feminino" | "masculino" | "outro";

export type NivelAtividade =
  | "sedentario"
  | "leve"
  | "moderado"
  | "intenso"
  | "atleta";

export type ObjetivoNutricional =
  | "emagrecimento"
  | "manutencao"
  | "ganho_massa"
  | "saude_geral"
  | "performance_esportiva";

export type PlanoAssinatura = "gratuito" | "premium" | "anual" | "trial";

export type StatusAssinatura =
  | "ativa"
  | "trial"
  | "cancelada"
  | "expirada"
  | "inadimplente";

export type ProvedorPagamento =
  | "stripe"
  | "mercadopago"
  | "asaas"
  | "hotmart"
  | "kiwify";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  data_nascimento: string | null;
  genero: Genero | null;
  criado_em: string;
  atualizado_em: string;
}

export interface AvaliacaoNutricional {
  id: string;
  usuario_id: string;
  peso_kg: number;
  altura_cm: number;
  idade: number;
  genero: Genero;
  nivel_atividade: NivelAtividade;
  objetivo: ObjetivoNutricional;
  peso_meta_kg: number | null;
  restricoes_alimentares: string[];
  alergias: string[];
  condicoes_saude: string[];
  refeicoes_por_dia: number;
  preferencias_alimentares: string[];
  alimentos_evitados: string[];
  qualidade_sono: number | null;
  nivel_estresse: number | null;
  observacoes: string | null;
  imc: number;
  classificacao_imc: string;
  tmb: number;
  tdee: number;
  meta_calorica: number;
  meta_proteina_g: number;
  meta_carboidrato_g: number;
  meta_gordura_g: number;
  meta_fibra_g: number;
  meta_agua_ml: number;
  criado_em: string;
}

export interface Receita {
  id: string;
  usuario_id: string | null;
  nome: string;
  descricao: string | null;
  categoria: CategoriaReceita;
  ingredientes: IngredienteReceita[];
  modo_preparo: string[];
  tempo_preparo_min: number;
  porcoes: number;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
  fibra_g: number;
  imagem_url: string | null;
  favorito: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type CategoriaReceita =
  | "cafe_da_manha"
  | "almoco"
  | "jantar"
  | "lanche"
  | "sobremesa"
  | "pre_treino"
  | "pos_treino";

export interface IngredienteReceita {
  nome: string;
  quantidade: number;
  unidade: string;
}

export interface PlanoAlimentar {
  id: string;
  usuario_id: string;
  nome: string;
  data_inicio: string;
  ativo: boolean;
  criado_em: string;
}

export type DiaSemana =
  | "segunda"
  | "terca"
  | "quarta"
  | "quinta"
  | "sexta"
  | "sabado"
  | "domingo";

export interface RefeicaoPlano {
  id: string;
  plano_id: string;
  receita_id: string | null;
  dia_semana: DiaSemana;
  nome_refeicao: string;
  horario: string;
  quantidade_porcoes: number;
  ordem: number;
  consumida: boolean;
  criado_em: string;
}

export interface RegistroConsumo {
  id: string;
  usuario_id: string;
  refeicao_plano_id: string | null;
  data: string;
  calorias: number;
  proteina_g: number;
  carboidrato_g: number;
  gordura_g: number;
  criado_em: string;
}

export interface RegistroPeso {
  id: string;
  usuario_id: string;
  peso_kg: number;
  data: string;
  observacoes: string | null;
  criado_em: string;
}

export interface RegistroMedidas {
  id: string;
  usuario_id: string;
  data: string;
  cintura_cm: number | null;
  quadril_cm: number | null;
  peito_cm: number | null;
  braco_cm: number | null;
  coxa_cm: number | null;
  pescoco_cm: number | null;
  percentual_gordura: number | null;
  criado_em: string;
}

export interface RegistroAgua {
  id: string;
  usuario_id: string;
  data: string;
  quantidade_ml: number;
  criado_em: string;
}

export interface RegistroSono {
  id: string;
  usuario_id: string;
  data: string;
  horas: number;
  qualidade: number;
  criado_em: string;
}

export interface RegistroHumor {
  id: string;
  usuario_id: string;
  data: string;
  humor: number;
  energia: number;
  observacoes: string | null;
  criado_em: string;
}

export interface RegistroExercicio {
  id: string;
  usuario_id: string;
  data: string;
  tipo: string;
  duracao_min: number;
  calorias_estimadas: number | null;
  intensidade: "leve" | "moderada" | "intensa";
  observacoes: string | null;
  criado_em: string;
}

export interface Meta {
  id: string;
  usuario_id: string;
  tipo: "peso" | "medida" | "agua" | "habito" | "personalizada";
  titulo: string;
  valor_alvo: number | null;
  valor_atual: number | null;
  unidade: string | null;
  prazo: string | null;
  concluida: boolean;
  criado_em: string;
}

export interface Assinatura {
  id: string;
  usuario_id: string;
  plano: PlanoAssinatura;
  status: StatusAssinatura;
  provedor: ProvedorPagamento | null;
  id_externo: string | null;
  inicio_em: string;
  renovacao_em: string | null;
  trial_termina_em: string | null;
  cancelada_em: string | null;
  criado_em: string;
}

export interface ItemListaCompras {
  nome: string;
  quantidade: number;
  unidade: string;
  categoria: string;
  marcado: boolean;
}
