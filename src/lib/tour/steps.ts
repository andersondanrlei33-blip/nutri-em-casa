export interface PassoTour {
  /** Corresponde ao atributo data-tour do elemento alvo. `null` = passo
   *  de boas-vindas/despedida, sem alvo, centralizado na tela. */
  alvo: string | null;
  titulo: string;
  descricao: string;
}

export const PASSOS_TOUR: PassoTour[] = [
  {
    alvo: null,
    titulo: "Bem-vindo ao Nutri em Casa 👋",
    descricao:
      "Vamos fazer um tour rápido pelas principais telas do app. Leva menos de 1 minuto — você pode pular a qualquer momento.",
  },
  {
    alvo: "nav-dashboard",
    titulo: "Dashboard",
    descricao:
      "Seu resumo do dia: peso atual, IMC, água e meta calórica, além da distribuição de macros. Mais abaixo você acompanha sua adesão ao plano na semana, as refeições de hoje, suas conquistas e a evolução do peso.",
  },
  {
    alvo: "link-perfil",
    titulo: "Meu Perfil",
    descricao:
      "Aqui ficam seus dados pessoais — nome, gênero e data de nascimento. Vale completar essas informações antes da primeira consulta: são elas que definem sua idade e personalizam o plano com segurança.",
  },
  {
    alvo: "nav-consulta",
    titulo: "Consulta Nutricional",
    descricao:
      "Onde tudo começa. Responda sobre seu peso, objetivo, restrições e rotina para gerar seu plano alimentar personalizado. Se for sua primeira consulta, complete seu perfil antes de iniciar.",
  },
  {
    alvo: "nav-plano",
    titulo: "Plano Alimentar",
    descricao:
      "Seu cardápio da semana, dia a dia — com refeições de pré e pós-treino posicionadas em torno do seu horário de treino, quando você pede isso na consulta. Edite, troque ou duplique qualquer refeição — nada fica travado.",
  },
  {
    alvo: "nav-receitas",
    titulo: "Receitas",
    descricao:
      "Biblioteca de receitas saudáveis com calorias e macros já calculados. Pesquise, filtre por categoria, favorite, edite ou crie as suas.",
  },
  {
    alvo: "nav-acompanhamento",
    titulo: "Acompanhamento",
    descricao:
      "Registre peso, medidas, água, sono, humor e exercícios — tudo em um só lugar, com abas para cada um.",
  },
  {
    alvo: "nav-evolucao",
    titulo: "Evolução",
    descricao:
      "Compare uma consulta com outra, veja peso e medidas evoluindo no gráfico e sua consistência nos últimos 30 dias — tudo que a gente revisa numa consulta de retorno.",
  },
  {
    alvo: "nav-historico",
    titulo: "Histórico",
    descricao: "A linha do tempo completa da sua jornada: consultas, pesagens, exercícios registrados.",
  },
  {
    alvo: "nav-assinatura",
    titulo: "Assinatura",
    descricao: "Veja seu plano atual e, quando quiser, libere os recursos ilimitados do Premium.",
  },
  {
    alvo: "nav-configuracoes",
    titulo: "Configurações",
    descricao:
      "Gerencie seus planos alimentares — veja qual está ativo e troque quando quiser —, sua segurança (como sair de todos os dispositivos) e outras opções da sua conta.",
  },
  {
    alvo: "botao-ajuda",
    titulo: "Precisa rever isso depois?",
    descricao: "É só clicar aqui no ícone de ajuda a qualquer momento para repetir este tour.",
  },
  {
    alvo: null,
    titulo: "Pronto! 🎉",
    descricao:
      "Agora é com você. Se ainda não fez, comece pela Consulta Nutricional para gerar seu primeiro plano personalizado.",
  },
];
