/**
 * Smoke tests do filtro/matching de receitas. Executar com:
 *   node --experimental-strip-types src/lib/nutrition/receitaMatching.test.ts
 */
import assert from "node:assert/strict";
import {
  construirFiltro,
  filtrarReceitasCompativeis,
  receitaEhSegura,
  normalizar,
} from "./receitaMatching.ts";
import type { AvaliacaoNutricional, Receita } from "../../types/domain.ts";

let passed = 0;
function test(nome: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${nome}`);
}

function avaliacaoBase(overrides: Partial<AvaliacaoNutricional> = {}): AvaliacaoNutricional {
  return {
    id: "1",
    usuario_id: "u1",
    peso_kg: 70,
    altura_cm: 170,
    idade: 30,
    genero: "feminino",
    nivel_atividade: "leve",
    objetivo: "manutencao",
    peso_meta_kg: null,
    restricoes_alimentares: [],
    alergias: [],
    condicoes_saude: [],
    condicoes_saude_outras: null,
    medicamentos_em_uso: [],
    consumo_alcool: "nunca",
    tabagismo: "nunca",
    refeicoes_por_dia: 3,
    preferencias_alimentares: [],
    alimentos_evitados: [],
    qualidade_sono: null,
    nivel_estresse: null,
    observacoes: null,
    gestante: false,
    lactante: false,
    historico_transtorno_alimentar: false,
    ajuste_seguranca: null,
    imc: 24,
    classificacao_imc: "Peso normal",
    tmb: 1400,
    tdee: 1900,
    meta_calorica: 1900,
    meta_proteina_g: 100,
    meta_carboidrato_g: 200,
    meta_gordura_g: 60,
    meta_fibra_g: 25,
    meta_agua_ml: 2500,
    criado_em: new Date().toISOString(),
    ...overrides,
  };
}

function receitaBase(overrides: Partial<Receita> = {}): Receita {
  return {
    id: overrides.id ?? "r1",
    usuario_id: null,
    nome: "Receita teste",
    descricao: null,
    categoria: "almoco",
    ingredientes: [],
    modo_preparo: [],
    tempo_preparo_min: 20,
    porcoes: 1,
    calorias: 400,
    proteina_g: 30,
    carboidrato_g: 40,
    gordura_g: 10,
    fibra_g: 5,
    imagem_url: null,
    favorito: false,
    alergenos: [],
    dietas_atendidas: [],
    indicacoes_saude: [],
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    ...overrides,
  };
}

test("construirFiltro deriva indicacoesPreferidas das condições de saúde estruturadas", () => {
  const filtro = construirFiltro(avaliacaoBase({ condicoes_saude: ["hipertensao", "colesterol_alto"] }));
  assert.ok(filtro.indicacoesPreferidas.has("baixo_sodio"));
  assert.ok(filtro.indicacoesPreferidas.has("baixo_colesterol"));
  assert.equal(filtro.indicacoesPreferidas.size, 2);
});

test("construirFiltro não gera indicação pra condições sem tag associada (hipotireoidismo)", () => {
  const filtro = construirFiltro(avaliacaoBase({ condicoes_saude: ["hipotireoidismo"] }));
  assert.equal(filtro.indicacoesPreferidas.size, 0);
});

test("filtrarReceitasCompativeis prioriza receita com a indicação quando existe candidata", () => {
  const semTag = receitaBase({ id: "sem-tag" });
  const comTag = receitaBase({ id: "com-tag", indicacoes_saude: ["baixo_sodio"] });
  const filtro = construirFiltro(avaliacaoBase({ condicoes_saude: ["hipertensao"] }));

  const resultado = filtrarReceitasCompativeis([semTag, comTag], "almoco", filtro);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].id, "com-tag");
});

test("filtrarReceitasCompativeis nunca zera o pool quando nenhuma receita tem a indicação", () => {
  const semTag1 = receitaBase({ id: "a" });
  const semTag2 = receitaBase({ id: "b" });
  const filtro = construirFiltro(avaliacaoBase({ condicoes_saude: ["hipertensao"] }));

  const resultado = filtrarReceitasCompativeis([semTag1, semTag2], "almoco", filtro);
  assert.equal(resultado.length, 2); // cai pro pool normal, sem quebrar
});

test("indicação de saúde nunca sobrepõe o bloqueio duro de alergia", () => {
  const comAlergiaEComTag = receitaBase({ id: "perigosa", alergenos: ["amendoim"], indicacoes_saude: ["baixo_sodio"] });
  const segura = receitaBase({ id: "segura", indicacoes_saude: [] });
  const filtro = construirFiltro(
    avaliacaoBase({ condicoes_saude: ["hipertensao"], alergias: ["amendoim"] })
  );

  const resultado = filtrarReceitasCompativeis([comAlergiaEComTag, segura], "almoco", filtro);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].id, "segura"); // a com alergia nunca entra, mesmo tendo a tag preferida
});

test("receitaEhSegura ainda funciona normalmente (sem regressão)", () => {
  const filtro = construirFiltro(avaliacaoBase({ alergias: ["amendoim"] }));
  assert.equal(receitaEhSegura(receitaBase({ alergenos: ["amendoim"] }), filtro), false);
  assert.equal(receitaEhSegura(receitaBase({ alergenos: [] }), filtro), true);
});

test("normalizar segue funcionando (sanity check)", () => {
  assert.equal(normalizar("Baixo Índice Glicêmico"), "baixo indice glicemico");
});

console.log(`\n${passed} testes passaram.`);
