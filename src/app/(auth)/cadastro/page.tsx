"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient, comTimeout } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";

/** Idade mínima calculada a partir da data de nascimento — validação técnica
 *  além da declaração em texto, pra não depender só da pessoa marcar a
 *  caixinha corretamente. */
function calcularIdade(dataNascimentoISO: string): number {
  const nascimento = new Date(dataNascimentoISO);
  const hoje = new Date();
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aindaNaoFezAniversarioEsseAno =
    hoje.getMonth() < nascimento.getMonth() ||
    (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate());
  if (aindaNaoFezAniversarioEsseAno) idade--;
  return idade;
}

export default function CadastroPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [genero, setGenero] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [maiorDeIdade, setMaiorDeIdade] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) {
      setErro("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (!genero) {
      setErro("Selecione seu gênero.");
      return;
    }
    if (!dataNascimento) {
      setErro("Informe sua data de nascimento.");
      return;
    }
    // Validação técnica além da caixinha de declaração — usamos a data de
    // nascimento pra calcular a idade de verdade, em vez de confiar só na
    // pessoa ter marcado certo.
    if (calcularIdade(dataNascimento) < 18) {
      setErro("O Nutri em Casa é destinado a maiores de 18 anos.");
      return;
    }
    if (!maiorDeIdade) {
      setErro("O Nutri em Casa é destinado a maiores de 18 anos. Confirme para continuar.");
      return;
    }
    setCarregando(true);
    const supabase = createClient();
    try {
      const { error } = await comTimeout(
        supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: { nome, genero, data_nascimento: dataNascimento },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/consulta`,
          },
        })
      );
      setCarregando(false);
      if (error) {
        setErro(traduzirErro(error.message));
        return;
      }
      toast.sucesso("Conta criada! Vamos começar sua consulta nutricional.");
      router.push("/consulta");
    } catch (erro) {
      setCarregando(false);
      setErro(erro instanceof Error ? erro.message : "Não foi possível criar a conta. Tente novamente.");
    }
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">
            N
          </div>
          <span className="font-semibold text-foreground">Nutri em Casa</span>
        </Link>
        <h1 className="text-center text-xl font-semibold text-foreground">Crie sua conta grátis</h1>
        <p className="mt-1 text-center text-sm text-muted">7 dias de trial Premium inclusos.</p>
        <form onSubmit={aoEnviar} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="new-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <Label htmlFor="data-nascimento">Data de nascimento</Label>
            <Input
              id="data-nascimento"
              type="date"
              required
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="genero">Gênero</Label>
            <select
              id="genero"
              required
              value={genero}
              onChange={(e) => setGenero(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="" disabled>
                Selecione...
              </option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          {/* Perguntamos gênero e data de nascimento aqui, uma única vez, pra
           *  não precisar mais perguntar de novo em toda consulta nutricional
           *  — ConsultaWizard.tsx passa a buscar esses dados do perfil. */}
          <label htmlFor="maior-idade" className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
            <input
              id="maior-idade"
              type="checkbox"
              checked={maiorDeIdade}
              onChange={(e) => setMaiorDeIdade(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand-500 focus:ring-2 focus:ring-brand-400"
            />
            Declaro que tenho 18 anos ou mais. O Nutri em Casa é destinado a adultos.
          </label>
          <FieldError>{erro}</FieldError>
          <Button type="submit" className="w-full" carregando={carregando}>
            Criar conta
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
function traduzirErro(mensagem: string): string {
  if (mensagem.includes("already registered")) return "Este e-mail já está cadastrado.";
  return "Não foi possível criar a conta. Tente novamente.";
}
