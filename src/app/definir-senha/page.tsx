"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function DefinirSenhaPage() {
  const router = useRouter();
  // IMPORTANTE: precisa ser UM SÓ cliente pra vida inteira do componente,
  // criado com useState(() => ...) (inicializador preguiçoso), senão cada
  // re-render (a cada tecla digitada) cria uma instância nova e reinicia
  // a leitura do token que vem no fragmento da URL (#access_token=...).
  const [supabase] = useState(() => createClient());

  // null = checando se o link já criou sessão; false = precisa do código;
  // true = sessão ok, mostra o formulário de senha.
  const [temSessao, setTemSessao] = useState<boolean | null>(null);

  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [verificandoCodigo, setVerificandoCodigo] = useState(false);

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // O link do e-mail às vezes é "pré-visitado" por um scanner de
    // segurança do provedor de e-mail antes da pessoa clicar de verdade,
    // o que consome o token (só serve uma vez). Por isso existe o plano B
    // abaixo: pedir o código de verificação que também vai no e-mail.
    async function checar() {
      const hash = window.location.hash;
      if (hash.includes("access_token")) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const { data } = await supabase.auth.getSession();
      setTemSessao(!!data.session);
    }
    checar();
  }, [supabase]);

  async function confirmarCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!email.trim() || codigo.trim().length < 6) {
      setErro("Preenche o e-mail e o código de 6 dígitos que chegou na mensagem.");
      return;
    }

    setVerificandoCodigo(true);
    let resultado = await supabase.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: "recovery" });
    if (resultado.error) {
      resultado = await supabase.auth.verifyOtp({ email: email.trim(), token: codigo.trim(), type: "invite" });
    }
    setVerificandoCodigo(false);

    if (resultado.error) {
      setErro(`Código não confere ou já expirou (${resultado.error.message}). Confere se digitou certo ou peça um e-mail novo.`);
      return;
    }
    setTemSessao(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas não são iguais.");
      return;
    }

    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);

    if (error) {
      setErro(`Não deu pra salvar a senha (${error.message}). Tente de novo.`);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-background px-6">
      <div className="mx-auto w-full max-w-sm">
        {temSessao !== false && (
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-foreground">Escolha sua senha</h1>
            <p className="mt-1 text-sm text-muted">
              Só falta isso — depois é só usar seu e-mail e essa senha pra entrar sempre que quiser acessar o Nutri em Casa.
            </p>
          </div>
        )}

        {temSessao === null && <p className="text-center text-sm text-muted">Verificando o link...</p>}

        {erro && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{erro}</p>}

        {temSessao === false && (
          <>
            <h1 className="mb-1 text-center text-xl font-bold text-foreground">Confirme o código</h1>
            <p className="mb-5 text-center text-sm text-muted">
              O link direto não funcionou dessa vez. Sem problema: digita seu e-mail e o código de verificação que também
              veio na mensagem.
            </p>
            <form onSubmit={confirmarCodigo} className="flex flex-col gap-3">
              <Input type="email" placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Código de verificação"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
              />
              <Button type="submit" tamanho="lg" carregando={verificandoCodigo}>
                Confirmar código
              </Button>
            </form>
          </>
        )}

        {temSessao === true && (
          <form onSubmit={salvar} className="flex flex-col gap-3">
            <Input type="password" placeholder="Nova senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
            <Input
              type="password"
              placeholder="Confirme a senha"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
            />
            <Button type="submit" tamanho="lg" carregando={carregando}>
              Salvar e entrar
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
