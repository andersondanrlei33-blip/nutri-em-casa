"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";

export default function PerfilPage() {
  const { user, perfil } = useUser();
  const supabase = createClient();

  const [nome, setNome] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [genero, setGenero] = useState("feminino");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (perfil) {
      setNome(perfil.nome ?? "");
      setDataNascimento(perfil.data_nascimento ?? "");
      setGenero(perfil.genero ?? "feminino");
    }
  }, [perfil]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSalvando(true);
    const { error } = await supabase
      .from("perfis")
      .update({ nome, data_nascimento: dataNascimento || null, genero })
      .eq("id", user.id);
    setSalvando(false);
    if (error) return toast.erro("Erro ao salvar perfil.");
    toast.sucesso("Perfil atualizado.");
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
        <p className="mt-1 text-sm text-muted">Suas informações pessoais.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={salvar} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" value={user?.email ?? ""} disabled />
            </div>
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="nascimento">Data de nascimento</Label>
              <Input id="nascimento" type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="genero">Gênero</Label>
              <Select id="genero" value={genero} onChange={(e) => setGenero(e.target.value)}>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
              </Select>
            </div>
            <Button type="submit" carregando={salvando}>
              Salvar alterações
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
