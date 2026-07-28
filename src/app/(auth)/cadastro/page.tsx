"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";

export default function CadastroPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });

    setCarregando(false);
    if (error) {
      setErro(traduzirErro(error.message));
      return;
    }

    toast.sucesso("Conta criada! Vamos começar sua consulta nutricional.");
    router.push("/consulta");
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
