"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Stethoscope, TrendingDown, TrendingUp, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { toast } from "@/components/ui/Toast";
import { gerarResultadoAvaliacao } from "@/lib/nutrition/calculations";
import { formatarData, diasDesde } from "@/lib/utils/date";
import type { AvaliacaoNutricional, CondicaoSaude, Genero, NivelAtividade, ObjetivoNutricional } from "@/types/domain";

const CONDICOES_SAUDE_OPCOES: { valor: CondicaoSaude; label: string }[] = [
  { valor: "diabetes_tipo1", label: "Diabetes tipo 1" },
  { valor: "diabetes_tipo2", label: "Diabetes tipo 2" },
  { valor: "hipertensao", label: "Hipertensão" },
  { valor: "doenca_renal", label: "Doença renal" },
  { valor: "hipotireoidismo", label: "Hipotireoidismo" },
  { valor: "hipertireoidismo", label: "Hipertireoidismo" },
  { valor: "colesterol_alto", label: "Colesterol alto" },
];

interface RespostasConsulta {
  peso_kg: string;
  altura_cm: string;
  idade: string;
  genero: Genero;
  nivel_atividade: NivelAtividade;
  objetivo: ObjetivoNutricional;
  peso_meta_kg: string;
  restricoes_alimentares: string;
  confirmou_sem_restricoes: boolean;
  alergias: string;
  confirmou_sem_alergias: boolean;
  condicoes_saude: CondicaoSaude[];
  confirmou_sem_condicoes: boolean;
  condicoes_saude_outras: string;
  medicamentos_em_uso: string;
  refeicoes_por_dia: string;
  preferencias_alimentares: string;
  alimentos_evitados: string;
  qualidade_sono: string;
  nivel_estresse: string;
  observacoes: string;
  gestante: boolean;
  lactante: boolean;
  historico_transtorno_alimentar: boolean;
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
  confirmou_sem_restricoes: false,
  alergias: "",
  confirmou_sem_alergias: false,
  condicoes_saude: [],
  confirmou_sem_condicoes: false,
  condicoes_saude_outras: "",
  medicamentos_em_uso: "",
  refeicoes_por_dia: "4",
  preferencias_alimentares: "",
  alimentos_evitados: "",
  qualidade_sono: "3",
  nivel_estresse: "3",
  observacoes: "",
  gestante: false,
  lactante: false,
  historico_transtorno_alimentar: false,
};

const TOTAL_ETAPAS = 5;

function paraLista(texto: string): string[] {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Numa consulta de retorno, pré-preenche o formulário com a última avaliação —
 *  o usuário só precisa atualizar o que mudou, não redigitar tudo do zero. */
function estadoInicialDe(anterior: AvaliacaoNutricional | null): RespostasConsulta {
  if (!anterior) return INICIAL;
  return {
    peso_kg: String(anterior.peso_kg),
    altura_cm: String(anterior.altura_cm),
    idade: String(anterior.idade),
    genero: anterior.genero,
    nivel_atividade: anterior.nivel_atividade,
    objetivo: anterior.objetivo,
    peso_meta_kg: anterior.peso_meta_kg != null ? String(anterior.peso_meta_kg) : "",
    restricoes_alimentares: anterior.restricoes_alimentares.join(", "),
    confirmou_sem_restricoes: false,
    alergias: anterior.alergias.join(", "),
    confirmou_sem_alergias: false,
    condicoes_saude: anterior.condicoes_saude,
    confirmou_sem_condicoes: false,
    condicoes_saude_outras: anterior.condicoes_saude_outras ?? "",
    medicamentos_em_uso: anterior.medicamentos_em_uso.join(", "),
    refeicoes_por_dia: String(anterior.refeicoes_por_dia),
    preferencias_alimentares: anterior.preferencias_alimentares.join(", "),
    alimentos_evitados: anterior.alimentos_evitados.join(", "),
    qualidade_sono: anterior.qualidade_sono != null ? String(anterior.qualidade_sono) : "3",
    nivel_estresse: anterior.nivel_estresse != null ? String(anterior.nivel_estresse) : "3",
    observacoes: "",
    // Sinalizadores de segurança não carregam automaticamente — a condição
    // pode ter mudado desde a última consulta, então pedimos de novo.
    gestante: false,
    lactante: false,
    historico_transtorno_alimentar: false,
  };
}

export function ConsultaWizard({ avaliacaoAnterior }: { avaliacaoAnterior: AvaliacaoNutricional | null }) {
  const router = useRouter();
  const retorno = Boolean(avaliacaoAnterior);
  const [etapa, setEtapa] = useState(1);
  const [respostas, setRespostas] = useState<RespostasConsulta>(() => estadoInicialDe(avaliacaoAnterior));
  const [enviando, setEnviando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState<null | { observacoes: string; avisos: string[] }>(null);

  function atualizar<K extends keyof RespostasConsulta>(campo: K, valor: RespostasConsulta[K]) {
    setRespostas((prev) => ({ ...prev, [campo]: valor }));
  }

  function alternarCondicaoSaude(condicao: CondicaoSaude) {
    setRespostas((prev) => ({
      ...prev,
      condicoes_saude: prev.condicoes_saude.includes(condicao)
        ? prev.condicoes_saude.filter((c) => c !== condicao)
        : [...prev.condicoes_saude, condicao],
      confirmou_sem_condicoes: false,
    }));
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
        gestante: respostas.gestante,
        lactante: respostas.lactante,
        historicoTranstornoAlimentar: respostas.historico_transtorno_alimentar,
        condicoesSaude: respostas.condicoes_saude,
        qualidadeSono: Number(respostas.qualidade_sono),
        nivelEstresse: Number(respostas.nivel_estresse),
      });
    } catch {
      return null;
    }
  }, [respostas, podeVerPreview]);

  const diffPeso = useMemo(() => {
    if (!avaliacaoAnterior || !Number(respostas.peso_kg)) return null;
    const diferenca = Number(respostas.peso_kg) - avaliacaoAnterior.peso_kg;
    return Math.round(diferenca * 10) / 10;
  }, [avaliacaoAnterior, respostas.peso_kg]);

  function validarEtapaAtual(): string | null {
    if (etapa === 1) {
      if (!respostas.peso_kg || !respostas.altura_cm || !respostas.idade) {
        return "Preencha peso, altura e idade para continuar.";
      }
    }
    if (etapa === 3) {
      if (!respostas.restricoes_alimentares.trim() && !respostas.confirmou_sem_restricoes) {
        return "Informe suas restrições alimentares ou confirme que não tem nenhuma.";
      }
      if (!respostas.alergias.trim() && !respostas.confirmou_sem_alergias) {
        return "Informe suas alergias ou confirme que não tem nenhuma.";
      }
    }
    if (etapa === 4) {
      if (respostas.condicoes_saude.length === 0 && !respostas.confirmou_sem_condicoes) {
        return "Selecione suas condições de saúde ou confirme que não tem nenhuma.";
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
          condicoes_saude: respostas.condicoes_saude,
          condicoes_saude_outras: respostas.condicoes_saude_outras || null,
          medicamentos_em_uso: paraLista(respostas.medicamentos_em_uso),
          refeicoes_por_dia: Number(respostas.refeicoes_por_dia),
          preferencias_alimentares: paraLista(respostas.preferencias_alimentares),
          alimentos_evitados: paraLista(respostas.alimentos_evitados),
          qualidade_sono: Number(respostas.qualidade_sono),
          nivel_estresse: Number(respostas.nivel_estresse),
          observacoes: respostas.observacoes || null,
          gestante: respostas.gestante,
          lactante: respostas.lactante,
          historico_transtorno_alimentar: respostas.historico_transtorno_alimentar,
        }),
      });

      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro ?? "Erro ao gerar o plano.");

      setResultadoFinal({ observacoes: dados.observacoesNutricionista, avisos: dados.avisos ?? [] });
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
          <h2 className="text-lg font-semibold text-foreground">
            {retorno ? "Consulta de retorno concluída!" : "Consulta concluída!"}
          </h2>
          {retorno && diffPeso !== null && diffPeso !== 0 && (
            <p
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                diffPeso < 0 ? "bg-success-500/10 text-success-500" : "bg-brand-50 text-brand-700"
              }`}
            >
              {diffPeso < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              {diffPeso < 0
                ? `Você perdeu ${Math.abs(diffPeso)} kg desde a última consulta`
                : `Você ganhou ${diffPeso} kg desde a última consulta`}
            </p>
          )}
          {preview && (
            <div className="mt-4 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              <Metrica label="IMC" valor={preview.imc.toString()} sub={preview.classificacaoImc} />
              <Metrica label="TMB" valor={`${preview.tmb} kcal`} />
              <Metrica label="TDEE" valor={`${preview.tdee} kcal`} />
              <Metrica label="Meta calórica" valor={`${preview.metaCalorica} kcal`} />
            </div>
          )}
          {resultadoFinal.avisos.length > 0 && (
            <div className="mt-4 space-y-2 text-left">
              {resultadoFinal.avisos.map((aviso, i) => (
                <p
                  key={i}
                  className="flex items-start gap-2 rounded-xl bg-warning-500/10 px-4 py-3 text-sm text-foreground"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" />
                  {aviso}
                </p>
              ))}
            </div>
          )}
          <p className="mt-5 text-sm text-muted">{resultadoFinal.observacoes}</p>
          {retorno && (
            <p className="mt-2 text-xs text-muted">
              Seu plano alimentar anterior foi substituído por um novo, ajustado a esses dados.
            </p>
          )}
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
            <Etapa
              titulo="Dados básicos"
              descricao={
                retorno
                  ? "Atualize seu peso e o que mais tiver mudado desde a última consulta."
                  : "Precisamos disso para calcular seu IMC, TMB e TDEE."
              }
            >
              {retorno && avaliacaoAnterior && (
                <p className="mb-4 rounded-xl bg-black/[0.03] px-4 py-3 text-sm text-muted">
                  Última consulta em <strong className="text-foreground">{formatarData(avaliacaoAnterior.criado_em)}</strong>{" "}
                  ({diasDesde(avaliacaoAnterior.criado_em)} dias atrás) — peso registrado na época:{" "}
                  <strong className="text-foreground">{avaliacaoAnterior.peso_kg} kg</strong>.
                </p>
              )}
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
              {diffPeso !== null && diffPeso !== 0 && (
                <p
                  className={`mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium ${
                    diffPeso < 0 ? "bg-success-500/10 text-success-500" : "bg-brand-50 text-brand-700"
                  }`}
                >
                  {diffPeso < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                  {diffPeso < 0 ? `${Math.abs(diffPeso)} kg a menos` : `${diffPeso} kg a mais`} desde a última consulta
                </p>
              )}
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
                  <Input
                    id="restricoes"
                    placeholder="Vegetariano, sem lactose..."
                    value={respostas.restricoes_alimentares}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setRespostas((prev) => ({
                        ...prev,
                        restricoes_alimentares: valor,
                        confirmou_sem_restricoes: valor.trim() ? false : prev.confirmou_sem_restricoes,
                      }));
                    }}
                  />
                  <div className="mt-2">
                    <CheckboxSeguranca
                      id="sem-restricoes"
                      rotulo="Não tenho nenhuma restrição alimentar"
                      marcado={respostas.confirmou_sem_restricoes}
                      aoAlterar={(v) =>
                        setRespostas((prev) => ({
                          ...prev,
                          confirmou_sem_restricoes: v,
                          restricoes_alimentares: v ? "" : prev.restricoes_alimentares,
                        }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="alergias">Alergias alimentares</Label>
                  <Input
                    id="alergias"
                    placeholder="Amendoim, frutos do mar..."
                    value={respostas.alergias}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setRespostas((prev) => ({
                        ...prev,
                        alergias: valor,
                        confirmou_sem_alergias: valor.trim() ? false : prev.confirmou_sem_alergias,
                      }));
                    }}
                  />
                  <div className="mt-2">
                    <CheckboxSeguranca
                      id="sem-alergias"
                      rotulo="Não tenho nenhuma alergia alimentar"
                      marcado={respostas.confirmou_sem_alergias}
                      aoAlterar={(v) =>
                        setRespostas((prev) => ({
                          ...prev,
                          confirmou_sem_alergias: v,
                          alergias: v ? "" : prev.alergias,
                        }))
                      }
                    />
                  </div>
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
                  <Label>Condições de saúde relevantes</Label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-white p-3 sm:grid-cols-3">
                    {CONDICOES_SAUDE_OPCOES.map((opcao) => (
                      <CheckboxSeguranca
                        key={opcao.valor}
                        id={`condicao-${opcao.valor}`}
                        rotulo={opcao.label}
                        marcado={respostas.condicoes_saude.includes(opcao.valor)}
                        aoAlterar={() => alternarCondicaoSaude(opcao.valor)}
                      />
                    ))}
                  </div>
                  <div className="mt-2">
                    <CheckboxSeguranca
                      id="sem-condicoes"
                      rotulo="Nenhuma condição de saúde relevante"
                      marcado={respostas.confirmou_sem_condicoes}
                      aoAlterar={(v) =>
                        setRespostas((prev) => ({
                          ...prev,
                          confirmou_sem_condicoes: v,
                          condicoes_saude: v ? [] : prev.condicoes_saude,
                        }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="condicoes-outras">Outra condição não listada (opcional)</Label>
                  <Input
                    id="condicoes-outras"
                    placeholder="Ex: gastrite, endometriose..."
                    value={respostas.condicoes_saude_outras}
                    onChange={(e) => atualizar("condicoes_saude_outras", e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted">Fica registrado no seu histórico, mas não ajusta o cálculo automaticamente.</p>
                </div>
                <div>
                  <Label htmlFor="medicamentos">Medicamentos em uso (opcional)</Label>
                  <Input
                    id="medicamentos"
                    placeholder="Ex: metformina, losartana..."
                    value={respostas.medicamentos_em_uso}
                    onChange={(e) => atualizar("medicamentos_em_uso", e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted">Também fica só registrado — alguns medicamentos afetam peso/apetite, e isso ajuda numa eventual avaliação profissional.</p>
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
                <div className="rounded-xl border border-border bg-black/[0.02] p-4">
                  <p className="mb-3 text-sm font-medium text-foreground">
                    Alguma dessas situações se aplica a você agora?
                  </p>
                  <div className="space-y-2.5">
                    <CheckboxSeguranca
                      id="gestante"
                      rotulo="Estou grávida"
                      marcado={respostas.gestante}
                      aoAlterar={(v) => atualizar("gestante", v)}
                    />
                    <CheckboxSeguranca
                      id="lactante"
                      rotulo="Estou amamentando"
                      marcado={respostas.lactante}
                      aoAlterar={(v) => atualizar("lactante", v)}
                    />
                    <CheckboxSeguranca
                      id="historico-ta"
                      rotulo="Tenho ou já tive transtorno alimentar"
                      marcado={respostas.historico_transtorno_alimentar}
                      aoAlterar={(v) => atualizar("historico_transtorno_alimentar", v)}
                    />
                  </div>
                  {(respostas.gestante || respostas.lactante || respostas.historico_transtorno_alimentar) && (
                    <p className="mt-3 flex items-start gap-2 text-xs text-muted">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-500" />
                      Por segurança, seu plano será calculado sem déficit ou superávit calórico (apenas manutenção),
                      e recomendamos fortemente acompanhamento com um nutricionista licenciado nesta fase.
                    </p>
                  )}
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
              {preview && preview.avisos.length > 0 && (
                <div className="mt-4 space-y-2">
                  {preview.avisos.map((aviso, i) => (
                    <p
                      key={i}
                      className="flex items-start gap-2 rounded-xl bg-warning-500/10 px-4 py-3 text-sm text-foreground"
                    >
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" />
                      {aviso}
                    </p>
                  ))}
                </div>
              )}
            </Etapa>
          )}
        </CardContent>
      </Card>

      {etapa === TOTAL_ETAPAS && retorno && (
        <p className="mt-4 text-center text-xs text-muted">
          Ao concluir, seu plano alimentar atual será substituído por um novo, ajustado a esses dados.
        </p>
      )}

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
            {enviando
              ? retorno
                ? "Atualizando seu plano..."
                : "Gerando seu plano..."
              : retorno
                ? "Concluir e atualizar meu plano"
                : "Concluir consulta e gerar plano"}
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

function CheckboxSeguranca({
  id,
  rotulo,
  marcado,
  aoAlterar,
}: {
  id: string;
  rotulo: string;
  marcado: boolean;
  aoAlterar: (valor: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        onChange={(e) => aoAlterar(e.target.checked)}
        className="h-4 w-4 rounded border-border text-brand-500 focus:ring-2 focus:ring-brand-400"
      />
      {rotulo}
    </label>
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
