"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { toast } from "@/components/ui/Toast";
import { gerarResultadoAvaliacao } from "@/lib/nutrition/calculations";
import type { Genero, NivelAtividade, ObjetivoNutricional } from "@/types/domain";

interface RespostasConsulta {
  peso_kg: string;
  altura_cm: string;
  idade: string;
  genero: Genero;
  nivel_atividade: NivelAtividade;
  objetivo: ObjetivoNutricional;
  peso_meta_kg: string;
  restricoes_alimentares: string;
  alergias: string;
  condicoes_saude: string;
  refeicoes_por_dia: string;
  preferencias_alimentares: string;
  alimentos_evitados: string;
  qualidade_sono: string;
  nivel_estresse: string;
  observacoes: string;
}

const INICIAL: RespostasConsulta = {
  peso_kg: "",
  altura_cm: "",
  idade: "",
  genero: "feminino",
  nivel_atividade: "leve",
  objetivo: "emagrecimento",
  peso_meta_kg: "",
  restricoes_alimentares: "",
  alergias: "",
  condicoes_saude: "",
  refeicoes_por_dia: "4",
  preferencias_alimentares: "",
  alimentos_evitados: "",
  qualidade_sono: "3",
  nivel_estresse: "3",
  observacoes: "",
};

const TOTAL_ETAPAS = 5;

function paraLista(texto: string): string[] {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ConsultaWizard() {
  const router = useRouter();
  const [etapa, setEtapa] = useState(1);
  const [respostas, setRespostas] = useState<RespostasConsulta>(INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<null | { observacoes: string }>(null);

  function atualizar<K extends keyof RespostasConsulta>(campo: K, valor: RespostasConsulta[K]) {
    setRespostas((prev) => ({ ...prev, [campo]: valor }));
  }

  const podeVerPreview =
    Number(respostas.peso_kg) > 0 && Number(respostas.altura_cm) > 0 && Number(respostas.idade) > 0;

  const preview = useMemo(() => {
    if (!podeVerPreview) return null;
    try {
      return gerarResultadoAvaliacao({
        pesoKg: Number(respostas.peso_kg),
        alturaCm: Number(respostas.altura_cm),
        idade: Number(respostas.idade),
        genero: respostas.genero,
        nivelAtividade: respostas.nivel_atividade,
        objetivo: respostas.objetivo,
      });
    } catch {
      return null;
    }
  }, [respostas, podeVerPreview]);

  function validarEtapaAtual(): string | null {
    if (etapa === 1) {
      if (!respostas.peso_kg || !respostas.altura_cm || !respostas.idade) {
        return "Preencha peso, altura e idade para continuar.";
      }
    }
    return null;
  }

  function avancar() {
    const erro = validarEtapaAtual();
    if (erro) {
      toast.erro(erro);
      return;
    }
    setEtapa((e) => Math.min(TOTAL_ETAPAS, e + 1));
  }

  function voltar() {
    setEtapa((e) => Math.max(1, e - 1));
  }

  async function finalizarConsulta() {
    setEnviando(true);
    try {
      const resposta = await fetch("/api/gerar-plano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peso_kg: Number(respostas.peso_kg),
          altura_cm: Number(respostas.altura_cm),
          idade: Number(respostas.idade),
          genero: respostas.genero,
          nivel_atividade: respostas.nivel_atividade,
          objetivo: respostas.objetivo,
          peso_meta_kg: respostas.peso_meta_kg ? Number(respostas.peso_meta_kg) : null,
          restricoes_alimentares: paraLista(respostas.restricoes_alimentares),
          alergias: paraLista(respostas.alergias),
          condicoes_saude: paraLista(respostas.condicoes_saude),
          refeicoes_por_dia: Number(respostas.refeicoes_por_dia),
          preferencias_alimentares: paraLista(respostas.preferencias_alimentares),
          alimentos_evitados: paraLista(respostas.alimentos_evitados),
          qualidade_sono: Number(respostas.qualidade_sono),
          nivel_estresse: Number(respostas.nivel_estresse),
          observacoes: respostas.observacoes || null,
        }),
      });

      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao gerar o plano.");

      setResultadoFinal({ observacoes: dados.observacoesNutricionista });
      toast.sucesso("Seu plano alimentar foi gerado com sucesso!");
    } catch (erro) {
      toast.erro(erro instanceof Error ? erro.message : "Erro inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  if (resultadoFinal) {
    return (
      <Card className="mx-auto max-w-xl animate-fade-in-up">
        <CardContent className="text-center py-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <Stethoscope className="h-6 w-6 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Consulta concluída!</h2>
          {preview && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              <Metrica label="IMC" valor={preview.imc.toString()} sub={preview.classificacaoImc} />
              <Metrica label="TMB" valor={`${preview.tmb} kcal`} />
              <Metrica label="TDEE" valor={`${preview.tdee} kcal`} />
              <Metrica label="Meta calórica" valor={`${preview.metaCalorica} kcal`} />
            </div>
          )}
          <p className="mt-5 text-sm text-muted">{resultadoFinal.observacoes}</p>
          <Button className="mt-6" onClick={() => router.push("/plano")}>
            Ver meu plano alimentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-2">
        {Array.from({ length: TOTAL_ETAPAS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < etapa ? "bg-brand-500" : "bg-black/10"}`}
          />
        ))}
      </div>

      <Card>
        <CardContent className="py-8">
          {etapa === 1 && (
            <Etapa titulo="Dados básicos" descricao="Precisamos disso para calcular seu IMC, TMB e TDEE.">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="peso">Peso atual (kg)</Label>
                  <Input id="peso" type="number" min={1} step="0.1" value={respostas.peso_kg} onChange={(e) => atualizar("peso_kg", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="altura">Altura (cm)</Label>
                  <Input id="altura" type="number" min={1} value={respostas.altura_cm} onChange={(e) => atualizar("altura_cm", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="idade">Idade</Label>
                  <Input id="idade" type="number" min={10} max={120} value={respostas.idade} onChange={(e) => atualizar("idade", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="genero">Gênero</Label>
                  <Select id="genero" value={respostas.genero} onChange={(e) => atualizar("genero", e.target.value as Genero)}>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                    <option value="outro">Outro</option>
                  </Select>
                </div>
              </div>
              {preview && (
                <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
                  Prévia: IMC {preview.imc} ({preview.classificacaoImc})
                </p>
              )}
            </Etapa>
          )}

          {etapa === 2 && (
            <Etapa titulo="Rotina e objetivo" descricao="Isso define seu gasto calórico e a meta do plano.">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="atividade">Nível de atividade física</Label>
                  <Select id="atividade" value={respostas.nivel_atividade} onChange={(e) => atualizar("nivel_atividade", e.target.value as NivelAtividade)}>
                    <option value="sedentario">Sedentário (pouco ou nenhum exercício)</option>
                    <option value="leve">Leve (exercício 1-3x/semana)</option>
                    <option value="moderado">Moderado (exercício 3-5x/semana)</option>
                    <option value="intenso">Intenso (exercício 6-7x/semana)</option>
                    <option value="atleta">Atleta (muito intenso)</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="objetivo">Objetivo principal</Label>
                  <Select id="objetivo" value={respostas.objetivo} onChange={(e) => atualizar("objetivo", e.target.value as ObjetivoNutricional)}>
                    <option value="emagrecimento">Emagrecimento</option>
                    <option value="manutencao">Manutenção do peso</option>
                    <option value="ganho_massa">Ganho de massa muscular</option>
                    <option value="saude_geral">Saúde geral</option>
                    <option value="performance_esportiva">Performance esportiva</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="peso-meta">Peso desejado (kg) — opcional</Label>
                  <Input id="peso-meta" type="number" min={1} step="0.1" value={respostas.peso_meta_kg} onChange={(e) => atualizar("peso_meta_kg", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="refeicoes">Quantas refeições por dia você prefere?</Label>
                  <Select id="refeicoes" value={respostas.refeicoes_por_dia} onChange={(e) => atualizar("refeicoes_por_dia", e.target.value)}>
                    <option value="3">3 refeições</option>
                    <option value="4">4 refeições</option>
                    <option value="5">5 refeições</option>
                    <option value="6">6 refeições</option>
                  </Select>
                </div>
              </div>
            </Etapa>
          )}

          {etapa === 3 && (
            <Etapa titulo="Restrições e preferências" descricao="Para nunca sugerir algo que você não pode ou não gosta de comer.">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="restricoes">Restrições alimentares (separadas por vírgula)</Label>
                  <Input id="restricoes" placeholder="Vegetariano, sem lactose..." value={respostas.restricoes_alimentares} onChange={(e) => atualizar("restricoes_alimentares", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="alergias">Alergias alimentares</Label>
                  <Input id="alergias" placeholder="Amendoim, frutos do mar..." value={respostas.alergias} onChange={(e) => atualizar("alergias", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="evitados">Alimentos que você não gosta</Label>
                  <Input id="evitados" placeholder="Berinjela, fígado..." value={respostas.alimentos_evitados} onChange={(e) => atualizar("alimentos_evitados", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="preferencias">Alimentos que você adora</Label>
                  <Input id="preferencias" placeholder="Frango, batata-doce..." value={respostas.preferencias_alimentares} onChange={(e) => atualizar("preferencias_alimentares", e.target.value)} />
                </div>
              </div>
            </Etapa>
          )}

          {etapa === 4 && (
            <Etapa titulo="Saúde e bem-estar" descricao="Sono e estresse afetam diretamente seus resultados.">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="condicoes">Condições de saúde relevantes</Label>
                  <Input id="condicoes" placeholder="Diabetes, hipertensão..." value={respostas.condicoes_saude} onChange={(e) => atualizar("condicoes_saude", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="sono">Qualidade do sono (1 = ruim, 5 = ótima)</Label>
                  <Select id="sono" value={respostas.qualidade_sono} onChange={(e) => atualizar("qualidade_sono", e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="estresse">Nível de estresse (1 = baixo, 5 = alto)</Label>
                  <Select id="estresse" value={respostas.nivel_estresse} onChange={(e) => atualizar("nivel_estresse", e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </Etapa>
          )}

          {etapa === 5 && (
            <Etapa titulo="Últimos detalhes" descricao="Algo mais que sua nutricionista virtual deveria saber?">
              <Textarea
                placeholder="Ex: trabalho por turnos, viajo bastante a trabalho, cozinho pouco durante a semana..."
                value={respostas.observacoes}
                onChange={(e) => atualizar("observacoes", e.target.value)}
              />
              {preview && (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metrica label="IMC" valor={preview.imc.toString()} sub={preview.classificacaoImc} />
                  <Metrica label="TDEE" valor={`${preview.tdee} kcal`} />
                  <Metrica label="Meta calórica" valor={`${preview.metaCalorica} kcal`} />
                  <Metrica label="Água/dia" valor={`${(preview.aguaMl / 1000).toFixed(1)} L`} />
                </div>
              )}
            </Etapa>
          )}
        </CardContent>
      </Card>

      <div className="mt-5 flex items-center justify-between">
        <Button variante="secundaria" onClick={voltar} disabled={etapa === 1}>
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        {etapa < TOTAL_ETAPAS ? (
          <Button onClick={avancar}>
            Continuar <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={finalizarConsulta} carregando={enviando}>
            {enviando ? "Gerando seu plano..." : "Concluir consulta e gerar plano"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Etapa({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in-up">
      <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
      <p className="mt-1 text-sm text-muted">{descricao}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Metrica({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-black/[0.02] px-3 py-2.5 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
