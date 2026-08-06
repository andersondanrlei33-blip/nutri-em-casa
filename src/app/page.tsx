import Link from "next/link";
import {
  Stethoscope,
  CalendarDays,
  BookOpen,
  LineChart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const RECURSOS = [
  {
    icone: Stethoscope,
    titulo: "Consulta nutricional com IA",
    descricao:
      "Uma avaliação completa antes de qualquer dieta: peso, altura, objetivo, restrições e rotina — como numa consulta de verdade.",
  },
  {
    icone: CalendarDays,
    titulo: "Plano alimentar 100% editável",
    descricao: "Troque refeições, horários e porções quando quiser. Nenhum campo fica travado.",
  },
  {
    icone: BookOpen,
    titulo: "Biblioteca de receitas saudáveis",
    descricao: "Receitas completas com macros calculados, editáveis, favoritáveis e pesquisáveis.",
  },
  {
    icone: LineChart,
    titulo: "Acompanhamento completo",
    descricao: "Peso, medidas, água, sono, humor e exercícios em um único painel.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex-1 bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">
            N
          </div>
          <span className="font-semibold text-foreground">Nutri em Casa</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-muted hover:text-foreground">
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Começar grátis
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-24">
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
          <Sparkles className="h-3.5 w-3.5" /> Sua nutricionista virtual, 24 horas por dia
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Um plano alimentar que entende <span className="text-brand-600">você</span>, não uma
          dieta genérica.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          O Nutri em Casa faz uma consulta nutricional completa com IA antes de montar qualquer
          plano — calculando seu IMC, TMB, TDEE e macros ideais — e te acompanha todos os dias.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/cadastro"
            className="w-full rounded-xl bg-brand-500 px-6 py-3 text-center font-medium text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600 sm:w-auto"
          >
            Iniciar minha consulta grátis
          </Link>
          <Link
            href="#planos"
            className="w-full rounded-xl border border-border bg-white px-6 py-3 text-center font-medium text-foreground hover:bg-black/[0.02] sm:w-auto"
          >
            Ver planos
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {RECURSOS.map(({ icone: Icone, titulo, descricao }) => (
            <div key={titulo} className="rounded-2xl border border-border bg-white p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
                <Icone className="h-5 w-5 text-brand-600" />
              </div>
              <h3 className="font-semibold text-foreground">{titulo}</h3>
              <p className="mt-1.5 text-sm text-muted">{descricao}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-foreground">Comece grátis, sem cartão</h2>
        <p className="mx-auto mt-2 max-w-lg text-muted">
          Faça sua consulta nutricional com IA gratuitamente. Depois, se quiser desbloquear planos
          ilimitados e a biblioteca completa de receitas, é só assinar o Premium dentro do app.
        </p>
        <Link
          href="/cadastro"
          className="mt-6 inline-block rounded-xl bg-brand-500 px-6 py-3 text-center font-medium text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600"
        >
          Começar agora, é grátis
        </Link>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6">
          <ShieldCheck className="h-4 w-4" />
          Seus dados de saúde são protegidos com Row Level Security de ponta a ponta.
        </div>
        <p className="mt-2">© {new Date().getFullYear()} Nutri em Casa. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

