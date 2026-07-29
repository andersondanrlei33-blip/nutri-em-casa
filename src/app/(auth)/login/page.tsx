"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient, comTimeout } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    try {
      const { error } = await comTimeout(supabase.auth.signInWithPassword({ email, password: senha }));
      setCarregando(false);
      if (error) {
        setErro(traduzirErro(error.message));
        return;
      }

      toast.sucesso("Login realizado com sucesso!");
      router.push(searchParams.get("redirect") || "/dashboard");
    } catch (erro) {
      setCarregando(false);
      setErro(erro instanceof Error ? erro.message : "Não foi possível entrar. Tente novamente.");
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
        <h1 className="text-center text-xl font-semibold text-foreground">Bem-vindo de volta</h1>
        <p className="mt-1 text-center text-sm text-muted">Entre para continuar seu acompanhamento.</p>

        <form onSubmit={aoEnviar} className="mt-6 space-y-4">
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
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <FieldError>{erro}</FieldError>
          <Button type="submit" className="w-full" carregando={carregando}>
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-brand-600 hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
}

function traduzirErro(mensagem: string): string {
  if (mensagem.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (mensagem.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  return "Não foi possível entrar. Tente novamente.";
}
