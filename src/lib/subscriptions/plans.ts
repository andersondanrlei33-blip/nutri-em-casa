import type { PlanoAssinatura } from "@/types/domain";

export interface FuncionalidadesPlano {
  consultaIA: boolean;
  planosAlimentaresIlimitados: boolean;
  bibliotecaReceitasCompleta: boolean;
  listaComprasAutomatica: boolean;
  acompanhamentoAvancado: boolean; // medidas, sono, humor, exercícios
  exportarRelatorios: boolean;
  limiteReceitasSalvas: number | null; // null = ilimitado
  limitePlanosAtivos: number | null;
}

export interface DefinicaoPlano {
  id: PlanoAssinatura;
  nome: string;
  precoMensalCentavos: number;
  precoAnualCentavos: number | null;
  descricao: string;
  funcionalidades: FuncionalidadesPlano;
}

export const PLANOS: Record<PlanoAssinatura, DefinicaoPlano> = {
  gratuito: {
    id: "gratuito",
    nome: "Gratuito",
    precoMensalCentavos: 0,
    precoAnualCentavos: null,
    descricao: "Consulta nutricional inicial e acompanhamento básico.",
    funcionalidades: {
      consultaIA: true,
      planosAlimentaresIlimitados: false,
      bibliotecaReceitasCompleta: false,
      listaComprasAutomatica: false,
      acompanhamentoAvancado: false,
      exportarRelatorios: false,
      limiteReceitasSalvas: 10,
      limitePlanosAtivos: 1,
    },
  },
  trial: {
    id: "trial",
    nome: "Trial Premium (7 dias)",
    precoMensalCentavos: 0,
    precoAnualCentavos: null,
    descricao: "Acesso completo por 7 dias para experimentar o Premium.",
    funcionalidades: {
      consultaIA: true,
      planosAlimentaresIlimitados: true,
      bibliotecaReceitasCompleta: true,
      listaComprasAutomatica: true,
      acompanhamentoAvancado: true,
      exportarRelatorios: true,
      limiteReceitasSalvas: null,
      limitePlanosAtivos: null,
    },
  },
  premium: {
    id: "premium",
    nome: "Premium",
    precoMensalCentavos: 4797,
    precoAnualCentavos: null,
    descricao: "Tudo do Nutri em Casa, sem limites, cobrado mensalmente.",
    funcionalidades: {
      consultaIA: true,
      planosAlimentaresIlimitados: true,
      bibliotecaReceitasCompleta: true,
      listaComprasAutomatica: true,
      acompanhamentoAvancado: true,
      exportarRelatorios: true,
      limiteReceitasSalvas: null,
      limitePlanosAtivos: null,
    },
  },
  anual: {
    id: "anual",
    nome: "Premium Anual",
    precoMensalCentavos: 1990,
    precoAnualCentavos: 23880,
    descricao: "Tudo do Premium com 33% de desconto pagando anualmente.",
    funcionalidades: {
      consultaIA: true,
      planosAlimentaresIlimitados: true,
      bibliotecaReceitasCompleta: true,
      listaComprasAutomatica: true,
      acompanhamentoAvancado: true,
      exportarRelatorios: true,
      limiteReceitasSalvas: null,
      limitePlanosAtivos: null,
    },
  },
};

export function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
