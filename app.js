/* ============================================================
   STORAGE MODULE
   Centraliza toda a persistência em localStorage (despensa, lista
   de compras, histórico e preferências) em um único lugar.

   Observação: a instância global chama-se "db" e não "storage",
   porque várias funções do app já usam um parâmetro chamado
   "storage" com outro sentido (local de guarda: despensa /
   geladeira / congelador) — o nome seria sombreado dentro delas.
============================================================ */

class StorageManager {
  constructor() {
    this.KEYS = {
      foods: "saborValidadeFoods",
      shopping: "saborValidadeShoppingList",
      history: "saborValidadeHistory",
      theme: "saborValidadeTheme",
      lastExpiryCheck: "saborValidadeLastExpiryCheck"
    };
  }

  /* ===== GENÉRICOS ===== */
  readList(key) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch (error) {
      console.error("Erro ao ler", key, error);
      return [];
    }
  }

  writeList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (error) {
      console.error("Erro ao salvar", key, error);
      return false;
    }
  }

  /* ===== DESPENSA ===== */
  loadFoods() {
    return this.readList(this.KEYS.foods);
  }

  saveFoods(list) {
    return this.writeList(this.KEYS.foods, list);
  }

  /* ===== LISTA DE COMPRAS ===== */
  loadShoppingList() {
    return this.readList(this.KEYS.shopping);
  }

  saveShoppingList(list) {
    return this.writeList(this.KEYS.shopping, list);
  }

  /* ===== HISTÓRICO ===== */
  loadHistory() {
    return this.readList(this.KEYS.history);
  }

  saveHistory(list) {
    // Mantém apenas as 300 entradas mais recentes, para o localStorage
    // não crescer indefinidamente com o uso ao longo dos meses.
    return this.writeList(this.KEYS.history, list.slice(-300));
  }

  /* ===== PREFERÊNCIAS ===== */
  loadTheme() {
    return localStorage.getItem(this.KEYS.theme) || "light";
  }

  saveTheme(theme) {
    try { localStorage.setItem(this.KEYS.theme, theme); return true; }
    catch (error) { console.error("Erro ao salvar tema:", error); return false; }
  }

  /* ===== UTILITÁRIOS ===== */
  exportData() {
    return {
      foods: this.loadFoods(),
      shopping: this.loadShoppingList(),
      history: this.loadHistory(),
      theme: this.loadTheme(),
      exportDate: new Date().toISOString()
    };
  }

  importData(data) {
    const previous = this.exportData();
    try {
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Arquivo de cópia inválido.");
      if (data.foods !== undefined && (!Array.isArray(data.foods) || !data.foods.every(item => item && typeof item.name === "string" && item.name.trim() && item.name.length <= 120 && Number.isFinite(Number(item.qty)) && Number(item.qty) >= 1))) throw new Error("A cópia contém alimentos inválidos.");
      if (data.shopping !== undefined && (!Array.isArray(data.shopping) || !data.shopping.every(item => item && typeof item.name === "string" && item.name.trim() && item.name.length <= 120))) throw new Error("A cópia contém itens de compra inválidos.");
      if (data.history !== undefined && !Array.isArray(data.history)) throw new Error("O histórico da cópia é inválido.");
      if (data.theme !== undefined && !["light", "dark"].includes(data.theme)) throw new Error("O tema da cópia é inválido.");
      if (Array.isArray(data.foods) && !this.saveFoods(data.foods)) throw new Error("Não foi possível salvar a despensa importada.");
      if (Array.isArray(data.shopping) && !this.saveShoppingList(data.shopping)) throw new Error("Não foi possível salvar a lista importada.");
      if (Array.isArray(data.history) && !this.saveHistory(data.history)) throw new Error("Não foi possível salvar o histórico importado.");
      if (data.theme && !this.saveTheme(data.theme)) throw new Error("Não foi possível salvar as preferências importadas.");
      return true;
    } catch (error) {
      console.error("Erro ao importar dados:", error);
      this.saveFoods(previous.foods);
      this.saveShoppingList(previous.shopping);
      this.saveHistory(previous.history);
      this.saveTheme(previous.theme);
      return false;
    }
  }

  clearAllData() {
    Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
  }
}

const db = new StorageManager();

/* ============================================================
   CONFIGURAÇÕES
============================================================ */

const OPEN_FOOD_FACTS_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const OPEN_FOOD_FACTS_PRODUCT = "https://world.openfoodfacts.org/api/v3/product/";

/* ============================================================
   ESTADO
============================================================ */

let foods = loadFoods();
let shoppingList = loadShoppingList();
let history = loadHistory();
let model = null;
let aiLoadPromise = null;
let aiLoadError = "";
let cameraStream = null;
let html5Qr = null;
let scannerRunning = false;
let lastPrediction = null;
let analyzing = false;
let currentRecipe = null;
let currentStepIndex = 0;
let lastRenderedStepKey = "";
let completedRecipeSteps = new Set();
let barcodeBusy = false;
let barcodeLookupBusy = false;
let pendingBarcodeCode = "";
let nativeBarcodeDetector = null;
let nativeBarcodeTimer = null;
let nativeBarcodeDetecting = false;
let activeRecipeCategory = "Todas";
let activeRecipeIngredient = "Todas";
let recipeVisibleLimit = 40;
let deferredInstallPrompt = null;

/* ============================================================
   RECEITAS
============================================================ */

const DIFFICULTY = window.W2TRecipeCatalog.DIFFICULTY;
const recipes = window.W2TRecipeCatalog.recipes;

/* ============================================================
   BANCO LOCAL — DESPENSA
============================================================ */

function loadFoods() {
  return db.loadFoods();
}

function saveDB() {
  if (db.saveFoods(foods)) {
    const guide = document.getElementById("firstRunGuide");
    if (foods.length && guide && !guide.classList.contains("hidden")) dismissFirstRunGuide();
    return true;
  }
  foods = db.loadFoods();
  showToast("Não foi possível salvar. O app manteve os dados anteriores; exporte uma cópia pelo Perfil.", "⚠️");
  return false;
}

// Agrupa itens apenas quando nome, validade e peso são compatíveis.
function nextFoodId() {
  let id = Date.now();
  while (foods.some(food => Number(food.id) === id)) id += 1;
  return id;
}

function addOrMergeFood({ name, expiry, qty, price, storage, weight, packedDate, expirySource, unit, category, separateBatch = false }) {
  qty = Math.max(1, parseInt(qty, 10) || 1);
  storage = storage || "despensa";

  const normalized = normalizeText(name);
  const existing = separateBatch ? null : foods.find(f => normalizeText(f.name) === normalized && (f.expiry || "") === (expiry || "") && (!weight || !f.weight || f.weight === weight));

  if (existing) {
    existing.qty = (existing.qty || 1) + qty;
    // Mantém sempre a validade mais próxima (a que vence primeiro), por segurança.
    if (expiry && (!existing.expiry || expiry < existing.expiry)) {
      existing.expiry = expiry;
    }
    if (expiry && (expirySource === "label-confirmed" || !existing.expirySource)) existing.expirySource = expirySource || "estimate";
    if (price) existing.price = Number(price);
    existing.storage = storage;
    if (weight) existing.weight = weight;
    if (packedDate) existing.packedDate = packedDate;
    if (unit) existing.unit = unit;
    if (category) existing.category = category;
  } else {
    foods.unshift({
      id: nextFoodId(),
      name,
      icon: iconFor(name),
      expiry,
      expirySource: expiry ? (expirySource || "estimate") : "unknown",
      qty,
      price: price ? Number(price) : null,
      storage,
      weight: weight || "",
      packedDate: packedDate || "",
      unit: unit || "unidade",
      category: category || getFoodCatalogEntry(name, false)?.category || ""
    });
  }

  return saveDB();
}

function saveFoodExpiry(id) {
  const food = foods.find(item => Number(item.id) === Number(id));
  const input = document.getElementById(`expiryUpdate${Number(id)}`);
  if (!food || !input?.value) { showToast("Escolha a data impressa na embalagem.", "📅"); return; }
  if (!confirm("Você conferiu esta data diretamente na embalagem?")) return;
  food.expiry = input.value;
  food.expirySource = "label-confirmed";
  if (!saveDB()) return;
  render();
  showToast("Validade salva. Confira a data no rótulo.", "✓");
}

let editingFoodId = null;
function openFoodEditor(id) {
  const food = foods.find(item => Number(item.id) === Number(id));
  if (!food) return;
  editingFoodId = Number(id);
  document.getElementById("editFoodName").value = food.name || "";
  document.getElementById("editFoodExpiry").value = food.expiry || "";
  document.getElementById("editFoodQty").value = Math.max(1, Number(food.qty) || 1);
  document.getElementById("editFoodStorage").value = food.storage || "despensa";
  document.getElementById("editFoodWeight").value = food.weight || "";
  document.getElementById("editFoodPackedDate").value = food.packedDate || "";
  document.getElementById("foodEditorModal").classList.remove("hidden");
  setTimeout(() => document.getElementById("editFoodName").focus(), 50);
}

function closeFoodEditor() {
  document.getElementById("foodEditorModal").classList.add("hidden");
  editingFoodId = null;
}

function saveFoodEdits() {
  const food = foods.find(item => Number(item.id) === Number(editingFoodId));
  if (!food) return;
  const name = document.getElementById("editFoodName").value.trim();
  const qty = Number(document.getElementById("editFoodQty").value);
  if (!name) { showToast("Informe o nome do alimento.", "⚠️"); document.getElementById("editFoodName").focus(); return; }
  if (!Number.isInteger(qty) || qty < 1) { showToast("A quantidade precisa ser pelo menos 1.", "⚠️"); document.getElementById("editFoodQty").focus(); return; }
  const previous = { ...food };
  food.name = name;
  food.icon = iconFor(name);
  food.expiry = document.getElementById("editFoodExpiry").value;
  food.expirySource = food.expiry ? "user-reviewed" : "unknown";
  food.qty = qty;
  food.storage = document.getElementById("editFoodStorage").value;
  food.weight = document.getElementById("editFoodWeight").value.trim();
  food.packedDate = document.getElementById("editFoodPackedDate").value;
  if (!saveDB()) { Object.assign(food, previous); return; }
  closeFoodEditor();
  render();
  showToast("Alimento atualizado.", "✓");
}

function removeFoodFromEditor() {
  const food = foods.find(item => Number(item.id) === Number(editingFoodId));
  if (!food || !confirm(`Remover “${food.name}” da despensa?`)) return;
  const previous = foods;
  foods = foods.filter(item => Number(item.id) !== Number(editingFoodId));
  if (!saveDB()) { foods = previous; return; }
  closeFoodEditor();
  render();
  showToast("Alimento removido da despensa.", "✓");
}

function dismissFirstRunGuide() {
  document.getElementById("firstRunGuide")?.classList.add("hidden");
  try { localStorage.setItem("w2t-first-run-complete", "1"); } catch (error) { console.warn("Não foi possível salvar a preferência de primeiros passos.", error); }
}

function initFirstRunGuide() {
  let dismissed = false;
  try { dismissed = localStorage.getItem("w2t-first-run-complete") === "1"; } catch (error) {}
  if (!dismissed && foods.length === 0) document.getElementById("firstRunGuide")?.classList.remove("hidden");
}

function updateBackupStatus() {
  const status = document.getElementById("backupStatus");
  if (!status) return;
  let lastBackup = "";
  try { lastBackup = localStorage.getItem("w2t-last-backup-export") || ""; } catch (error) {}
  if (!lastBackup) {
    status.textContent = "Ainda não há cópia exportada neste aparelho. Faça uma cópia antes de limpar os dados do navegador ou trocar de aparelho.";
    return;
  }
  const date = new Date(lastBackup);
  status.textContent = Number.isNaN(date.getTime())
    ? "Faça uma cópia antes de limpar os dados do navegador ou trocar de aparelho."
    : `Última exportação registrada neste aparelho: ${date.toLocaleString("pt-BR")}. Guarde o arquivo fora do navegador.`;
}

function exportBackup() {
  try {
    const content = JSON.stringify({ app: "Wasting2Tasting", version: 1, ...db.exportData() }, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wasting2tasting-backup-${todayISO()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    try { localStorage.setItem("w2t-last-backup-export", new Date().toISOString()); } catch (storageError) { console.warn("Não foi possível registrar a data da cópia.", storageError); }
    updateBackupStatus();
    showToast("Cópia dos dados exportada.", "✓");
  } catch (error) {
    console.error("Falha ao exportar dados:", error);
    showToast("Não foi possível exportar. Tente novamente.", "⚠️");
  }
}

async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.foods) || !Array.isArray(data.shopping) || !Array.isArray(data.history)) {
      throw new Error("Arquivo de backup inválido");
    }
    if (!confirm("Importar esta cópia substituirá os alimentos, a lista de compras e o histórico atuais neste navegador. Continuar?")) return;
    if (!db.importData(data)) throw new Error("Falha ao gravar a cópia");
    foods = loadFoods();
    shoppingList = loadShoppingList();
    history = loadHistory();
    initDarkMode();
    render();
    renderShopping();
    showToast("Cópia importada com sucesso.", "✓");
  } catch (error) {
    console.error("Falha ao importar backup:", error);
    alert("Não foi possível importar esse arquivo. Selecione um backup JSON exportado pelo Wasting2Tasting.");
  }
}

/* ============================================================
   BANCO LOCAL — LISTA DE COMPRAS
============================================================ */

function loadShoppingList() {
  return db.loadShoppingList();
}

function saveShoppingDB() {
  if (db.saveShoppingList(shoppingList)) return true;
  shoppingList = db.loadShoppingList();
  showToast("Não foi possível salvar a lista de compras. Os dados anteriores foram mantidos.", "⚠️");
  return false;
}

/* ============================================================
   BANCO LOCAL — HISTÓRICO (ESTATÍSTICAS)
============================================================ */

function loadHistory() {
  return db.loadHistory();
}

function saveHistoryDB() {
  if (db.saveHistory(history)) return true;
  history = db.loadHistory();
  showToast("Não foi possível atualizar o histórico neste aparelho.", "⚠️");
  return false;
}

// Registra 1 unidade consumida, classificando pelo status da validade
// no momento do consumo: "salvo" (vence logo, evitou desperdício),
// "consumido" (normal, dentro da validade) ou "desperdicado" (já vencido).
function logConsumption(food) {
  const status = dateStatus(food.expiry)[0];
  let type = "consumido";
  if (status === "Vencido") type = "desperdicado";
  else if (status === "Vence logo") type = "salvo";

  history.push({
    date: todayISO(),
    name: food.name,
    type,
    price: Number(food.price) || 0
  });
  saveHistoryDB();
}

function computeStats() {
  let consumido = 0, desperdicado = 0, salvo = 0, economia = 0;

  history.forEach(h => {
    if (h.type === "desperdicado") {
      desperdicado++;
    } else {
      consumido++;
      if (h.type === "salvo") salvo++;
      economia += h.price || 0;
    }
  });

  return { consumido, desperdicado, salvo, economia };
}

/* ============================================================
   UTILITÁRIOS
============================================================ */

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function plusDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// Soma dias a partir de uma data específica (ex: data de abertura), não de hoje.
function addDaysToISO(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function iconFor(name) {
  const n = String(name).toLowerCase();

  if (n.includes("maçã") || n.includes("maca") || n.includes("apple")) return "🍎";
  if (n.includes("banana")) return "🍌";
  if (n.includes("manga") || n.includes("mango")) return "🥭";
  if (n.includes("melancia") || n.includes("watermelon")) return "🍉";
  if (n.includes("melão") || n.includes("melao") || n.includes("melon")) return "🍈";
  if (n.includes("laranja") || n.includes("orange")) return "🍊";
  if (n.includes("limão") || n.includes("limao") || n.includes("lemon")) return "🍋";
  if (n.includes("abacaxi") || n.includes("pineapple")) return "🍍";
  if (n.includes("morango") || n.includes("strawberry")) return "🍓";
  if (n.includes("tomate") || n.includes("tomato")) return "🍅";
  if (n.includes("cenoura") || n.includes("carrot")) return "🥕";
  if (n.includes("batata") || n.includes("potato")) return "🥔";
  if (n.includes("brócolis") || n.includes("brocolis") || n.includes("broccoli")) return "🥦";
  if (n.includes("pepino") || n.includes("cucumber")) return "🥒";
  if (n.includes("cebola") || n.includes("onion")) return "🧅";
  if (n.includes("alho") || n.includes("garlic")) return "🧄";
  if (n.includes("abacate") || n.includes("avocado")) return "🥑";
  if (n.includes("piment") || n.includes("pepper")) return "🌶️";
  if (n.includes("alface") || n.includes("lettuce")) return "🥬";
  if (n.includes("leite") || n.includes("milk")) return "🥛";
  if (n.includes("queijo") || n.includes("cheese")) return "🧀";
  if (n.includes("ovo") || n.includes("egg")) return "🥚";
  if (n.includes("pão") || n.includes("pao") || n.includes("bread")) return "🍞";
  if (n.includes("frango") || n.includes("chicken")) return "🍗";
  if (n.includes("carne") || n.includes("beef") || n.includes("meat")) return "🥩";
  if (n.includes("peixe") || n.includes("fish")) return "🐟";
  if (n.includes("arroz") || n.includes("rice")) return "🍚";
  if (n.includes("macarrão") || n.includes("macarrao") || n.includes("pasta")) return "🍝";
  if (n.includes("pizza")) return "🍕";
  if (n.includes("iogurte") || n.includes("yogurt")) return "🥛";
  if (n.includes("salsicha") || n.includes("linguiça") || n.includes("sausage")) return "🌭";
  if (n.includes("trento") || n.includes("chocolate") || n.includes("kitkat") || n.includes("kit kat")) return "🍫";
  if (n.includes("oreo") || n.includes("biscoito") || n.includes("biscuit") || n.includes("cookie")) return "🍪";
  if (n.includes("wafer")) return "🍫";
  if (n.includes("cereal")) return "🥣";
  if (n.includes("suco") || n.includes("juice")) return "🧃";
  if (n.includes("água") || n.includes("agua") || n.includes("water")) return "💧";
  if (n.includes("café") || n.includes("cafe") || n.includes("coffee")) return "☕";

  return "🥫";
}

/* ============================================================
   IA DE CONSERVAÇÃO — estimativa de validade
   Usada apenas como SUGESTÃO inicial na hora de cadastrar.
   Se o usuário digitar ou corrigir a data manualmente (ex: lendo
   a validade impressa na embalagem), essa data sempre tem prioridade.
============================================================ */

// Catálogo de nomes para cadastro e apoio textual ao OCR. Ele não é um modelo treinado.
const FOOD_CATALOG_GROUPS = [
  ["Grãos, cereais e farinhas", "Arroz branco|Arroz integral|Arroz parboilizado|Feijão carioca|Feijão preto|Feijão branco|Feijão vermelho|Lentilha|Grão-de-bico|Ervilha seca|Milho em grãos|Milho para pipoca|Fubá|Farinha de milho|Farinha de mandioca|Farinha de trigo|Farinha de rosca|Polvilho doce|Polvilho azedo|Tapioca|Aveia em flocos|Farelo de aveia|Granola|Cuscuz de milho|Quinoa"],
  ["Massas e pães", "Macarrão espaguete|Macarrão parafuso|Macarrão penne|Macarrão instantâneo|Lasanha|Massa de pastel|Massa de pizza|Pão francês|Pão de forma|Pão integral|Pão de hambúrguer|Pão de cachorro-quente|Pão de queijo|Torrada|Biscoito cream cracker|Biscoito água e sal|Biscoito maisena|Biscoito recheado|Biscoito de polvilho|Bolacha de chocolate"],
  ["Carnes e aves", "Carne bovina|Patinho|Acém|Coxão mole|Coxão duro|Alcatra|Contrafilé|Filé-mignon|Picanha|Músculo bovino|Carne moída|Costela bovina|Fígado bovino|Carne seca|Charque|Frango inteiro|Peito de frango|Filé de frango|Coxa de frango|Sobrecoxa de frango|Asa de frango|Linguiça de frango|Carne suína|Lombo suíno|Costelinha suína|Pernil|Bacon|Linguiça calabresa|Linguiça toscana|Salsicha"],
  ["Peixes e frutos do mar", "Sardinha|Atum|Tilápia|Merluza|Pescada|Salmão|Bacalhau|Camarão|Lula|Mexilhão"],
  ["Leites e derivados", "Leite integral|Leite desnatado|Leite semidesnatado|Leite em pó|Leite condensado|Creme de leite|Iogurte natural|Iogurte de morango|Iogurte de frutas|Queijo muçarela|Queijo prato|Queijo minas|Queijo parmesão|Queijo coalho|Requeijão|Cream cheese|Manteiga|Margarina|Coalhada|Bebida láctea"],
  ["Frutas", "Banana|Maçã|Laranja|Limão|Mamão|Manga|Abacaxi|Melancia|Melão|Uva|Morango|Goiaba|Maracujá|Abacate|Coco|Kiwi|Pera|Pêssego|Ameixa|Tangerina|Mexerica|Caqui|Caju|Acerola|Jabuticaba"],
  ["Verduras e legumes", "Alface|Couve|Rúcula|Agrião|Espinafre|Repolho|Couve-flor|Brócolis|Acelga|Chicória|Tomate|Batata|Batata-doce|Mandioca|Cenoura|Beterraba|Abóbora|Abobrinha|Chuchu|Berinjela|Pepino|Pimentão|Cebola|Alho|Vagem|Quiabo|Jiló|Milho verde|Ervilha|Nabo"],
  ["Temperos e ingredientes básicos", "Sal|Sal grosso|Açúcar|Açúcar mascavo|Mel|Azeite de oliva|Óleo de soja|Óleo de milho|Óleo de girassol|Vinagre|Vinagre de maçã|Molho de soja|Molho de tomate|Extrato de tomate|Ketchup|Mostarda|Maionese|Pimenta-do-reino|Pimenta vermelha|Páprica|Orégano|Cominho|Cúrcuma|Canela|Cravo-da-índia|Noz-moscada|Louro|Alecrim|Manjericão|Salsinha"],
  ["Enlatados e conservas", "Milho em conserva|Ervilha em conserva|Seleta de legumes|Palmito|Azeitona verde|Azeitona preta|Pepino em conserva|Atum enlatado|Sardinha enlatada|Molho de pimenta"],
  ["Café da manhã e lanches", "Café em pó|Café solúvel|Achocolatado|Chocolate em pó|Cacau em pó|Chá preto|Chá de camomila|Chá de erva-doce|Geleia|Doce de leite|Pasta de amendoim|Amendoim|Castanha-de-caju|Castanha-do-pará|Nozes|Uva-passa|Coco ralado|Leite de coco|Creme de avelã|Cereal matinal"],
  ["Doces e sobremesas", "Chocolate ao leite|Chocolate amargo|Chocolate branco|Bombom|Paçoca|Goiabada|Marmelada|Gelatina|Pudim|Sorvete"],
  ["Prontos e congelados", "Hambúrguer congelado|Nuggets|Batata frita congelada|Pizza congelada|Lasanha congelada|Escondidinho congelado|Pão de queijo congelado|Hambúrguer vegetal|Almôndega congelada|Açaí congelado"],
  ["Outros itens comuns", "Ovos|Ovo de codorna|Tofu|Salsinha e cebolinha|Caldo de galinha|Caldo de carne|Fermento químico|Fermento biológico|Bicarbonato de sódio|Amido de milho"]
];

const FOOD_CATALOG = FOOD_CATALOG_GROUPS.flatMap(([category, names]) => names.split("|").map(name => ({ name, category })));
const FOOD_CATALOG_STORAGE = {
  refrigerated: ["Leites e derivados", "Carnes e aves", "Peixes e frutos do mar"],
  pantry: ["Grãos, cereais e farinhas", "Massas e pães", "Temperos e ingredientes básicos", "Enlatados e conservas", "Café da manhã e lanches", "Doces e sobremesas"],
  produce: ["Frutas", "Verduras e legumes"]
};
const FOOD_PANTRY_EXCEPTIONS = new Set(["banana", "batata", "batata doce", "cebola", "alho", "abobora", "mandioca", "coco", "melancia", "melao"]);
const FOOD_PANTRY_DAIRY = new Set(["leite em po", "leite condensado"]);

function getFoodCatalogEntry(name, allowPartial = false) {
  const normalized = normalizeText(name).trim();
  if (!normalized) return null;
  const exact = FOOD_CATALOG.find(item => normalizeText(item.name) === normalized);
  if (exact || !allowPartial) return exact || null;
  return FOOD_CATALOG.filter(item => normalizeText(item.name).length >= 5 && normalized.includes(normalizeText(item.name)))
    .sort((a, b) => normalizeText(b.name).length - normalizeText(a.name).length)[0] || null;
}

function catalogStorage(item) {
  if (!item) return "despensa";
  const name = normalizeText(item.name);
  if (item.category === "Prontos e congelados" || name === "sorvete") return "congelador";
  if (FOOD_PANTRY_DAIRY.has(name)) return "despensa";
  if (FOOD_CATALOG_STORAGE.refrigerated.includes(item.category)) return "geladeira";
  if (FOOD_CATALOG_STORAGE.produce.includes(item.category)) return FOOD_PANTRY_EXCEPTIONS.has(name) ? "despensa" : "geladeira";
  if (item.category === "Outros itens comuns" && /ovos?|tofu|salsinha e cebolinha/.test(name)) return "geladeira";
  return "despensa";
}

function catalogUnit(item) {
  if (!item) return "unidade";
  if (["Carnes e aves", "Peixes e frutos do mar"].includes(item.category)) return "kg";
  if (["Frutas", "Verduras e legumes"].includes(item.category)) return "unidade";
  if (item.category === "Temperos e ingredientes básicos") return "pacote";
  if (["Enlatados e conservas"].includes(item.category)) return "lata";
  if (item.category === "Leites e derivados") {
    const n = normalizeText(item.name);
    if (/leite integral|leite desnatado|leite semidesnatado|bebida lactea/.test(n)) return "L";
    return "unidade";
  }
  if (normalizeText(item.name) === "ovos" || normalizeText(item.name) === "ovo de codorna") return "dúzia";
  return "pacote";
}

function catalogStorageName(storage) {
  return storage === "geladeira" ? "Geladeira" : storage === "congelador" ? "Congelador" : "Despensa";
}

function onCatalogFoodInput(prefix) {
  const manual = prefix === "manual";
  const name = document.getElementById(manual ? "manualFoodName" : "foodName").value.trim();
  const hint = document.getElementById(manual ? "manualCatalogHint" : "foodCatalogHint");
  const storageField = document.getElementById(manual ? "manualFoodStorage" : "foodStorage");
  const unitField = document.getElementById(manual ? "manualFoodUnit" : "foodUnit");
  const item = getFoodCatalogEntry(name, false);
  const partial = item || getFoodCatalogEntry(name, true);
  if (item) {
    storageField.value = catalogStorage(item);
    unitField.value = catalogUnit(item);
    hint.textContent = `${item.category} · guardar sugerido: ${catalogStorageName(catalogStorage(item))} · unidade: ${catalogUnit(item)}. Validade: confira o rótulo; não há prazo único seguro para todas as marcas e condições.`;
  } else if (partial) {
    hint.textContent = `Sugestão do catálogo: ${partial.name} · ${partial.category}. Selecione ou complete o nome para usar as sugestões.`;
  } else {
    hint.textContent = "Sem correspondência exata no catálogo. Confira manualmente categoria, armazenamento e rótulo.";
  }

}

function initFoodCatalog() {
  const datalist = document.getElementById("foodCatalogOptions");
  if (datalist) datalist.innerHTML = FOOD_CATALOG.map(item => `<option value="${esc(item.name)}" label="${esc(item.category)}"></option>`).join("");
}

const CONSERVATION_DAYS = [
  // [palavras-chave, despensa, geladeira, congelador]
  [["banana"], 5, 8, 60],
  [["maçã", "maca"], 14, 30, 240],
  [["laranja"], 10, 21, 240],
  [["limão", "limao"], 14, 30, 240],
  [["abacaxi"], 4, 7, 240],
  [["morango"], 2, 5, 240],
  [["tomate"], 5, 10, 90],
  [["cenoura"], 7, 21, 240],
  [["batata"], 21, 30, 240],
  [["brócolis", "brocolis"], 2, 5, 240],
  [["pepino"], 4, 7, 90],
  [["cebola"], 30, 60, 240],
  [["alho"], 60, 90, 240],
  [["abacate"], 4, 7, 240],
  [["alface"], 2, 6, 30],
  [["leite"], 1, 6, 60],
  [["queijo"], 5, 15, 90],
  [["ovo"], 7, 30, 0],
  [["pão", "pao"], 4, 10, 90],
  [["frango"], 1, 2, 120],
  [["carne", "beef"], 1, 3, 120],
  [["peixe"], 1, 2, 90],
  [["arroz"], 365, 365, 365],
  [["macarrão", "macarrao", "pasta"], 365, 365, 365],
  [["iogurte"], 3, 15, 0],
  [["suco"], 3, 7, 60],
  [["chocolate", "trento", "kitkat"], 180, 180, 0],
  [["biscoito", "oreo", "cookie"], 120, 120, 0]
];

// Retorna quantos dias esse alimento costuma durar no local de guarda informado.
// "opened" reduz a estimativa, já que alimentos abertos deterioram mais rápido.
function estimateConservationDays(name, storage, opened) {
  const n = normalizeText(name);
  const idx = storage === "geladeira" ? 2 : storage === "congelador" ? 3 : 1;

  const hit = CONSERVATION_DAYS.find(row => row[0].some(k => n.includes(k)));
  let days;
  if (hit) {
    const raw = hit[idx];
    days = raw > 0 ? raw : hit[1]; // se "0" (não recomendado), usa o valor da despensa
  } else {
    // Alimento desconhecido: estimativa genérica por local de guarda.
    days = storage === "geladeira" ? 6 : storage === "congelador" ? 90 : 7;
  }

  if (opened) {
    const factor = storage === "congelador" ? 0.7 : 0.35;
    days = Math.max(1, Math.round(days * factor));
  }

  return days;
}

// Se já foi aberto, a contagem passa a valer a partir da data de abertura
// (e não da data de hoje). A validade impressa na embalagem, quando o
// usuário a digita manualmente, sempre tem prioridade sobre esta estimativa.
function estimateExpiryDate(name, storage, opened, openedDate) {
  const days = estimateConservationDays(name, storage, opened);
  const base = (opened && openedDate) ? openedDate : todayISO();
  return addDaysToISO(base, days);
}

function dateStatus(date) {
  if (!date) return ["Sem validade", "bg-slate-100 text-slate-500"];
  const d = new Date(date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((d - today) / 86400000);

  if (days < 0) return ["Vencido", "bg-red-100 text-red-600"];
  if (days <= 3) return ["Vence logo", "bg-orange-100 text-orange-600"];
  return ["Na validade", "bg-green-100 text-green-700"];
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attr(s) {
  return String(s ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* ============================================================
   TOAST
============================================================ */

function showToast(text, icon) {
  icon = icon || "ℹ️";
  const el = document.createElement("div");
  el.className = "toast-in fixed left-1/2 bottom-24 z-[70] bg-slate-900 text-white text-sm px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2 max-w-[85%]";
  el.innerHTML = `<span>${icon}</span><span>${esc(text)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

/* ============================================================
   CARDS / RENDER — DESPENSA
============================================================ */

// Texto curto e humano sobre quanto tempo falta ("Vence amanhã", "Venceu há 2 dias").
function freshnessLabel(days) {
  if (days === null) return "Sem data de validade";
  if (days < -1) return `Venceu há ${-days} dias`;
  if (days === -1) return "Venceu ontem";
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days >= 60) return `Vence em cerca de ${Math.round(days / 30)} meses`;
  return `Vence em ${days} dias`;
}

function card(food, index) {
  const [status] = dateStatus(food.expiry);
  const days = food.expiry ? daysUntil(food.expiry) : null;
  const statusKey = status === "Vencido" ? "expired" : status === "Vence logo" ? "soon" : status === "Sem validade" ? "none" : "ok";
  // A barra mostra quanto resta da "janela" de 7 dias; acima disso fica cheia.
  const freshPct = days === null ? 0 : days < 0 ? 1 : Math.min(1, days / 7);
  const freshText = freshnessLabel(days);
  const freshBar = days === null ? "" : `<div class="fresh" role="img" aria-label="${freshText}"><i style="--p:${freshPct}"></i></div>`;
  const expiryText = food.expiry
    ? new Date(food.expiry + "T00:00:00").toLocaleDateString("pt-BR")
    : "Não informada";
  const expirySourceText = !food.expiry
    ? "Confira na embalagem"
    : ["label-confirmed", "user-reviewed"].includes(food.expirySource)
      ? "Conferida por você"
      : food.expirySource === "unconfirmed"
        ? "Data informada — confira na embalagem"
        : "Estimativa — confira na embalagem";
  const expirySourceClass = ["label-confirmed", "user-reviewed"].includes(food.expirySource) ? "text-emerald-700" : "text-amber-700";
  const qty = food.qty || 1;
  const priceText = food.price
    ? `<span class="text-xs text-slate-400 mt-1 block">${(food.price * qty).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>`
    : "";

  const dot =
    status === "Vencido" ? "bg-red-500" :
    status === "Vence logo" ? "bg-orange-500" :
    status === "Sem validade" ? "bg-slate-300" : "bg-green-500";
  const statusText =
    status === "Vencido" ? "text-red-600" :
    status === "Vence logo" ? "text-orange-600" :
    status === "Sem validade" ? "text-slate-400" : "text-green-700";
  const expiryEditor = !food.expiry ? `<div class="flex gap-2 mt-2"><input id="expiryUpdate${Number(food.id)}" type="date" aria-label="Data de validade de ${esc(food.name)}" class="min-w-0 flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs"><button onclick="saveFoodExpiry(${Number(food.id)})" class="bg-amber-50 text-amber-800 rounded-lg px-2 py-1.5 text-xs font-semibold">Adicionar validade</button></div>` : "";

  const actionsRow = status === "Vencido"
    ? `<button onclick="discardFood(${Number(food.id)})" class="w-full bg-red-50 text-red-600 rounded-xl py-2.5 text-xs font-semibold">🗑 Descartar${qty > 1 ? ` (${qty})` : ""}</button>`
    : `
      <button onclick="showFoodRecipes('${attr(food.name)}')" class="flex-1 bg-slate-50 text-slate-600 rounded-xl py-2.5 text-xs font-semibold">Ver receitas</button>
      <div class="flex items-center gap-1 bg-slate-50 rounded-xl px-1">
        <button onclick="consumeFood(${Number(food.id)})" class="w-8 h-9 rounded-lg text-slate-500 font-semibold text-base">−</button>
        <span class="w-5 text-center text-sm font-semibold text-slate-700">${qty}</span>
        <button onclick="increaseQty(${Number(food.id)})" class="w-8 h-9 rounded-lg text-slate-500 font-semibold text-base">+</button>
      </div>
    `;

  return `
    <div class="food-card bg-white rounded-2xl border border-slate-200 p-4" data-status="${statusKey}" style="--i:${Math.min(index || 0, 8)}">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-2xl shrink-0">${esc(food.icon || iconFor(food.name))}</div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between gap-2 items-start">
            <h4 class="font-semibold text-slate-800 truncate">${esc(food.name)} ${qty > 1 ? `<span class="text-slate-400 font-normal">×${qty}</span>` : ""}</h4>
            <div class="shrink-0 flex items-center gap-2">
              <span class="flex items-center gap-1.5 text-[11px] font-semibold ${statusText}"><span class="w-1.5 h-1.5 rounded-full ${dot}"></span>${status}</span>
              <button onclick="openFoodEditor(${Number(food.id)})" aria-label="Editar ${esc(food.name)}" class="w-8 h-8 rounded-lg bg-slate-50 text-slate-600" title="Editar alimento">✎</button>
            </div>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">Quantidade: ${qty} ${esc(food.unit || "unidade")}${food.category ? ` · ${esc(food.category)}` : ""}</p>
          <p class="text-xs text-slate-500 mt-0.5">Validade: ${expiryText}</p>
          <p class="text-[11px] ${expirySourceClass} mt-0.5">${expirySourceText}</p>
          <p class="fresh-label">${freshText}</p>
          ${freshBar}
          ${expiryEditor}
          ${food.weight || food.packedDate ? `<p class="text-xs text-slate-500 mt-1">${food.weight ? `Peso: ${esc(food.weight)}` : ""}${food.packedDate ? `${food.weight ? " • " : ""}Embalado: ${new Date(food.packedDate + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}</p>` : ""}
          ${priceText}
        </div>
      </div>
      <div class="flex gap-2 mt-3 items-center">
        ${actionsRow}
      </div>
    </div>
  `;
}

function empty() {
  return `
    <div class="text-center py-10">
      <div class="text-5xl">🥕</div>
      <p class="font-bold text-slate-700 mt-3 text-lg">Sua despensa está vazia</p>
      <p class="text-sm text-slate-500 mt-1 leading-relaxed">Adicione o primeiro alimento e o app avisa antes de ele vencer.</p>
      <div class="flex gap-2 justify-center mt-4">
        <button onclick="openScanner()" class="bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold">Escanear</button>
        <button onclick="openManualAdd()" class="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-semibold">Adicionar à mão</button>
      </div>
    </div>
  `;
}

let pantrySortMode = "recent";

function setPantrySort(mode) {
  pantrySortMode = mode;

  document.getElementById("sortRecentBtn").className =
    "flex-1 py-2 rounded-xl text-xs font-semibold " + (mode === "recent" ? "bg-green-600 text-white" : "bg-white border border-slate-200 text-slate-500");
  document.getElementById("sortExpiryBtn").className =
    "flex-1 py-2 rounded-xl text-xs font-semibold " + (mode === "expiry" ? "bg-green-600 text-white" : "bg-white border border-slate-200 text-slate-500");

  render();
}

function sortedFoods() {
  if (pantrySortMode !== "expiry") return foods;

  // Vence primeiro: quem não tem validade informada vai para o final.
  return [...foods].sort((a, b) => {
    if (!a.expiry && !b.expiry) return 0;
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.localeCompare(b.expiry);
  });
}

function render() {
  const home = document.getElementById("homeFoodList");
  const pantry = document.getElementById("pantryFoodList");

  // A prévia da Home sempre prioriza o que vence primeiro, independente do
  // modo de ordenação escolhido na tela Despensa (que é preferência do usuário).
  const byExpiry = [...foods].sort((a, b) => {
    if (!a.expiry && !b.expiry) return 0;
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.localeCompare(b.expiry);
  });
  const ordered = sortedFoods();

  home.innerHTML = byExpiry.slice(0, 3).map(card).join("") || empty();
  pantry.innerHTML = ordered.map(card).join("") || empty();

  let exp = 0;
  let venc = 0;
  let total = 0;
  let pantryValue = 0;

  foods.forEach(f => {
    const q = f.qty || 1;
    const s = dateStatus(f.expiry)[0];
    total += q;
    if (s === "Vence logo") exp += q;
    if (s === "Vencido") venc += q;
    if (f.price) pantryValue += f.price * q;
  });

  document.getElementById("totalItems").textContent = total;
  document.getElementById("expiringItems").textContent = exp;
  document.getElementById("expiredItems").textContent = venc;

  const pantryValueEl = document.getElementById("pantryValue");
  if (pantryValueEl) {
    pantryValueEl.textContent = pantryValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  renderSmartAssistant();
  updateNotifyBellBadge();
}

/* ============================================================
   ASSISTENTE INTELIGENTE (HOME)
   Identifica o que merece atenção agora e mostra só isso, em ordem
   de prioridade: 1) alimentos vencendo, 2) lista de compras pendente,
   3) resumo de impacto. Se não houver nada relevante, some.
============================================================ */

function renderSmartAssistant() {
  const card = document.getElementById("smartAssistantCard");
  if (!card) return;

  const icon = document.getElementById("assistantIcon");
  const title = document.getElementById("assistantTitle");
  const text = document.getElementById("assistantText");
  const chips = document.getElementById("assistantChips");
  const btn = document.getElementById("assistantActionBtn");

  const { soon, expired } = getExpiryWarnings();
  const urgent = [...expired, ...soon].sort((a, b) => (a.expiry || "").localeCompare(b.expiry || ""));
  const pendingShopping = shoppingList.filter(i => !i.checked);

  card.classList.remove("hidden");

  if (urgent.length) {
    const itemNames = urgent.map(f => f.name.toLowerCase());
    const available = foods.map(f => f.name.toLowerCase());
    const bestRecipe = recipes
      .map(r => ({ ...r, rescueMatches: r.needs.filter(n => matchIngredient(itemNames, n)).length }))
      .filter(r => r.rescueMatches > 0)
      .sort((a, b) => b.rescueMatches - a.rescueMatches)[0];

    icon.textContent = "⏰";
    title.textContent = `${urgent.length} alimento${urgent.length === 1 ? "" : "s"} ${urgent.length === 1 ? "precisa" : "precisam"} de atenção`;
    text.textContent = bestRecipe
      ? `Use primeiro o que está vencendo — sugestão: ${bestRecipe.name}.`
      : `Use primeiro o que está vencendo, antes que estrague.`;

    chips.classList.remove("hidden");
    chips.innerHTML = urgent.slice(0, 4).map(f => {
      const vencido = dateStatus(f.expiry)[0] === "Vencido";
      return `
        <div class="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 shrink-0">
          <span class="w-1.5 h-1.5 rounded-full ${vencido ? "bg-red-500" : "bg-orange-500"}"></span>
          <span class="text-xs font-medium text-slate-700 truncate max-w-[90px]">${esc(f.name)}</span>
        </div>
      `;
    }).join("");

    btn.textContent = "Abrir Modo Resgate";
    btn.className = "w-full mt-3 py-2.5 rounded-xl text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200";
    btn.onclick = openRescueMode;
    return;
  }

  chips.classList.add("hidden");
  chips.innerHTML = "";

  if (pendingShopping.length) {
    icon.textContent = "🛒";
    title.textContent = `${pendingShopping.length} ${pendingShopping.length === 1 ? "item pendente" : "itens pendentes"} na lista de compras`;
    text.textContent = "Nada vencendo agora — hora de repor o que falta.";
    btn.textContent = "Ver lista de compras";
    btn.className = "w-full mt-3 py-2.5 rounded-xl text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200";
    btn.onclick = () => showScreen("shopping");
    return;
  }

  const { consumido, salvo, economia } = computeStats();
  if (consumido > 0) {
    icon.textContent = "📈";
    title.textContent = "Tudo em dia por aqui";
    let msg = `Você já aproveitou ${consumido} alimento${consumido === 1 ? "" : "s"}`;
    if (salvo > 0) msg += `, evitando o desperdício de ${salvo}`;
    if (economia > 0) msg += `. Economia estimada: ${economia.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
    msg += ".";
    text.textContent = msg;
    btn.textContent = "Ver Painel de Impacto";
    btn.className = "w-full mt-3 py-2.5 rounded-xl text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200";
    btn.onclick = () => showScreen("stats");
    return;
  }

  card.classList.add("hidden");
}

// Adiciona instantaneamente 1 unidade de um item comum, com validade
// sugerida pela IA de conservação — sem passar por nenhum formulário.
function quickAddCommon(name, storage) {
  const item = getFoodCatalogEntry(name, false);
  const suggestedStorage = item ? catalogStorage(item) : storage;
  if (!addOrMergeFood({ name, expiry: "", qty: 1, storage: suggestedStorage, unit: catalogUnit(item), category: item?.category })) return;

  const normalized = normalizeText(name);
  const pendingMatch = shoppingList.find(x => !x.checked && normalizeText(x.name) === normalized);
  if (pendingMatch) {
    shoppingList = shoppingList.filter(x => x.id !== pendingMatch.id);
    saveShoppingDB();
    renderShopping();
  }

  render();
  showToast(`"${name}" adicionado.`, "⚡");
}

/* ============================================================
   MODO RESGATE
============================================================ */

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
}

function openRescueMode() {
  const { soon, expired } = getExpiryWarnings();
  const items = [...expired, ...soon].sort((a, b) => (a.expiry || "").localeCompare(b.expiry || ""));

  if (!items.length) {
    showToast("Nenhum alimento vencendo no momento. Tudo em dia! ✅", "✅");
    return;
  }

  document.getElementById("rescueHeadline").textContent =
    `Você tem ${items.length} alimento${items.length === 1 ? "" : "s"} que precisa${items.length === 1 ? "" : "m"} ser usado${items.length === 1 ? "" : "s"} primeiro.`;

  renderRescuePlan(items);
  renderRescueRecipes(items);
  document.getElementById("rescueModal").classList.remove("hidden");
}

function closeRescueMode() {
  document.getElementById("rescueModal").classList.add("hidden");
}

function renderRescuePlan(items) {
  const groups = {};

  items.forEach(f => {
    const days = daysUntil(f.expiry);
    let label;
    if (days === null) label = "Sem validade";
    else if (days < 0) label = "Já vencido";
    else if (days === 0) label = "Hoje";
    else if (days === 1) label = "Amanhã";
    else label = `Em ${days} dias`;

    if (!groups[label]) groups[label] = [];
    groups[label].push(f.name);
  });

  const priority = ["Já vencido", "Hoje", "Amanhã"];
  const labels = Object.keys(groups).sort((a, b) => {
    const ia = priority.indexOf(a), ib = priority.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  document.getElementById("rescuePlan").innerHTML = labels.map(label => {
    const textCls = label === "Já vencido" ? "text-red-600" : "text-orange-600";
    return `
      <div class="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
        <span class="font-semibold text-xs shrink-0 w-20 ${textCls}">${esc(label)}</span>
        <span class="text-xs flex-1 text-slate-600">${groups[label].map(esc).join(", ")}</span>
      </div>
    `;
  }).join("");
}

function renderRescueRecipes(items) {
  const itemNames = items.map(f => f.name.toLowerCase());
  const available = foods.map(f => f.name.toLowerCase());

  const scored = recipes
    .map(r => {
      const have = r.needs.filter(n => matchIngredient(available, n));
      const rescueMatches = r.needs.filter(n => matchIngredient(itemNames, n));
      return { ...r, haveCount: have.length, rescueMatches: rescueMatches.length };
    })
    .filter(r => r.rescueMatches > 0)
    .sort((a, b) => (b.rescueMatches - a.rescueMatches) || (a.level - b.level));

  const top = scored.slice(0, 4);
  const label = document.getElementById("rescueRecipesLabel");

  if (!top.length) {
    label.textContent = "Nenhuma receita combina exatamente com esses itens";
    document.getElementById("rescueRecipes").innerHTML = `
      <p class="text-xs text-slate-400 leading-relaxed">
        Nenhuma receita do catálogo combina exatamente esses itens ainda — mas dá pra
        improvisar! Ingredientes versáteis como ovo, queijo ou pão costumam "salvar"
        sobras variadas, tipo numa omelete ou numa panqueca salgada com o que sobrar.
      </p>
    `;
    return;
  }

  label.textContent = `Encontrei ${top.length} receita${top.length === 1 ? "" : "s"} usando esses alimentos`;

  document.getElementById("rescueRecipes").innerHTML = top.map(r => {
    const diff = DIFFICULTY[r.level] || DIFFICULTY[2];
    return `
      <div class="recipe-card bg-white border border-slate-200 rounded-2xl p-3 cursor-pointer flex items-center gap-3"
           onclick="closeRescueMode(); openRecipeDetail('${attr(r.name)}')">
        <div class="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center text-xl shrink-0">${r.icon}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-semibold text-sm text-slate-800">${esc(r.name)}</p>
            <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${diff.cls}">${diff.label}</span>
          </div>
          <p class="text-[11px] text-orange-600 mt-0.5">${r.rescueMatches === 1 ? "Usa 1 ingrediente que está vencendo" : `Usa ${r.rescueMatches} ingredientes que estão vencendo`}</p>
        </div>
        <span class="text-lg text-slate-300">›</span>
      </div>
    `;
  }).join("");
}

/* ============================================================
   CARDS / RENDER — LISTA DE COMPRAS
============================================================ */

function shoppingRow(item) {
  const checked = !!item.checked;
  const qty = item.qty || 1;
  const badge = item.auto
    ? `<span class="ml-2 shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-semibold bg-orange-50 text-orange-600">sugestão</span>`
    : "";

  const qtyControl = checked
    ? ""
    : `
      <div class="flex items-center gap-0.5 bg-slate-50 rounded-lg px-0.5 shrink-0">
        <button onclick="changeShoppingQty(${Number(item.id)}, -1)" class="w-7 h-7 rounded text-slate-500 font-semibold">−</button>
        <span class="w-4 text-center text-xs font-semibold text-slate-700">${qty}</span>
        <button onclick="changeShoppingQty(${Number(item.id)}, 1)" class="w-7 h-7 rounded text-slate-500 font-semibold">+</button>
      </div>
    `;

  const rightActions = checked
    ? `<button onclick="addToPantryFromShopping(${Number(item.id)})" class="px-3 bg-green-50 text-green-700 rounded-lg py-1.5 text-[11px] font-semibold shrink-0">+ Despensa</button>`
    : "";

  return `
    <div class="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-2">
      <button onclick="toggleShoppingItem(${Number(item.id)})" class="shop-check ${checked ? "checked" : ""}">
        ${checked ? "✓" : ""}
      </button>
      <div class="flex-1 min-w-0 flex items-center">
        <span class="font-medium text-slate-700 truncate ${checked ? "line-through text-slate-400" : ""}">${esc(item.name)}${qty > 1 && !checked ? "" : qty > 1 ? ` ×${qty}` : ""}</span>
        ${badge}
      </div>
      ${qtyControl}
      ${rightActions}
      <button onclick="removeShoppingItem(${Number(item.id)})" class="w-7 h-7 rounded text-slate-300 shrink-0 text-sm">✕</button>
    </div>
  `;
}

function shoppingEmpty(kind) {
  if (kind === "pending") {
    return `
      <div class="text-center py-8">
        <div class="text-4xl">🛒</div>
        <p class="font-semibold text-slate-700 mt-2 text-sm">Nada pendente na lista.</p>
        <p class="text-xs text-slate-400 mt-1">Adicione itens ou consuma algo da despensa.</p>
      </div>
    `;
  }
  return `<p class="text-xs text-slate-400 text-center py-4">Nenhum item comprado ainda.</p>`;
}

function renderShopping() {
  const pending = shoppingList.filter(i => !i.checked);
  const bought = shoppingList.filter(i => i.checked);
  const total = shoppingList.length;

  document.getElementById("shoppingPendingList").innerHTML =
    pending.map(shoppingRow).join("") || shoppingEmpty("pending");

  document.getElementById("shoppingBoughtList").innerHTML =
    bought.map(shoppingRow).join("") || shoppingEmpty("bought");

  document.getElementById("shopPendingCount").textContent = pending.length;
  document.getElementById("shopBoughtCount").textContent = bought.length;
  document.getElementById("shopTotalCount").textContent = total;

  const pct = total ? Math.round((bought.length / total) * 100) : 0;
  document.getElementById("shopProgressBar").style.width = pct + "%";

  const totalUnits = pending.reduce((sum, i) => sum + (i.qty || 1), 0);
  document.getElementById("shopEstimate").textContent = total
    ? (pending.length
        ? `${totalUnits === 1 ? "Falta" : "Faltam"} ${totalUnits} unidade${totalUnits === 1 ? "" : "s"} para fechar a lista.`
        : "Lista completa! Mande os itens para a despensa.")
    : "";

  // Ações em massa só aparecem quando fazem sentido.
  document.getElementById("shoppingActions").classList.toggle("hidden", total === 0);
  document.getElementById("shopSendAllBtn").classList.toggle("hidden", bought.length === 0);
  document.getElementById("shopClearBtn").classList.toggle("hidden", bought.length === 0);

  [["homeShoppingBadge", pending.length], ["navShoppingBadge", pending.length]].forEach(([id, count]) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  });

  renderShoppingSuggestions();
}

// Sugere itens que costumam faltar: o que já acabou na despensa e itens
// comuns que ainda não estão na lista. Filtra pelo que já foi digitado.
function renderShoppingSuggestions() {
  const wrap = document.getElementById("shoppingSuggestions");
  if (!wrap) return;

  const input = document.getElementById("newShoppingItem");
  const typed = normalizeText(input ? input.value : "");

  const common = ["Leite", "Ovo", "Pão", "Arroz", "Banana", "Tomate", "Queijo", "Frango", "Café", "Macarrão"];
  const inList = shoppingList.filter(i => !i.checked).map(i => normalizeText(i.name));
  const inPantry = foods.map(f => normalizeText(f.name));

  const options = common
    .filter(n => {
      const nn = normalizeText(n);
      if (inList.includes(nn) || inPantry.includes(nn)) return false;
      return typed ? nn.startsWith(typed) : true;
    })
    .slice(0, 6);

  wrap.innerHTML = options.length
    ? options.map(n =>
        `<button onclick="addShoppingItem('${attr(n)}')" class="shrink-0 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-600">+ ${esc(n)}</button>`
      ).join("")
    : "";
}

function addShoppingItem(presetName) {
  const input = document.getElementById("newShoppingItem");
  const name = (presetName || input.value).trim();
  if (!name) return;

  // Se o item já estiver pendente, só soma a quantidade.
  const normalized = normalizeText(name);
  const existing = shoppingList.find(x => !x.checked && normalizeText(x.name) === normalized);

  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    showToast(`"${existing.name}" agora está ×${existing.qty}.`, "🛒");
  } else {
    shoppingList.unshift({ id: Date.now(), name, qty: 1, checked: false, auto: false });
  }

  saveShoppingDB();
  renderShopping();

  if (!presetName) {
    input.value = "";
    input.focus();
  }
}

function changeShoppingQty(id, delta) {
  const item = shoppingList.find(x => x.id === id);
  if (!item) return;

  const next = (item.qty || 1) + delta;
  if (next < 1) return;

  item.qty = next;
  saveShoppingDB();
  renderShopping();
}

function markAllShopping(checked) {
  if (!shoppingList.length) return;
  shoppingList.forEach(i => { i.checked = checked; });
  saveShoppingDB();
  renderShopping();
}

function clearBoughtShopping() {
  const bought = shoppingList.filter(i => i.checked);
  if (!bought.length) return;
  if (!confirm(`Remover ${bought.length} item(ns) já comprado(s) da lista?`)) return;

  shoppingList = shoppingList.filter(i => !i.checked);
  saveShoppingDB();
  renderShopping();
}

// Manda de uma vez todos os itens comprados para a despensa.
function addAllBoughtToPantry() {
  const bought = shoppingList.filter(i => i.checked);
  if (!bought.length) return;

  const addedIds = [];
  bought.forEach(item => {
    if (addOrMergeFood({
      name: item.name,
      expiry: "",
      qty: item.qty || 1,
      storage: catalogStorage(getFoodCatalogEntry(item.name, false)),
      unit: catalogUnit(getFoodCatalogEntry(item.name, false)),
      category: getFoodCatalogEntry(item.name, false)?.category
    })) addedIds.push(item.id);
  });

  shoppingList = shoppingList.filter(i => !addedIds.includes(i.id));
  saveShoppingDB();
  render();
  renderShopping();
  if (addedIds.length) showToast(`${addedIds.length} item(ns) enviado(s) para a despensa.`, "✓");
}

function toggleShoppingItem(id) {
  const item = shoppingList.find(x => x.id === id);
  if (!item) return;
  item.checked = !item.checked;
  saveShoppingDB();
  renderShopping();
}

function removeShoppingItem(id) {
  const item = shoppingList.find(x => x.id === id);
  if (!item) return;
  if (!confirm(`Remover "${item.name}" da lista de compras?`)) return;
  shoppingList = shoppingList.filter(x => x.id !== id);
  saveShoppingDB();
  renderShopping();
}

function addToPantryFromShopping(id) {
  const item = shoppingList.find(x => x.id === id);
  if (!item) return;

  if (!addOrMergeFood({
    name: item.name,
    expiry: "",
    qty: item.qty || 1,
    storage: catalogStorage(getFoodCatalogEntry(item.name, false)),
    unit: catalogUnit(getFoodCatalogEntry(item.name, false)),
    category: getFoodCatalogEntry(item.name, false)?.category
  })) return;

  shoppingList = shoppingList.filter(x => x.id !== id);
  saveShoppingDB();

  render();
  renderShopping();
  showToast(`"${item.name}" adicionado à despensa.`, "✓");
}

function addAutoShoppingSuggestion(name) {
  const normalized = normalizeText(name);
  const alreadyPending = shoppingList.some(x => !x.checked && normalizeText(x.name) === normalized);
  if (alreadyPending) return;

  shoppingList.unshift({ id: Date.now(), name, qty: 1, checked: false, auto: true });
  saveShoppingDB();
  renderShopping();
}

/* ============================================================
   SCREEN SWITCH
============================================================ */

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(x => {
    x.classList.toggle("active", x.dataset.screen === id);
  });

  if (id === "stats") renderStats();
  if (id === "home") requestAnimationFrame(animateHomeCounters);

  window.scrollTo(0, 0);
}

// Os números do início "sobem" até o valor final quando a tela abre.
function countUp(el) {
  if (!el) return;
  const end = parseInt(el.textContent, 10);
  if (!Number.isFinite(end) || end <= 0) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = performance.now(), duration = 650;
  (function step(now) {
    const k = Math.min(1, (now - start) / duration);
    el.textContent = k < 1 ? Math.round(end * (1 - Math.pow(1 - k, 3))) : end;
    if (k < 1) requestAnimationFrame(step);
  })(start);
}

function animateHomeCounters() {
  ["totalItems", "expiringItems", "expiredItems"].forEach(id => countUp(document.getElementById(id)));
}
window.addEventListener("load", () => setTimeout(animateHomeCounters, 150));
// Quando a abertura sai, a tela inicial "acontece" de verdade: números sobem e barras enchem.
window.addEventListener("w2t:splash-done", () => {
  if (document.querySelector(".screen.active")?.id === "home") showScreen("home");
});

/* ============================================================
   TOUR GUIADO — mostra, passo a passo, o que cada parte faz.
   Abre sozinho só na primeira vez (despensa vazia). O botão "?"
   no topo abre de novo quando a pessoa quiser.
============================================================ */

const TOUR_KEY = "w2t-tour-done";
const TOUR_STEPS = [
  { title: "Bem-vindo ao Wasting2Tasting", text: "Em menos de um minuto você vê como o app ajuda a não jogar comida fora." },
  { target: '#home > button[onclick="openScanner()"]', title: "Escaneie a embalagem", text: "A câmera lê o código de barras ou o rótulo e já preenche o nome e a validade." },
  { target: "#home .grid-cols-3.gap-2", title: "Prefere digitar?", text: "Use Manual para cadastrar à mão, Compras para a lista do mercado e Receitas para ideias de pratos." },
  { target: "#home .grid-cols-3.gap-3", title: "Seu resumo do dia", text: "Itens guardados, os que vencem em até 3 dias e os que já venceram. Comece pelos que vencem primeiro." },
  { target: "nav", title: "As cores contam a história", text: "Na Despensa, verde é tranquilo, laranja vence em até 3 dias e vermelho já passou da data. A barrinha mostra quanto tempo resta." },
  { target: "#helpBtn", title: "Ficou com dúvida?", text: "Toque em ? a qualquer momento para ver este passo a passo de novo." }
];

let tourIndex = 0;
let tourEl = null;

function startTour() {
  if (tourEl) return;
  showScreen("home");
  tourIndex = 0;
  tourEl = document.createElement("div");
  tourEl.className = "tour-root";
  tourEl.innerHTML = `
    <div class="tour-spot"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" tabindex="-1">
      <h3 id="tourTitle"></h3>
      <p id="tourText" aria-live="polite"></p>
      <div class="tour-foot">
        <div class="tour-dots" aria-hidden="true"></div>
        <div class="tour-actions">
          <button type="button" class="tour-btn ghost" id="tourSkip">Pular</button>
          <button type="button" class="tour-btn primary" id="tourNext">Próximo</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(tourEl);
  tourEl.querySelector(".tour-dots").innerHTML = TOUR_STEPS.map(() => "<i></i>").join("");
  tourEl.querySelector("#tourSkip").onclick = endTour;
  tourEl.querySelector("#tourNext").onclick = () => {
    if (tourIndex >= TOUR_STEPS.length - 1) endTour();
    else { tourIndex++; renderTourStep(); }
  };
  document.addEventListener("keydown", tourKeydown);
  window.addEventListener("resize", renderTourStep);
  renderTourStep();
}

function tourKeydown(event) {
  if (event.key === "Escape") endTour();
}

function renderTourStep() {
  if (!tourEl) return;
  const step = TOUR_STEPS[tourIndex];
  const spot = tourEl.querySelector(".tour-spot");
  const card = tourEl.querySelector(".tour-card");
  const last = tourIndex === TOUR_STEPS.length - 1;

  card.querySelector("#tourTitle").textContent = step.title;
  card.querySelector("#tourText").textContent = step.text;
  card.querySelector("#tourNext").textContent = last ? "Entendi" : "Próximo";
  card.querySelector("#tourSkip").style.visibility = last ? "hidden" : "visible";
  card.querySelectorAll(".tour-dots i").forEach((dot, i) => dot.classList.toggle("on", i === tourIndex));

  const vw = window.innerWidth, vh = window.innerHeight;
  const target = step.target ? document.querySelector(step.target) : null;
  // "instant" porque o CSS da página usa rolagem suave e a medição precisa ser depois do salto.
  if (target) target.scrollIntoView({ block: "center", behavior: "instant" });
  const rect = target ? target.getBoundingClientRect() : null;
  const cardW = card.offsetWidth, cardH = card.offsetHeight;

  if (rect) {
    const pad = 6;
    spot.style.top = rect.top - pad + "px";
    spot.style.left = rect.left - pad + "px";
    spot.style.width = rect.width + pad * 2 + "px";
    spot.style.height = rect.height + pad * 2 + "px";
    const below = rect.bottom + pad + 14;
    const top = below + cardH <= vh - 12 ? below : Math.max(12, rect.top - pad - 14 - cardH);
    card.style.top = top + "px";
    card.style.left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16) + "px";
  } else {
    spot.style.top = vh / 2 + "px";
    spot.style.left = vw / 2 + "px";
    spot.style.width = "0px";
    spot.style.height = "0px";
    card.style.top = Math.max(12, (vh - cardH) / 2) + "px";
    card.style.left = (vw - cardW) / 2 + "px";
  }
  card.focus({ preventScroll: true });
}

function endTour() {
  if (!tourEl) return;
  document.removeEventListener("keydown", tourKeydown);
  window.removeEventListener("resize", renderTourStep);
  tourEl.remove();
  tourEl = null;
  try { localStorage.setItem(TOUR_KEY, "1"); } catch (error) {}
  document.getElementById("helpBtn")?.focus({ preventScroll: true });
}

// Abre sozinho só para quem chega pela primeira vez, com a despensa vazia.
// Espera a abertura e a tela de boas-vindas terminarem, para nada competir.
function maybeAutoStartTour() {
  let done = false;
  try { done = localStorage.getItem(TOUR_KEY) === "1"; } catch (error) {}
  if (done || foods.length !== 0 || tourEl) return;
  if (document.body.classList.contains("intro-open")) return;
  setTimeout(() => { if (!tourEl && !document.body.classList.contains("intro-open")) startTour(); }, 500);
}
window.addEventListener("w2t:splash-done", () => setTimeout(maybeAutoStartTour, 50));
window.addEventListener("w2t:welcome-done", maybeAutoStartTour);

function renderStats() {
  const { consumido, desperdicado, salvo, economia } = computeStats();
  document.getElementById("statConsumido").textContent = consumido;
  document.getElementById("statDesperdicado").textContent = desperdicado;
  document.getElementById("statSalvo").textContent = salvo;
  document.getElementById("statEconomia").textContent =
    economia.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  ["statConsumido", "statDesperdicado", "statSalvo"].forEach(id => countUp(document.getElementById(id)));
  // Sem nenhum registro ainda, a tela explica de onde os números vêm.
  document.getElementById("statsHint").textContent = consumido + desperdicado + salvo === 0
    ? "Seus números aparecem aqui conforme você usa e descarta alimentos na despensa."
    : "Quanto você aproveitou e quanto deixou estragar.";
}

/* ============================================================
   CADASTRO MANUAL — DESPENSA
============================================================ */

function openManualAdd() {
  document.getElementById("manualModal").classList.remove("hidden");
  document.getElementById("manualFoodName").value = "";
  initFoodCatalog();
  document.getElementById("manualFoodQty").value = 1;
  document.getElementById("manualFoodPrice").value = "";
  document.getElementById("manualFoodStorage").value = "despensa";
  document.getElementById("manualFoodUnit").value = "unidade";
  document.getElementById("manualCatalogHint").textContent = "";
  document.getElementById("manualFoodOpened").checked = false;
  document.getElementById("manualFoodOpenedDate").value = todayISO();
  document.getElementById("manualFoodOpenedDateWrap").classList.add("hidden");
  document.getElementById("manualExpiryDate").value = "";
  document.getElementById("manualExpiryConfirmed").checked = false;

  setTimeout(() => document.getElementById("manualFoodName").focus(), 100);
}

function closeManualAdd() {
  document.getElementById("manualModal").classList.add("hidden");
}

function toggleOpenedField(prefix) {
  const checked = document.getElementById(prefix === "manual" ? "manualFoodOpened" : "foodOpened").checked;
  const wrap = document.getElementById(prefix === "manual" ? "manualFoodOpenedDateWrap" : "foodOpenedDateWrap");
  const dateEl = document.getElementById(prefix === "manual" ? "manualFoodOpenedDate" : "foodOpenedDate");

  wrap.classList.toggle("hidden", !checked);
  if (checked && !dateEl.value) dateEl.value = todayISO();
}

// Sugere uma validade automaticamente com base no nome do alimento, no local
// de guarda e em já ter sido aberto ou não (IA de conservação).
// O usuário pode sempre sobrescrever — a data impressa na embalagem manda.
function autoEstimateExpiry(prefix) {
  // Alterar armazenamento ou abertura nunca inventa uma validade.
  const confirmedEl = document.getElementById(prefix === "manual" ? "manualExpiryConfirmed" : "foodExpiryConfirmed");
  const dateEl = document.getElementById(prefix === "manual" ? "manualExpiryDate" : "expiryDate");
  if (dateEl?.value && confirmedEl) confirmedEl.checked = false;
}

function saveManualFood() {
  const name = document.getElementById("manualFoodName").value.trim();
  const expiry = document.getElementById("manualExpiryDate").value;
  const qty = document.getElementById("manualFoodQty").value;
  const price = document.getElementById("manualFoodPrice").value;
  const storage = document.getElementById("manualFoodStorage").value;
  const unit = document.getElementById("manualFoodUnit").value;
  const catalogItem = getFoodCatalogEntry(name, false);

  if (!name) {
    alert("Informe o nome do alimento.");
    return;
  }

  const expirySource = expiry ? (document.getElementById("manualExpiryConfirmed").checked ? "label-confirmed" : "unconfirmed") : "unknown";
  if (!addOrMergeFood({ name, expiry, qty, price, storage, unit, category: catalogItem?.category, expirySource })) return;

  // Se o alimento estava pendente na lista de compras, marca como resolvido.
  const normalized = normalizeText(name);
  const pendingMatch = shoppingList.find(x => !x.checked && normalizeText(x.name) === normalized);
  if (pendingMatch) {
    shoppingList = shoppingList.filter(x => x.id !== pendingMatch.id);
    saveShoppingDB();
    renderShopping();
  }

  render();
  closeManualAdd();
  showScreen("pantry");
}

/* ============================================================
   CONSUMIR — E SUGERIR RECOMPRA
============================================================ */

function consumeFood(id) {
  const f = foods.find(x => x.id === id);
  if (!f) return;

  const qty = f.qty || 1;

  if (qty <= 1) {
    if (!confirm(`Consumir "${f.name}" e remover da despensa?`)) return;
    logConsumption(f);
    foods = foods.filter(x => x.id !== id);
    saveDB();
    render();
    checkIfLastOfKind(f.name);
  } else {
    logConsumption(f);
    f.qty = qty - 1;
    saveDB();
    render();
  }
}

function increaseQty(id) {
  const f = foods.find(x => x.id === id);
  if (!f) return;
  f.qty = (f.qty || 1) + 1;
  saveDB();
  render();
}

// Descarta um alimento vencido por inteiro (todas as unidades) e registra
// como desperdício no Painel de Impacto.
function discardFood(id) {
  const f = foods.find(x => x.id === id);
  if (!f) return;

  const qty = f.qty || 1;
  const label = qty > 1 ? `${qty} unidades de "${f.name}"` : `"${f.name}"`;
  if (!confirm(`Descartar ${label} por estar vencido?`)) return;

  for (let i = 0; i < qty; i++) logConsumption(f);

  foods = foods.filter(x => x.id !== id);
  saveDB();
  render();

  checkIfLastOfKind(f.name);
  showToast(`${label} descartado.`, "🗑");
}

function checkIfLastOfKind(name) {
  const normalized = normalizeText(name);
  const stillHave = foods.some(x => normalizeText(x.name) === normalized);

  if (!stillHave) {
    addAutoShoppingSuggestion(name);
    showToast(`Você consumiu o último "${name}". Adicionado à lista de compras.`, "⚠️");
  }
}

/* ============================================================
   RECEITAS
============================================================ */

function singularizeIngredientText(value) {
  const irregular = { nozes: "noz", ovos: "ovo", pães: "pao", paes: "pao" };
  return String(value || "").split(" ").map(word => {
    if (irregular[word]) return irregular[word];
    if (word.length > 4 && /oes$/.test(word)) return word.slice(0, -3) + "ao";
    if (word.length > 4 && /aes$/.test(word)) return word.slice(0, -3) + "ao";
    if (word.length > 4 && /ais$/.test(word)) return word.slice(0, -3) + "al";
    if (word.length > 4 && /eis$/.test(word)) return word.slice(0, -3) + "el";
    if (word.length > 3 && /s$/.test(word)) return word.slice(0, -1);
    return word;
  }).join(" ");
}

function ingredientPhraseIncludes(text, phrase) {
  const normalizedTextValue = normalizeText(text).replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedPhrase = normalizeText(phrase).replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalizedTextValue || !normalizedPhrase) return false;
  const textForms = [normalizedTextValue, singularizeIngredientText(normalizedTextValue)];
  const phraseForms = [normalizedPhrase, singularizeIngredientText(normalizedPhrase)];
  return textForms.some(textForm => phraseForms.some(phraseForm =>
    textForm === phraseForm || textForm.startsWith(phraseForm + " ") ||
    textForm.endsWith(" " + phraseForm) || textForm.includes(" " + phraseForm + " ") ||
    phraseForm.startsWith(textForm + " ") || phraseForm.endsWith(" " + textForm) ||
    phraseForm.includes(" " + textForm + " ")
  ));
}

function matchIngredient(available, need) {
  return available.some(item => ingredientPhraseIncludes(item, need));
}

function getExpiryWarnings() {
  const soon = [];
  const expired = [];

  foods.forEach(f => {
    const status = dateStatus(f.expiry)[0];
    if (status === "Vence logo") soon.push(f);
    else if (status === "Vencido") expired.push(f);
  });

  return { soon, expired };
}

function expiryWarningRow(f, kind) {
  const dateText = f.expiry
    ? new Date(f.expiry + "T00:00:00").toLocaleDateString("pt-BR")
    : "";
  // "Vence amanhã" diz mais do que só a data; a data continua ao lado.
  const when = f.expiry ? freshnessLabel(daysUntil(f.expiry)) : "Sem validade";

  const dot = kind === "expired" ? "bg-red-500" : "bg-orange-500";
  const whenClass = kind === "expired" ? "text-red-600" : "text-orange-600";

  return `
    <div class="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
      <span class="w-2 h-2 rounded-full shrink-0 ${dot}"></span>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm text-slate-800 truncate">${esc(f.name)}</p>
        <p class="text-xs text-slate-400"><span class="font-semibold ${whenClass}">${when}</span>${dateText ? ` (${dateText})` : ""}</p>
      </div>
    </div>
  `;
}

function showExpiryAlert(soon, expired) {
  const list = document.getElementById("expiryAlertList");

  let html = "";

  if (expired.length) {
    html += `<p class="text-xs font-semibold text-red-600 uppercase tracking-wide">Vencidos</p>`;
    html += expired.map(f => expiryWarningRow(f, "expired")).join("");
  }

  if (soon.length) {
    html += `<p class="text-xs font-semibold text-orange-600 uppercase tracking-wide mt-3">Vencem logo</p>`;
    html += soon.map(f => expiryWarningRow(f, "soon")).join("");
  }

  if (!expired.length && !soon.length) {
    html = `
      <div class="text-center py-8">
        <div class="text-4xl">✅</div>
        <p class="font-semibold mt-2 text-sm text-slate-700">Tudo em dia por aqui!</p>
        <p class="text-xs text-slate-400 mt-1">Nenhum alimento vencido ou vencendo logo.</p>
      </div>
    `;
  }

  list.innerHTML = html;
  document.getElementById("expiryAlertModal").classList.remove("hidden");
}

function closeExpiryAlert() {
  document.getElementById("expiryAlertModal").classList.add("hidden");
}

function openExpiryAlertManual() {
  const { soon, expired } = getExpiryWarnings();
  showExpiryAlert(soon, expired);
}

function updateNotifyBellBadge() {
  const badge = document.getElementById("notifyBellBadge");
  if (!badge) return;

  const { soon, expired } = getExpiryWarnings();
  const count = soon.length + expired.length;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function requestNotificationPermission() {
  return "Notification" in window ? Notification.permission : "unsupported";
}

async function enableExpiryNotifications() {
  if (!("Notification" in window)) {
    showToast("Este navegador não oferece notificações.", "ℹ️");
    updateNotificationPreferenceUI();
    return;
  }
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (error) { console.warn("Permissão de notificação negada:", error); }
  }
  updateNotificationPreferenceUI();
  if (Notification.permission === "granted") {
    showToast("Lembretes ativados neste aparelho.", "✓");
    checkAndNotifyExpirations();
  } else {
    showToast("Permissão não ativada. Você ainda pode consultar os avisos no app.", "ℹ️");
  }
}

function updateNotificationPreferenceUI() {
  const text = document.getElementById("notificationPreferenceText");
  const button = document.getElementById("enableNotificationsBtn");
  if (!text || !button) return;
  const permission = requestNotificationPermission();
  text.textContent = permission === "granted" ? "Ativado neste aparelho." : permission === "denied" ? "Bloqueado nas configurações do navegador." : permission === "unsupported" ? "Não disponível neste navegador." : "Ative para receber avisos neste aparelho.";
  button.textContent = permission === "granted" ? "Ativo" : permission === "denied" || permission === "unsupported" ? "Indisponível" : "Ativar";
  button.disabled = permission === "granted" || permission === "denied" || permission === "unsupported";
  button.classList.toggle("opacity-50", button.disabled);
}

function sendSystemNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, { body, icon: "icon-192.png", badge: "icon-192.png" });
        } else {
          new Notification(title, { body, icon: "icon-192.png" });
        }
      }).catch(() => {
        try { new Notification(title, { body, icon: "icon-192.png" }); } catch (e) {}
      });
    } else {
      new Notification(title, { body, icon: "icon-192.png" });
    }
  } catch (e) {
    console.warn("Não foi possível enviar notificação:", e);
  }
}

// Avisa uma vez por dia (ao abrir o app) sobre alimentos vencidos ou vencendo logo.
function checkAndNotifyExpirations() {
  const { soon, expired } = getExpiryWarnings();
  if (!soon.length && !expired.length) return;

  const today = todayISO();
  const lastCheck = localStorage.getItem(db.KEYS.lastExpiryCheck);
  if (lastCheck === today) return;

  localStorage.setItem(db.KEYS.lastExpiryCheck, today);

  showExpiryAlert(soon, expired);

  const parts = [];
  if (expired.length) parts.push(`${expired.length} vencido(s)`);
  if (soon.length) parts.push(`${soon.length} vencendo em breve`);
  sendSystemNotification("Wasting2Tasting", `Você tem ${parts.join(" e ")}. Confira sua despensa.`);
}

/* ============================================================
   MODO ESCURO
============================================================ */

function initDarkMode() {
  const saved = db.loadTheme();
  if (saved === "dark") {
    document.documentElement.classList.add("dark");
  }
  updateDarkModeButton();
}

function toggleDarkMode() {
  document.documentElement.classList.toggle("dark");
  const isDark = document.documentElement.classList.contains("dark");
  db.saveTheme(isDark ? "dark" : "light");
  updateDarkModeButton();
}

function updateDarkModeButton() {
  const btn = document.getElementById("darkModeBtn");
  if (!btn) return;
  const isDark = document.documentElement.classList.contains("dark");
  const icon = btn.querySelector(".dm-icon");
  const label = btn.querySelector(".dm-label");
  if (icon) icon.textContent = isDark ? "☀️" : "🌙";
  if (label) label.textContent = isDark ? "Modo claro" : "Modo escuro";
}

/* ============================================================
   PWA — INSTALAÇÃO E SERVICE WORKER
============================================================ */

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallButton();
});

function isAppInstalled() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

function updateInstallButton() {
  const btn = document.getElementById("installAppBtn");
  const icon = document.getElementById("installAppIcon");
  const title = document.getElementById("installAppTitle");
  const subtext = document.getElementById("installAppSubtext");
  if (!btn) return;

  const installed = isAppInstalled();
  btn.disabled = installed;
  btn.classList.toggle("opacity-70", installed);
  if (icon) icon.textContent = installed ? "✓" : "＋";
  if (title) title.textContent = installed ? "Aplicativo instalado" : "Adicionar à tela inicial";
  if (subtext) subtext.textContent = installed
    ? "Você já está usando pela tela inicial"
    : "Instale para abrir como um aplicativo";
}

async function installApp() {
  if (isAppInstalled()) {
    showToast("O aplicativo já está instalado.", "✓");
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try {
      const choice = await deferredInstallPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        showToast("Instalação iniciada!", "⬇");
      }
    } catch (e) {
      console.warn("Não foi possível abrir a instalação do app:", e);
    } finally {
      deferredInstallPrompt = null;
      updateInstallButton();
    }
    return;
  }

  const guide = document.getElementById("installGuide");
  const guideText = document.getElementById("installGuideText");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (guideText) {
    if (isIOS && isSafari) {
      guideText.textContent = "No Safari, toque em Compartilhar (□↑) e depois em “Adicionar à Tela de Início”.";
    } else if (/android/i.test(navigator.userAgent)) {
      guideText.textContent = "No menu ⋮ do navegador, escolha “Instalar app” ou “Adicionar à tela inicial”. Se a opção não aparecer, abra este link no Chrome.";
    } else {
      guideText.textContent = "Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. No iPhone e iPad, use o Safari e o menu Compartilhar.";
    }
  }
  if (guide) guide.classList.toggle("hidden");
}

window.addEventListener("appinstalled", () => {
  updateInstallButton();
  showToast("Aplicativo instalado com sucesso!", "🎉");
});

window.addEventListener("DOMContentLoaded", updateInstallButton);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      console.warn("Falha ao registrar o service worker:", e);
    });
  });
}

/* ============================================================
   JOGOS (EASTER EGG)
   Acesso: pressionar a tecla "P" 3 vezes seguidas revela um botão
   escondido na aba Perfil.
============================================================ */

class GamesManager {
  constructor() {
    this.snakeConfig = { color: "#22c55e", shape: "rounded", speed: 8 };
    this.loadGamePreferences();
  }

  loadGamePreferences() {
    try {
      const saved = localStorage.getItem("saborValidadeGamePrefs");
      if (saved) this.snakeConfig = { ...this.snakeConfig, ...JSON.parse(saved) };
    } catch (e) {
      console.warn("Preferências de jogo inválidas, usando padrão.", e);
    }
  }

  saveGamePreferences() {
    try {
      localStorage.setItem("saborValidadeGamePrefs", JSON.stringify(this.snakeConfig));
    } catch (e) {
      console.warn("Não foi possível salvar preferências de jogo.", e);
    }
  }
}

const gamesManager = new GamesManager();

/* ---------- COBRINHA ---------- */

class SnakeGame {
  constructor(canvasId = "snakeCanvas") {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.gridSize = 20;
    this.gameWidth = this.canvas.width / this.gridSize;
    this.gameHeight = this.canvas.height / this.gridSize;

    this.rafId = null;        // requestAnimationFrame para desenhar a 60fps
    this.lastStepTime = 0;    // quando foi o último passo lógico da cobra
    this.stepProgress = 0;    // 0→1 entre uma casa e outra (para interpolar)

    this.reset();
    this.setupControls();
  }

  reset() {
    const cx = Math.floor(this.gameWidth / 2);
    const cy = Math.floor(this.gameHeight / 2);

    // Começa com 3 segmentos para o corpo já ser visível.
    this.snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    this.prevSnake = this.snake.map(s => ({ ...s }));
    this.food = this.generateFood();
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.score = 0;
    this.gameRunning = false;
    this.stepProgress = 0;
    document.getElementById("snakeScore").textContent = "0";
  }

  generateFood() {
    let spot;
    do {
      spot = {
        x: Math.floor(Math.random() * this.gameWidth),
        y: Math.floor(Math.random() * this.gameHeight)
      };
    } while (this.snake && this.snake.some(s => s.x === spot.x && s.y === spot.y));
    return spot;
  }

  setupControls() {
    document.addEventListener("keydown", e => this.handleKeyPress(e));
  }

  handleKeyPress(e) {
    if (!this.gameRunning) return;

    const arrowMap = {
      arrowup: { x: 0, y: -1 }, arrowdown: { x: 0, y: 1 },
      arrowleft: { x: -1, y: 0 }, arrowright: { x: 1, y: 0 },
      w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
      a: { x: -1, y: 0 }, d: { x: 1, y: 0 }
    };

    const dir = arrowMap[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      this.changeDirection(dir);
    }
  }

  changeDirection(dir) {
    if (!this.gameRunning || !dir) return;
    // Impede meia-volta de 180°, que mataria a cobra na hora.
    if (!(dir.x === -this.direction.x && dir.y === -this.direction.y)) {
      this.nextDirection = dir;
    }
  }

  // Um "passo" lógico: a cobra anda uma casa.
  step() {
    this.prevSnake = this.snake.map(s => ({ ...s }));
    this.direction = this.nextDirection;

    const head = { ...this.snake[0] };
    head.x += this.direction.x;
    head.y += this.direction.y;

    // Bater na parede agora mata (antes atravessava para o outro lado).
    if (head.x < 0 || head.x >= this.gameWidth || head.y < 0 || head.y >= this.gameHeight) {
      this.endGame("Você bateu na parede!");
      return;
    }

    if (this.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      this.endGame("Você se mordeu!");
      return;
    }

    this.snake.unshift(head);

    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.food = this.generateFood();
      document.getElementById("snakeScore").textContent = this.score;
    } else {
      this.snake.pop();
    }
  }

  // Posição suavizada de um segmento, interpolando entre onde ele estava
  // e onde está agora — é isso que dá a sensação de 60fps.
  interpolated(index, t) {
    const cur = this.snake[index];
    const prev = this.prevSnake[index] || this.prevSnake[this.prevSnake.length - 1] || cur;

    // Se a distância for grande, houve algo atípico: não interpola.
    if (Math.abs(cur.x - prev.x) > 1 || Math.abs(cur.y - prev.y) > 1) return { x: cur.x, y: cur.y };

    return {
      x: prev.x + (cur.x - prev.x) * t,
      y: prev.y + (cur.y - prev.y) * t
    };
  }

  draw(t = 1) {
    const ctx = this.ctx;
    const g = this.gridSize;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Moldura indicando que a borda é mortal.
    ctx.strokeStyle = "rgba(248,113,113,.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.canvas.width - 2, this.canvas.height - 2);

    const { color, shape } = gamesManager.snakeConfig;

    // Comida com um leve pulsar.
    const pulse = 1 + Math.sin(Date.now() / 200) * 0.08;
    this.drawSegment(this.food.x * g, this.food.y * g, g * pulse, "#ef4444", "round");

    // Corpo: desenhado do rabo para a cabeça, afinando levemente no fim.
    for (let i = this.snake.length - 1; i >= 1; i--) {
      const p = this.interpolated(i, t);
      const taper = 1 - (i / this.snake.length) * 0.25;
      ctx.fillStyle = i % 2 === 0 ? color : this.lighten(color, 8);
      this.drawSegment(p.x * g, p.y * g, g * taper, ctx.fillStyle, shape);
    }

    // Cabeça: maior, mais clara e com olhos virados para a direção.
    const h = this.interpolated(0, t);
    this.drawHead(h.x * g, h.y * g, g);
  }

  drawHead(x, y, size) {
    const ctx = this.ctx;
    const { color, shape } = gamesManager.snakeConfig;

    this.drawSegment(x, y, size * 1.05, this.lighten(color, 30), shape === "square" ? "square" : "round");

    // Olhos posicionados conforme a direção atual.
    const d = this.direction;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const off = size * 0.19;
    const eyeR = Math.max(1.6, size * 0.10);

    // Perpendicular à direção, para separar os dois olhos.
    const px = -d.y, py = d.x;
    const fx = d.x * off * 0.8, fy = d.y * off * 0.8;

    [-1, 1].forEach(sideSign => {
      const ex = cx + fx + px * off * sideSign;
      const ey = cy + fy + py * off * sideSign;

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(ex + d.x * eyeR * 0.35, ey + d.y * eyeR * 0.35, eyeR * 0.55, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawSegment(x, y, size, color, shape) {
    const ctx = this.ctx;
    const full = this.gridSize;
    const inset = (full - size) / 2;
    const padding = 1.5;

    const x1 = x + inset + padding;
    const y1 = y + inset + padding;
    const w = size - padding * 2;
    const h = size - padding * 2;

    ctx.fillStyle = color;

    if (shape === "round") this.drawRoundedRect(x1, y1, w, h, w / 2);
    else if (shape === "square") ctx.fillRect(x1, y1, w, h);
    else if (shape === "diamond") this.drawDiamond(x1 + w / 2, y1 + h / 2, w / 2);
    else this.drawRoundedRect(x1, y1, w, h, Math.min(5, w / 3));
  }

  drawRoundedRect(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
  }

  drawDiamond(cx, cy, size) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size, cy);
    ctx.closePath();
    ctx.fill();
  }

  lighten(color, percent) {
    const hex = color.replace("#", "");
    const ch = i => Math.min(255, Math.round(parseInt(hex.substring(i, i + 2), 16) * (1 + percent / 100)));
    return `#${ch(0).toString(16).padStart(2, "0")}${ch(2).toString(16).padStart(2, "0")}${ch(4).toString(16).padStart(2, "0")}`;
  }

  stop() {
    this.gameRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  endGame(reason) {
    this.stop();
    this.draw(1);
    document.getElementById("snakeStatus").textContent =
      `${reason || "Game over!"} Pontuação: ${this.score}`;
  }

  start() {
    this.stop();
    this.reset();
    this.gameRunning = true;
    document.getElementById("snakeStatus").textContent = "Use as setas, WASD ou os botões. Não encoste nas bordas!";

    this.lastStepTime = performance.now();

    // O desenho roda a cada frame (~60fps) e a lógica só a cada
    // "stepInterval" ms — a interpolação costura os dois.
    const frame = now => {
      if (!this.gameRunning) return;

      const stepInterval = 1000 / gamesManager.snakeConfig.speed;
      let elapsed = now - this.lastStepTime;

      while (elapsed >= stepInterval && this.gameRunning) {
        this.step();
        this.lastStepTime += stepInterval;
        elapsed -= stepInterval;
      }

      if (!this.gameRunning) return;

      this.stepProgress = Math.min(1, elapsed / stepInterval);
      this.draw(this.stepProgress);
      this.rafId = requestAnimationFrame(frame);
    };

    this.rafId = requestAnimationFrame(frame);
  }
}

/* ---------- CAMPO MINADO ---------- */

class MinesweeperGame {
  constructor(rows = 8, cols = 8, mines = 10) {
    this.rows = rows;
    this.cols = cols;
    this.mines = mines;
  }

  init() {
    this.board = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    this.revealed = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    this.flagged = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    this.gameRunning = true;
    this.gameWon = false;

    let placed = 0;
    while (placed < this.mines) {
      const r = Math.floor(Math.random() * this.rows);
      const c = Math.floor(Math.random() * this.cols);
      if (this.board[r][c] !== "M") {
        this.board[r][c] = "M";
        placed++;
      }
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c] === "M") continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && this.board[nr][nc] === "M") count++;
          }
        }
        this.board[r][c] = count;
      }
    }
  }

  reveal(r, c) {
    if (!this.gameRunning || this.revealed[r][c] || this.flagged[r][c]) return;

    this.revealed[r][c] = true;

    if (this.board[r][c] === "M") {
      this.gameRunning = false;
      this.revealAll();
      return;
    }

    if (this.board[r][c] === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && !this.revealed[nr][nc]) {
            this.reveal(nr, nc);
          }
        }
      }
    }

    this.checkWin();
  }

  toggleFlag(r, c) {
    if (!this.gameRunning || this.revealed[r][c]) return;
    this.flagged[r][c] = !this.flagged[r][c];
  }

  revealAll() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) this.revealed[r][c] = true;
    }
  }

  checkWin() {
    let safeRevealed = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.revealed[r][c] && this.board[r][c] !== "M") safeRevealed++;
      }
    }
    if (safeRevealed === this.rows * this.cols - this.mines) {
      this.gameRunning = false;
      this.gameWon = true;
    }
  }

  render() {
    const container = document.getElementById("minesweeperBoard");
    container.innerHTML = "";
    container.style.gridTemplateColumns = `repeat(${this.cols}, 32px)`;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const btn = document.createElement("button");
        btn.className = "mine-cell";

        if (this.revealed[r][c]) {
          btn.classList.add("revealed");
          if (this.board[r][c] === "M") btn.textContent = "💣";
          else if (this.board[r][c] > 0) btn.textContent = this.board[r][c];
        } else if (this.flagged[r][c]) {
          btn.classList.add("flagged");
          btn.textContent = "🚩";
        }

        // Clique normal revela; clique longo (ou botão direito) marca bandeira.
        let pressTimer = null;
        let longPressed = false;

        btn.addEventListener("click", () => {
          if (longPressed) { longPressed = false; return; }
          this.reveal(r, c);
          this.render();
        });

        btn.addEventListener("contextmenu", e => {
          e.preventDefault();
          this.toggleFlag(r, c);
          this.render();
        });

        btn.addEventListener("touchstart", () => {
          pressTimer = setTimeout(() => {
            longPressed = true;
            this.toggleFlag(r, c);
            this.render();
          }, 450);
        }, { passive: true });

        const cancelPress = () => clearTimeout(pressTimer);
        btn.addEventListener("touchend", cancelPress);
        btn.addEventListener("touchmove", cancelPress);

        container.appendChild(btn);
      }
    }

    const status = document.getElementById("minesweeperStatus");
    if (this.gameWon) status.textContent = "🎉 Você venceu!";
    else if (!this.gameRunning) status.textContent = "💥 Você acertou uma mina. Reinicie para tentar de novo.";
    else status.textContent = "Toque para revelar. Toque longo (ou botão direito) para bandeira.";
  }
}

/* ---------- TETRIS ---------- */

class TetrisGame {
  constructor(canvasId = "tetrisCanvas") {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.gridWidth = 10;
    this.gridHeight = 20;
    this.cellSize = 16;
    this.gameLoop = null;

    this.canvas.width = this.gridWidth * this.cellSize;
    this.canvas.height = this.gridHeight * this.cellSize;

    this.pieces = [
      { shape: [[1, 1, 1, 1]], color: "#22d3ee" },
      { shape: [[1, 1], [1, 1]], color: "#facc15" },
      { shape: [[0, 1, 0], [1, 1, 1]], color: "#c084fc" },
      { shape: [[1, 0, 0], [1, 1, 1]], color: "#60a5fa" },
      { shape: [[0, 0, 1], [1, 1, 1]], color: "#fb923c" },
      { shape: [[0, 1, 1], [1, 1, 0]], color: "#4ade80" },
      { shape: [[1, 1, 0], [0, 1, 1]], color: "#f87171" }
    ];

    this.resetState();
    this.setupControls();
  }

  resetState() {
    this.board = Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(0));
    this.currentPiece = null;
    this.score = 0;
    this.gameRunning = false;
  }

  setupControls() {
    document.addEventListener("keydown", e => this.handleKeyPress(e));
  }

  handleKeyPress(e) {
    if (!this.gameRunning || !this.currentPiece) return;

    const key = e.key.toLowerCase();
    if (["arrowleft", "a"].includes(key)) { e.preventDefault(); this.movePiece(-1, 0); }
    else if (["arrowright", "d"].includes(key)) { e.preventDefault(); this.movePiece(1, 0); }
    else if (["arrowdown", "s"].includes(key)) { e.preventDefault(); this.movePiece(0, 1); }
    else if (["arrowup", "w"].includes(key)) { e.preventDefault(); this.rotatePiece(); }
    else return;

    this.draw();
  }

  spawnPiece() {
    const t = this.pieces[Math.floor(Math.random() * this.pieces.length)];
    this.currentPiece = {
      x: Math.floor(this.gridWidth / 2) - 1,
      y: 0,
      shape: t.shape.map(row => [...row]),
      color: t.color
    };
  }

  movePiece(dx, dy) {
    if (!this.currentPiece) return;

    this.currentPiece.x += dx;
    this.currentPiece.y += dy;

    if (!this.isValidPosition()) {
      this.currentPiece.x -= dx;
      this.currentPiece.y -= dy;
      if (dy > 0) this.lockPiece();
    }
  }

  rotatePiece() {
    if (!this.currentPiece) return;
    const original = this.currentPiece.shape;
    this.currentPiece.shape = this.rotate90(original);
    if (!this.isValidPosition()) this.currentPiece.shape = original;
  }

  rotate90(shape) {
    const rows = shape.length, cols = shape[0].length;
    const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) rotated[c][rows - 1 - r] = shape[r][c];
    }
    return rotated;
  }

  isValidPosition() {
    if (!this.currentPiece) return false;
    const p = this.currentPiece;

    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r].length; c++) {
        if (!p.shape[r][c]) continue;
        const x = p.x + c, y = p.y + r;
        if (x < 0 || x >= this.gridWidth || y >= this.gridHeight) return false;
        if (y >= 0 && this.board[y][x]) return false;
      }
    }
    return true;
  }

  lockPiece() {
    const p = this.currentPiece;
    if (!p) return;

    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r].length; c++) {
        if (!p.shape[r][c]) continue;
        const x = p.x + c, y = p.y + r;
        if (y >= 0) this.board[y][x] = p.color;
      }
    }

    this.clearLines();
    this.spawnPiece();

    if (!this.isValidPosition()) this.endGame();
  }

  clearLines() {
    let cleared = 0;
    for (let r = this.gridHeight - 1; r >= 0; r--) {
      if (this.board[r].every(cell => cell !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(this.gridWidth).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      this.score += cleared * 100;
      document.getElementById("tetrisScore").textContent = this.score;
    }
  }

  draw() {
    this.ctx.fillStyle = "#0f172a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let r = 0; r < this.gridHeight; r++) {
      for (let c = 0; c < this.gridWidth; c++) {
        if (this.board[r][c]) {
          this.ctx.fillStyle = this.board[r][c];
          this.ctx.fillRect(c * this.cellSize + 1, r * this.cellSize + 1, this.cellSize - 2, this.cellSize - 2);
        }
      }
    }

    const p = this.currentPiece;
    if (p) {
      this.ctx.fillStyle = p.color;
      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (!p.shape[r][c]) continue;
          this.ctx.fillRect((p.x + c) * this.cellSize + 1, (p.y + r) * this.cellSize + 1, this.cellSize - 2, this.cellSize - 2);
        }
      }
    }
  }

  stop() {
    this.gameRunning = false;
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  }

  endGame() {
    this.stop();
    document.getElementById("tetrisStatus").textContent = `Game over! Pontuação: ${this.score}`;
  }

  start() {
    this.stop();
    this.resetState();
    document.getElementById("tetrisScore").textContent = "0";
    document.getElementById("tetrisStatus").textContent = "Setas/WASD ou os botões abaixo.";
    this.gameRunning = true;
    this.spawnPiece();
    this.draw();

    this.gameLoop = setInterval(() => {
      this.movePiece(0, 1);
      this.draw();
    }, 500);
  }
}

/* ---------- CONTROLES DE UI DOS JOGOS ---------- */

let snakeGameInstance = null;
let minesweeperInstance = null;
let tetrisInstance = null;

function openSnakeGame() {
  document.getElementById("snakeGameModal").classList.remove("hidden");
  syncSnakeCustomizeUI();
  startSnakeGame();
}

function closeSnakeGame() {
  document.getElementById("snakeGameModal").classList.add("hidden");
  if (snakeGameInstance) snakeGameInstance.stop();
}

function startSnakeGame() {
  if (!snakeGameInstance) snakeGameInstance = new SnakeGame();
  snakeGameInstance.start();
}

function snakeChangeDirection(dir) {
  if (!snakeGameInstance) return;
  const dirMap = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };
  snakeGameInstance.changeDirection(dirMap[dir]);
}

function setSnakeColor(color) {
  gamesManager.snakeConfig.color = color;
  gamesManager.saveGamePreferences();
  syncSnakeCustomizeUI();
  if (snakeGameInstance) snakeGameInstance.draw();
}

function setSnakeShape(shape) {
  gamesManager.snakeConfig.shape = shape;
  gamesManager.saveGamePreferences();
  syncSnakeCustomizeUI();
  if (snakeGameInstance) snakeGameInstance.draw();
}

function setSnakeSpeed(value) {
  gamesManager.snakeConfig.speed = Number(value) || 8;
  gamesManager.saveGamePreferences();
  // A velocidade nova vale a partir da próxima partida.
}

function syncSnakeCustomizeUI() {
  const { color, shape, speed } = gamesManager.snakeConfig;

  document.querySelectorAll("[data-snake-color]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.snakeColor === color);
  });
  document.querySelectorAll("[data-snake-shape]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.snakeShape === shape);
  });

  const speedEl = document.getElementById("snakeSpeed");
  if (speedEl) speedEl.value = speed;
}

function toggleSnakeCustomize() {
  document.getElementById("snakeCustomizePanel").classList.toggle("hidden");
}

function openMinesweeperGame() {
  closeSnakeGame();
  document.getElementById("minesweeperModal").classList.remove("hidden");
  restartMinesweeper();
}

function closeMinesweeperGame() {
  document.getElementById("minesweeperModal").classList.add("hidden");
}

function restartMinesweeper() {
  if (!minesweeperInstance) minesweeperInstance = new MinesweeperGame(8, 8, 10);
  minesweeperInstance.init();
  minesweeperInstance.render();
}

function openTetrisGame() {
  closeSnakeGame();
  document.getElementById("tetrisModal").classList.remove("hidden");
  startTetrisGame();
}

function closeTetrisGame() {
  document.getElementById("tetrisModal").classList.add("hidden");
  if (tetrisInstance) tetrisInstance.stop();
}

function startTetrisGame() {
  if (!tetrisInstance) tetrisInstance = new TetrisGame();
  tetrisInstance.start();
}

function tetrisAction(action) {
  if (!tetrisInstance || !tetrisInstance.gameRunning) return;
  if (action === "left") tetrisInstance.movePiece(-1, 0);
  else if (action === "right") tetrisInstance.movePiece(1, 0);
  else if (action === "down") tetrisInstance.movePiece(0, 1);
  else if (action === "rotate") tetrisInstance.rotatePiece();
  tetrisInstance.draw();
}

function backToSnakeRoom(fromModalId) {
  document.getElementById(fromModalId).classList.add("hidden");
  if (fromModalId === "tetrisModal" && tetrisInstance) tetrisInstance.stop();
  openSnakeGame();
}

/* ---------- DETECTOR DO EASTER EGG: "P" 3× SEGUIDAS ---------- */

let pKeyCount = 0;
let pKeyTimer = null;

function registerSecretKey(e) {
  // Ignora se a pessoa estiver digitando em um campo de texto.
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (e.key.toLowerCase() !== "p") {
    pKeyCount = 0;
    clearTimeout(pKeyTimer);
    return;
  }

  pKeyCount++;
  clearTimeout(pKeyTimer);
  // Se demorar mais de 1,2s entre as teclas, a sequência reinicia.
  pKeyTimer = setTimeout(() => { pKeyCount = 0; }, 1200);

  if (pKeyCount >= 3) {
    pKeyCount = 0;
    clearTimeout(pKeyTimer);
    unlockSecretGames();
  }
}

function unlockSecretGames() {
  const btn = document.getElementById("secretGamesBtn");
  if (!btn) return;

  const wasHidden = btn.classList.contains("hidden");
  btn.classList.remove("hidden");
  showScreen("profile");
  btn.scrollIntoView({ behavior: "smooth", block: "center" });

  if (wasHidden) showToast("Você desbloqueou a sala de jogos secreta!", "🐍");
}

document.addEventListener("keydown", registerSecretKey);

/* ============================================================
   TECLADO / MODAIS
============================================================ */

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeFoodEditor();
    closeManualAdd();
    closeRecipeDetail();
    closeSnakeGame();
    closeMinesweeperGame();
    closeTetrisGame();
    if (!document.getElementById("scannerModal").classList.contains("hidden")) {
      closeScanner();
    }
  }
});

/* ============================================================
   INICIALIZAÇÃO
============================================================ */
