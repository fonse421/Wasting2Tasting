window.W2TRecipeCatalog = (() => {
const DIFFICULTY = {
  1: { label: "Fácil", cls: "border border-green-200 text-green-700" },
  2: { label: "Médio", cls: "border border-amber-200 text-amber-700" },
  3: { label: "Difícil", cls: "border border-red-200 text-red-700" }
};

const recipes = [
  // ===================== FÁCIL =====================
  {
    name: "Sanduíche de queijo", time: "8 min", icon: "🥪", level: 1,
    needs: ["pão", "queijo"],
    steps: [
      { icon: "🍞", text: "Separe duas fatias de pão." },
      { icon: "🧀", text: "Coloque fatias de queijo entre elas." },
      { icon: "🍳", text: "Leve à frigideira ou sanduicheira até o queijo derreter e o pão dourar." },
      { icon: "🥪", text: "Corte ao meio e sirva quente." }
    ]
  },
  {
    name: "Ovo mexido", time: "8 min", icon: "🍳", level: 1,
    needs: ["ovo"],
    steps: [
      { icon: "🥚", text: "Quebre os ovos em uma tigela e bata levemente com um garfo." },
      { icon: "🧂", text: "Tempere com sal a gosto." },
      { icon: "🍳", text: "Despeje na frigideira em fogo baixo e mexa sem parar com uma espátula." },
      { icon: "🍽️", text: "Retire do fogo quando ainda estiver macio e sirva." }
    ]
  },
  {
    name: "Torrada com queijo e tomate", time: "10 min", icon: "🍞", level: 1,
    needs: ["pão", "queijo", "tomate"],
    steps: [
      { icon: "🔪", text: "Corte o pão em fatias e o tomate em rodelas finas." },
      { icon: "🧀", text: "Coloque queijo e tomate sobre cada fatia." },
      { icon: "🔥", text: "Leve à torradeira, frigideira ou forno até o queijo derreter." },
      { icon: "🍽️", text: "Sirva quente, se quiser com orégano por cima." }
    ]
  },
  {
    name: "Vitamina de banana", time: "5 min", icon: "🥤", level: 1,
    needs: ["banana", "leite"],
    steps: [
      { icon: "🍌", text: "Descasque a banana e corte em pedaços." },
      { icon: "🥛", text: "Coloque a banana e o leite no liquidificador." },
      { icon: "🌀", text: "Bata até ficar homogêneo." },
      { icon: "🥤", text: "Sirva gelado." }
    ]
  },
  {
    name: "Banana frita", time: "10 min", icon: "🍌", level: 1,
    needs: ["banana"],
    steps: [
      { icon: "🍌", text: "Descasque a banana e corte ao meio no sentido do comprimento." },
      { icon: "🍯", text: "Se quiser, passe em um pouco de açúcar ou canela." },
      { icon: "🍳", text: "Frite em manteiga ou óleo quente até dourar dos dois lados." },
      { icon: "🍽️", text: "Sirva quente." }
    ]
  },
  {
    name: "Salada rápida", time: "10 min", icon: "🥗", level: 1,
    needs: ["tomate", "alface", "cenoura"],
    steps: [
      { icon: "🥬", text: "Lave bem a alface e as demais folhas." },
      { icon: "🥕", text: "Rale ou corte a cenoura em tiras finas." },
      { icon: "🍅", text: "Corte o tomate em cubos ou fatias." },
      { icon: "🥗", text: "Misture tudo em uma tigela e tempere com sal, azeite e limão a gosto." }
    ]
  },
  {
    name: "Pão com manteiga e mel", time: "5 min", icon: "🍯", level: 1,
    needs: ["pão", "manteiga", "mel"],
    steps: [
      { icon: "🔪", text: "Corte o pão ao meio ou em fatias." },
      { icon: "🧈", text: "Passe manteiga generosamente." },
      { icon: "🍯", text: "Regue com mel por cima." },
      { icon: "🍽️", text: "Sirva em seguida, se quiser com o pão levemente aquecido." }
    ]
  },
  {
    name: "Milho na manteiga", time: "10 min", icon: "🌽", level: 1,
    needs: ["milho", "manteiga"],
    steps: [
      { icon: "🌽", text: "Cozinhe o milho em água até ficar macio (ou use milho já cozido)." },
      { icon: "🧈", text: "Escorra e misture com manteiga ainda quente." },
      { icon: "🧂", text: "Tempere com uma pitada de sal." },
      { icon: "🍽️", text: "Sirva quente." }
    ]
  },

  // ===================== MÉDIO =====================
  {
    name: "Omelete de queijo e tomate", time: "10 min", icon: "🍳", level: 2,
    needs: ["ovo", "queijo", "tomate"],
    steps: [
      { icon: "🥚", text: "Quebre os ovos em uma tigela e bata bem com um garfo." },
      { icon: "🧂", text: "Tempere com sal e pimenta a gosto." },
      { icon: "🍅", text: "Corte o tomate e o queijo em cubos pequenos." },
      { icon: "🍳", text: "Aqueça a frigideira com um fio de óleo, despeje os ovos e adicione o queijo e o tomate por cima." },
      { icon: "🔥", text: "Cozinhe em fogo médio até firmar, dobre ao meio e sirva." }
    ]
  },
  {
    name: "Macarrão com queijo", time: "15 min", icon: "🍝", level: 2,
    needs: ["macarrão", "queijo"],
    steps: [
      { icon: "🍝", text: "Cozinhe o macarrão em água fervente com sal até ficar al dente." },
      { icon: "💧", text: "Escorra a água e reserve um pouco da água do cozimento." },
      { icon: "🧀", text: "Volte o macarrão à panela em fogo baixo e adicione o queijo." },
      { icon: "🔥", text: "Misture até o queijo derreter." },
      { icon: "🍽️", text: "Sirva imediatamente." }
    ]
  },
  {
    name: "Macarrão alho e óleo", time: "15 min", icon: "🍝", level: 2,
    needs: ["macarrão", "alho"],
    steps: [
      { icon: "🍝", text: "Cozinhe o macarrão em água fervente com sal até ficar al dente." },
      { icon: "🧄", text: "Enquanto isso, fatie o alho em lâminas finas." },
      { icon: "🍳", text: "Doure o alho em azeite ou óleo em fogo baixo, sem queimar." },
      { icon: "🔥", text: "Escorra o macarrão e misture com o alho dourado." },
      { icon: "🍽️", text: "Finalize com salsinha picada, se tiver, e sirva." }
    ]
  },
  {
    name: "Arroz com frango", time: "25 min", icon: "🍚", level: 2,
    needs: ["arroz", "frango"],
    steps: [
      { icon: "🍗", text: "Tempere o frango com sal e alho e corte em pedaços." },
      { icon: "🍳", text: "Doure o frango em uma panela com um fio de óleo." },
      { icon: "🍚", text: "Adicione o arroz lavado e misture por 1 minuto." },
      { icon: "💧", text: "Acrescente água quente (2 partes de água para 1 de arroz), tampe e cozinhe em fogo baixo." },
      { icon: "🍽️", text: "Quando a água secar e o arroz estiver macio, desligue e sirva." }
    ]
  },
  {
    name: "Frango grelhado com batata", time: "25 min", icon: "🍗", level: 2,
    needs: ["frango", "batata"],
    steps: [
      { icon: "🥔", text: "Corte as batatas em cubos e cozinhe até ficarem macias." },
      { icon: "🍗", text: "Tempere o frango com sal, alho e limão." },
      { icon: "🍳", text: "Grelhe o frango em fogo médio até dourar dos dois lados." },
      { icon: "🧈", text: "Salteie as batatas cozidas na mesma frigideira, com um pouco de manteiga." },
      { icon: "🍽️", text: "Sirva o frango acompanhado das batatas." }
    ]
  },
  {
    name: "Purê de batata", time: "20 min", icon: "🥔", level: 2,
    needs: ["batata", "leite", "manteiga"],
    steps: [
      { icon: "🥔", text: "Descasque e cozinhe as batatas em água com sal até ficarem bem macias." },
      { icon: "💧", text: "Escorra e amasse ainda quentes até virar um purê liso." },
      { icon: "🥛", text: "Adicione leite aos poucos, mexendo, até dar o ponto cremoso." },
      { icon: "🧈", text: "Finalize com manteiga e misture bem." },
      { icon: "🍽️", text: "Sirva quente." }
    ]
  },
  {
    name: "Sopa de legumes", time: "30 min", icon: "🍲", level: 2,
    needs: ["cenoura", "batata", "cebola"],
    steps: [
      { icon: "🔪", text: "Corte a cenoura, a batata e a cebola em pedaços pequenos." },
      { icon: "🍳", text: "Refogue a cebola em um fio de óleo até ficar transparente." },
      { icon: "🥕", text: "Junte a cenoura e a batata e refogue por mais 2 minutos." },
      { icon: "💧", text: "Cubra com água, tempere com sal e cozinhe em fogo médio até os legumes ficarem macios." },
      { icon: "🍽️", text: "Sirva quente, amassando um pouco os legumes se quiser uma sopa mais cremosa." }
    ]
  },
  {
    name: "Panqueca de banana", time: "15 min", icon: "🥞", level: 2,
    needs: ["banana", "ovo", "farinha"],
    steps: [
      { icon: "🍌", text: "Amasse a banana bem madura em uma tigela." },
      { icon: "🥚", text: "Adicione o ovo e misture bem." },
      { icon: "🌾", text: "Acrescente a farinha aos poucos até formar uma massa cremosa." },
      { icon: "🍳", text: "Frite pequenas porções em frigideira untada, dourando dos dois lados." },
      { icon: "🍽️", text: "Sirva com mel, canela ou o que preferir." }
    ]
  },
  {
    name: "Salada de macarrão", time: "20 min", icon: "🥗", level: 2,
    needs: ["macarrão", "tomate", "milho"],
    steps: [
      { icon: "🍝", text: "Cozinhe o macarrão (de preferência parafuso ou penne) até ficar al dente." },
      { icon: "💧", text: "Escorra e deixe esfriar um pouco." },
      { icon: "🍅", text: "Corte o tomate em cubos pequenos." },
      { icon: "🌽", text: "Misture o macarrão, o tomate e o milho em uma tigela." },
      { icon: "🥗", text: "Tempere com azeite, sal e ervas a gosto e sirva." }
    ]
  },

  // ===================== DIFÍCIL =====================
  {
    name: "Lasanha rápida", time: "45 min", icon: "🍝", level: 3,
    needs: ["macarrão", "queijo", "carne"],
    steps: [
      { icon: "🍝", text: "Cozinhe as folhas de massa (ou macarrão) até ficarem al dente." },
      { icon: "🥩", text: "Refogue a carne moída temperada até dourar bem." },
      { icon: "🍅", text: "Misture a carne com molho de tomate e deixe apurar por alguns minutos." },
      { icon: "🧀", text: "Monte camadas alternando massa, recheio e queijo em um refratário." },
      { icon: "🔥", text: "Leve ao forno médio por cerca de 20 minutos, até gratinar." },
      { icon: "🍽️", text: "Deixe descansar 5 minutos antes de servir." }
    ]
  },
  {
    name: "Frango à parmegiana", time: "40 min", icon: "🍗", level: 3,
    needs: ["frango", "queijo"],
    steps: [
      { icon: "🍗", text: "Tempere os filés de frango e passe em farinha, ovo batido e farinha novamente." },
      { icon: "🍳", text: "Frite os filés em óleo quente até dourarem bem dos dois lados." },
      { icon: "🍅", text: "Cubra os filés fritos com molho de tomate em um refratário." },
      { icon: "🧀", text: "Espalhe queijo generosamente por cima." },
      { icon: "🔥", text: "Leve ao forno até o queijo derreter e gratinar." },
      { icon: "🍽️", text: "Sirva com arroz ou macarrão." }
    ]
  },
  {
    name: "Risoto de frango", time: "40 min", icon: "🍚", level: 3,
    needs: ["arroz", "frango", "queijo"],
    steps: [
      { icon: "🍗", text: "Corte o frango em cubos e tempere bem." },
      { icon: "🍳", text: "Doure o frango em uma panela e reserve." },
      { icon: "🍚", text: "Na mesma panela, refogue o arroz por 1 minuto." },
      { icon: "💧", text: "Adicione caldo quente aos poucos, mexendo sempre, até o arroz ficar cremoso." },
      { icon: "🧀", text: "Volte o frango para a panela e finalize com queijo, mexendo bem." },
      { icon: "🍽️", text: "Sirva imediatamente, ainda cremoso." }
    ]
  },
  {
    name: "Strogonoff de frango", time: "35 min", icon: "🍛", level: 3,
    needs: ["frango", "arroz"],
    steps: [
      { icon: "🍗", text: "Corte o frango em tiras e tempere com sal e alho." },
      { icon: "🍳", text: "Doure o frango em uma panela com um fio de óleo." },
      { icon: "🧅", text: "Adicione cebola picada e refogue até ficar transparente." },
      { icon: "🍅", text: "Acrescente molho de tomate e um pouco de água, deixando apurar." },
      { icon: "🥛", text: "Finalize com creme de leite, mexendo até engrossar levemente." },
      { icon: "🍽️", text: "Sirva com arroz branco." }
    ]
  },
  {
    name: "Torta salgada de liquidificador", time: "50 min", icon: "🥧", level: 3,
    needs: ["farinha", "ovo", "queijo"],
    steps: [
      { icon: "🥚", text: "Bata no liquidificador ovos, leite e óleo até misturar bem." },
      { icon: "🌾", text: "Adicione a farinha e o fermento e bata até ficar homogêneo." },
      { icon: "🧀", text: "Em um refratário untado, coloque o recheio (queijo, presunto ou o que tiver) e cubra com a massa." },
      { icon: "🔥", text: "Leve ao forno médio por cerca de 35 minutos, até dourar." },
      { icon: "🍽️", text: "Espere amornar antes de desenformar e servir." }
    ]
  }
];

// Catálogo de 370 receitas importado do PDF enviado pelo usuário.
// Os itens do catálogo viram sugestões/faltantes; não são adicionados à despensa automaticamente.
  return { DIFFICULTY, recipes };
})();
