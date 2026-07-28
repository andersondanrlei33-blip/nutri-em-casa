-- =====================================================================
-- Biblioteca inicial de receitas (globais, usuario_id = null).
-- Serve como base real para a Consulta Nutricional montar planos desde
-- o primeiro dia, sem depender de o usuário cadastrar receitas.
-- =====================================================================

insert into public.receitas
  (usuario_id, nome, descricao, categoria, ingredientes, modo_preparo, tempo_preparo_min,
   porcoes, calorias, proteina_g, carboidrato_g, gordura_g, fibra_g)
values
  (null, 'Omelete de claras com espinafre', 'Café da manhã leve e rico em proteína.', 'cafe_da_manha',
   '[{"nome":"Claras de ovo","quantidade":4,"unidade":"unidade"},{"nome":"Espinafre","quantidade":50,"unidade":"g"},{"nome":"Azeite","quantidade":1,"unidade":"colher de chá"}]',
   array['Bata as claras com sal e pimenta.', 'Refogue o espinafre no azeite por 1 minuto.', 'Adicione as claras e cozinhe em fogo baixo até firmar.'],
   10, 1, 180, 22, 3, 8, 2),

  (null, 'Aveia com banana e pasta de amendoim', 'Café da manhã energético pré-treino.', 'cafe_da_manha',
   '[{"nome":"Aveia em flocos","quantidade":40,"unidade":"g"},{"nome":"Banana","quantidade":1,"unidade":"unidade"},{"nome":"Pasta de amendoim","quantidade":15,"unidade":"g"},{"nome":"Leite desnatado","quantidade":150,"unidade":"ml"}]',
   array['Misture a aveia com o leite.', 'Corte a banana em rodelas.', 'Finalize com a pasta de amendoim por cima.'],
   5, 1, 380, 14, 55, 11, 7),

  (null, 'Frango grelhado com batata-doce e brócolis', 'Almoço clássico de alta performance.', 'almoco',
   '[{"nome":"Peito de frango","quantidade":150,"unidade":"g"},{"nome":"Batata-doce","quantidade":150,"unidade":"g"},{"nome":"Brócolis","quantidade":100,"unidade":"g"},{"nome":"Azeite","quantidade":1,"unidade":"colher de sopa"}]',
   array['Tempere o frango e grelhe em fogo médio até dourar.', 'Cozinhe a batata-doce no vapor.', 'Refogue o brócolis rapidamente no azeite.'],
   30, 1, 480, 45, 42, 14, 6),

  (null, 'Salmão assado com quinoa e legumes', 'Almoço/jantar rico em ômega-3.', 'jantar',
   '[{"nome":"Salmão","quantidade":150,"unidade":"g"},{"nome":"Quinoa","quantidade":60,"unidade":"g"},{"nome":"Abobrinha","quantidade":80,"unidade":"g"},{"nome":"Cenoura","quantidade":60,"unidade":"g"}]',
   array['Tempere o salmão e asse a 200°C por 15 minutos.', 'Cozinhe a quinoa conforme instruções da embalagem.', 'Refogue os legumes em fogo médio.'],
   35, 1, 520, 38, 45, 20, 7),

  (null, 'Tapioca com frango desfiado', 'Lanche prático rico em proteína.', 'lanche',
   '[{"nome":"Goma de tapioca","quantidade":40,"unidade":"g"},{"nome":"Frango desfiado","quantidade":80,"unidade":"g"},{"nome":"Queijo cottage","quantidade":20,"unidade":"g"}]',
   array['Aqueça a goma de tapioca em frigideira antiaderente até firmar.', 'Recheie com o frango desfiado e o cottage.', 'Dobre ao meio e sirva.'],
   10, 1, 260, 24, 28, 5, 1),

  (null, 'Iogurte grego com granola e frutas vermelhas', 'Lanche rápido rico em cálcio e antioxidantes.', 'lanche',
   '[{"nome":"Iogurte grego natural","quantidade":150,"unidade":"g"},{"nome":"Granola","quantidade":25,"unidade":"g"},{"nome":"Frutas vermelhas","quantidade":50,"unidade":"g"}]',
   array['Monte em camadas: iogurte, granola e frutas.', 'Sirva gelado.'],
   5, 1, 240, 16, 27, 7, 3),

  (null, 'Wrap integral de atum', 'Almoço leve e prático.', 'almoco',
   '[{"nome":"Tortilha integral","quantidade":1,"unidade":"unidade"},{"nome":"Atum em água","quantidade":100,"unidade":"g"},{"nome":"Alface","quantidade":30,"unidade":"g"},{"nome":"Tomate","quantidade":50,"unidade":"g"},{"nome":"Iogurte natural","quantidade":20,"unidade":"g"}]',
   array['Misture o atum com o iogurte natural.', 'Monte o wrap com alface, tomate e o atum temperado.', 'Enrole bem firme e corte ao meio.'],
   10, 1, 360, 32, 34, 10, 5),

  (null, 'Sopa de legumes com frango', 'Jantar leve e nutritivo.', 'jantar',
   '[{"nome":"Peito de frango","quantidade":100,"unidade":"g"},{"nome":"Abóbora","quantidade":100,"unidade":"g"},{"nome":"Cenoura","quantidade":60,"unidade":"g"},{"nome":"Chuchu","quantidade":60,"unidade":"g"},{"nome":"Caldo de legumes caseiro","quantidade":300,"unidade":"ml"}]',
   array['Cozinhe o frango no caldo até macio e desfie.', 'Adicione os legumes picados e cozinhe até ficarem macios.', 'Tempere a gosto e sirva quente.'],
   40, 1, 290, 30, 26, 6, 6),

  (null, 'Shake proteico pós-treino', 'Recuperação muscular rápida após o treino.', 'pos_treino',
   '[{"nome":"Whey protein","quantidade":30,"unidade":"g"},{"nome":"Banana","quantidade":1,"unidade":"unidade"},{"nome":"Leite desnatado","quantidade":250,"unidade":"ml"}]',
   array['Bata todos os ingredientes no liquidificador até ficar homogêneo.', 'Sirva imediatamente.'],
   5, 1, 310, 30, 38, 4, 2),

  (null, 'Mix de castanhas pré-treino', 'Energia rápida antes do treino.', 'pre_treino',
   '[{"nome":"Castanha-do-pará","quantidade":15,"unidade":"g"},{"nome":"Amêndoas","quantidade":15,"unidade":"g"},{"nome":"Damasco seco","quantidade":20,"unidade":"g"}]',
   array['Misture todas as castanhas e o damasco em um pote pequeno.'],
   2, 1, 220, 6, 18, 15, 4),

  (null, 'Salada de grão-de-bico com legumes', 'Almoço vegetariano rico em fibras.', 'almoco',
   '[{"nome":"Grão-de-bico cozido","quantidade":150,"unidade":"g"},{"nome":"Pepino","quantidade":60,"unidade":"g"},{"nome":"Tomate cereja","quantidade":60,"unidade":"g"},{"nome":"Azeite","quantidade":1,"unidade":"colher de sopa"},{"nome":"Limão","quantidade":0.5,"unidade":"unidade"}]',
   array['Misture o grão-de-bico com os legumes picados.', 'Tempere com azeite, limão, sal e pimenta.'],
   10, 1, 340, 15, 45, 11, 12),

  (null, 'Pudim de chia com cacau', 'Sobremesa saudável rica em fibras e ômega-3.', 'sobremesa',
   '[{"nome":"Sementes de chia","quantidade":25,"unidade":"g"},{"nome":"Leite de amêndoas","quantidade":200,"unidade":"ml"},{"nome":"Cacau em pó","quantidade":10,"unidade":"g"},{"nome":"Mel","quantidade":10,"unidade":"g"}]',
   array['Misture todos os ingredientes em um pote.', 'Deixe descansar na geladeira por ao menos 4 horas antes de servir.'],
   5, 1, 190, 6, 18, 10, 9);
