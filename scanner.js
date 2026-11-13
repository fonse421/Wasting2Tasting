/* ============================================================
   SCANNER / CÂMERA
============================================================ */

async function openScanner() {
  document.getElementById("scannerModal").classList.remove("hidden");
  document.getElementById("predictionBox").classList.add("hidden");
  document.getElementById("productForm").classList.add("hidden");
  document.getElementById("reader").classList.add("hidden");
  document.getElementById("aiCamera").classList.remove("hidden");
  document.getElementById("cameraOverlay").classList.remove("hidden");

  setStatus("Scanner pronto", "Escolha o código de barras ou foto. Os recursos de leitura serão carregados quando necessários.", "📷");

  await startCamera();
}

async function closeScanner() {
  await stopBarcodeScanner();

  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }

  document.getElementById("aiCamera").srcObject = null;
  document.getElementById("scannerModal").classList.add("hidden");
  document.getElementById("predictionBox").classList.add("hidden");
  document.getElementById("productForm").classList.add("hidden");
  hideProgress();
  pendingBarcodeCode = "";
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const insecure = !window.isSecureContext;
    setStatus("Câmera indisponível", insecure ? "Abra o endereço HTTPS. Você também pode escolher uma foto da galeria ou cadastrar manualmente." : "Este navegador não oferece câmera nesta página. Escolha uma foto da galeria ou cadastre manualmente.", "⚠️");
    return;
  }

  try {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    const video = document.getElementById("aiCamera");
    video.srcObject = cameraStream;
    await video.play().catch(() => {});

    setStatus("Câmera ativa", "Centralize o alimento e toque em Analisar agora.", "📷");
  } catch (e) {
    console.error(e);
    const messages = {
      NotAllowedError: "Permissão negada. Toque no ícone ao lado do endereço do site, permita a câmera e tente novamente.",
      SecurityError: "O navegador bloqueou a câmera por segurança. Verifique a permissão do site.",
      NotFoundError: "Nenhuma câmera foi encontrada. Escolha uma foto da galeria para continuar.",
      OverconstrainedError: "A câmera solicitada não está disponível. Tente outra câmera ou escolha uma foto.",
      NotReadableError: "A câmera pode estar sendo usada por outro aplicativo. Feche-o ou escolha uma foto da galeria."
    };
    setStatus(e.name === "NotAllowedError" || e.name === "SecurityError" ? "Permissão de câmera necessária" : "Não foi possível iniciar a câmera", messages[e.name] || "Tente novamente ou escolha uma foto da galeria para continuar.", "⚠️");
  }
}

const externalScriptPromises = new Map();
function loadExternalScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (externalScriptPromises.has(src)) return externalScriptPromises.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error("Biblioteca carregada sem inicializar: " + globalName));
    script.onerror = () => reject(new Error("Não foi possível carregar o recurso de leitura. Verifique a conexão e tente novamente."));
    document.head.appendChild(script);
  });
  externalScriptPromises.set(src, promise);
  promise.catch(() => externalScriptPromises.delete(src));
  return promise;
}

async function loadAI() {
  if (model) return model;
  if (aiLoadPromise) return aiLoadPromise;

  aiLoadPromise = (async () => {
    try {
      setStatus("Carregando IA visual...", "Baixando o modelo; na primeira vez pode demorar.", "🧠");
      await loadExternalScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js", "tf");
      await loadExternalScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js", "mobilenet");
      await tf.ready();

      // Alguns celulares têm WebGL indisponível ou instável. Tente primeiro a GPU
      // e, se falhar, tente CPU antes de declarar a IA indisponível.
      let backendError = null;
      for (const backend of ["webgl", "cpu"]) {
        try {
          const backendReady = await tf.setBackend(backend);
          if (!backendReady) throw new Error("Backend " + backend + " indisponível neste navegador.");
          await tf.ready();
          model = await mobilenet.load({ version: 2, alpha: 0.50 });
          break;
        } catch (e) {
          backendError = e;
          model = null;
          console.warn("Falha no backend " + backend + "; tentando alternativa.", e);
        }
      }

      if (!model) {
        throw backendError || new Error("Nenhum backend compatível (WebGL/CPU) ficou disponível.");
      }

      aiLoadError = "";
      setStatus("IA pronta", "Modelo carregado usando " + tf.getBackend() + ".", "🤖");
      return model;
    } catch (e) {
      console.error("Falha ao carregar IA:", e);
      aiLoadError = String(e?.message || e || "Erro desconhecido").slice(0, 180);
      setStatus("IA visual indisponível", aiLoadError || "Confira a conexão e tente novamente.", "⚠️");
      return null;
    } finally {
      aiLoadPromise = null;
    }
  })();

  return aiLoadPromise;
}

function setStatus(title, desc, icon) {
  const cameraRetry = document.getElementById("retryCameraBtn");
  const aiRetry = document.getElementById("retryAIButton");
  const barcodeRegister = document.getElementById("registerBarcodeProductBtn");
  const normalizedTitle = normalizeText(title);
  cameraRetry?.classList.toggle("hidden", !/(camera indisponivel|permissao de camera necessaria|nao foi possivel iniciar a camera|nao foi possivel iniciar o leitor)/.test(normalizedTitle));
  aiRetry?.classList.toggle("hidden", normalizedTitle !== "ia visual indisponivel");
  barcodeRegister?.classList.toggle("hidden", !pendingBarcodeCode || !/(produto fora do catalogo|produto sem nome|sem conexao|nao foi possivel consultar|open food facts temporariamente indisponivel|muitas consultas|busca demorou demais)/.test(normalizedTitle));
  document.getElementById("aiStatus").innerHTML = `
    <div class="flex gap-3 items-center">
      <div class="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-base">${icon}</div>
      <div>
        <p class="font-semibold text-slate-800">${esc(title)}</p>
        <p class="text-xs text-slate-400 mt-1">${esc(desc)}</p>
      </div>
    </div>
  `;
}

async function retryScannerCamera() {
  await stopBarcodeScanner();
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  await startCamera();
}

function showProgress(text, percent) {
  document.getElementById("analysisProgress").classList.remove("hidden");
  document.getElementById("analysisProgressBar").style.width = Math.max(0, Math.min(100, percent)) + "%";
  document.getElementById("analysisProgressText").textContent = text;
}

function hideProgress() {
  document.getElementById("analysisProgress").classList.add("hidden");
}

async function analyzeSelectedImage(file) {
  if (!file) return;
  if (!file.type?.startsWith("image/")) { setStatus("Arquivo não é uma imagem", "Escolha uma foto JPG, PNG ou outro formato de imagem.", "⚠️"); return; }
  if (file.size > 15 * 1024 * 1024) { setStatus("Foto muito grande", "Escolha uma imagem com até 15 MB para analisar neste aparelho.", "⚠️"); return; }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    await captureAndClassify(image);
  } catch (error) {
    console.error("Não foi possível abrir a foto selecionada:", error);
    setStatus("Não consegui abrir essa foto", "Escolha outra imagem ou tire uma nova foto com boa iluminação.", "⚠️");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function captureAndClassify(imageSource = null) {
  if (analyzing || scannerRunning) return;

  if (!model) await loadAI();

  const video = document.getElementById("aiCamera");
  const sourceWidth = imageSource?.naturalWidth || video.videoWidth;
  const sourceHeight = imageSource?.naturalHeight || video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    setStatus("Câmera ainda não está pronta", "Aguarde um segundo e tente novamente.", "⚠️");
    return;
  }

  analyzing = true;
  document.getElementById("predictionBox").classList.add("hidden");

  try {
    showProgress("Capturando imagem...", 10);
    setStatus(model ? "Analisando..." : "Lendo etiqueta...", model ? "Visão e leitura de texto estão analisando a imagem." : "A visão não carregou; vou tentar ler o texto da etiqueta em português.", model ? "🧠" : "🔤");

    const canvas = document.getElementById("aiCanvas");
    const vw = sourceWidth;
    const vh = sourceHeight;

    canvas.width = 640;
    canvas.height = 640;

    const ctx = canvas.getContext("2d");
    // A visão classifica um recorte central preenchendo o quadro: fotos verticais
    // da galeria não ficam reduzidas com grandes faixas brancas ao redor.
    const source = imageSource || video;
    const side = Math.min(vw, vh) * 0.72;
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    ctx.drawImage(source, sx, sy, side, side, 0, 0, 640, 640);

    const visualResults = [];
    if (model) {
      showProgress("IA visual identificando alimentos...", 25);
      const predictions = await model.classify(canvas, 20);
      visualResults.push(...processVisualPredictions(predictions));
    }

    showProgress("Lendo etiqueta em português...", 45);
    const labelCanvas = document.getElementById("labelCanvas");
    // Mantém o rótulo legível mesmo em celulares com captura de baixa resolução.
    const targetLongestSide = Math.min(1920, Math.max(1280, Math.max(vw, vh)));
    const labelScale = targetLongestSide / Math.max(vw, vh);
    const labelWidth = Math.round(vw * labelScale);
    const labelHeight = Math.round(vh * labelScale);
    labelCanvas.width = labelWidth;
    labelCanvas.height = labelHeight;
    const labelCtx = labelCanvas.getContext("2d");
    labelCtx.filter = "grayscale(1) contrast(1.45)";
    labelCtx.drawImage(imageSource || video, 0, 0, labelWidth, labelHeight);
    labelCtx.filter = "none";
    const ocrText = await runOCR(labelCanvas);
    const packageInfo = parseBrazilianLabel(ocrText);

    showProgress("Pesquisando possíveis produtos...", 65);
    const searchResults = await searchFoodDatabase(ocrText, visualResults, packageInfo);

    showProgress("Comparando os resultados...", 85);
    const finalResult = combineResults(visualResults, ocrText, searchResults, packageInfo);

    showProgress("Análise concluída.", 100);

    if (finalResult) {
      lastPrediction = finalResult;
      showPrediction(finalResult);
      setStatus(packageInfo.name ? "Etiqueta lida" : "Sugestão identificada", "Confira nome, peso e datas antes de salvar.", "✓");
    } else {
      setStatus("Não consegui identificar", "Centralize o alimento, use boa iluminação e tente outro ângulo. Para produtos embalados, mostre o nome do rótulo. Você também pode escolher outra foto ou cadastrar manualmente.", "⚠️");
    }
  } catch (e) {
    console.error("Erro na análise:", e);
    setStatus("Falha na análise", "Tente outra foto com boa luz e o nome do produto em foco. Se preferir, use o cadastro manual.", "⚠️");
  } finally {
    analyzing = false;
    setTimeout(hideProgress, 1200);
  }
}

/* ============================================================
   VISÃO COMPUTACIONAL
============================================================ */

function processVisualPredictions(predictions) {
  // MobileNet é um classificador genérico: mantenha apenas classes de alimentos
  // que o app sabe apresentar. Um limiar baixo preserva frutas/legumes menos
  // confiantes; o resultado continua sendo uma sugestão a ser revisada.
  const byName = new Map();
  predictions.forEach((prediction, index) => {
    const name = normalizeLabel(prediction.className);
    const probability = Number(prediction.probability) || 0;
    if (!name || probability < 0.01) return;

    const existing = byName.get(name);
    if (existing) existing.probability += probability;
    else byName.set(name, { original: prediction.className, name, probability, rank: index });
  });
  return [...byName.values()]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 8);
}

function normalizeLabel(label) {
  const text = normalizeText(label);
  const map = [
    ["granny smith", "Maçã"], ["apple", "Maçã"], ["banana", "Banana"], ["mango", "Manga"],
    ["watermelon", "Melancia"], ["cantaloupe", "Melão"], ["melon", "Melão"], ["jackfruit", "Jaca"],
    ["pomegranate", "Romã"], ["fig", "Figo"], ["avocado", "Abacate"], ["orange", "Laranja"],
    ["lemon", "Limão"], ["lime", "Limão"], ["pineapple", "Abacaxi"], ["strawberry", "Morango"],
    ["sweet potato", "Batata-doce"], ["potato", "Batata"], ["cassava", "Mandioca"], ["yuca", "Mandioca"],
    ["papaya", "Mamão"], ["pawpaw", "Mamão"], ["coconut", "Coco"], ["kiwi", "Kiwi"],
    ["pumpkin", "Abóbora"], ["squash", "Abóbora"], ["zucchini", "Abobrinha"], ["courgette", "Abobrinha"],
    ["eggplant", "Berinjela"], ["aubergine", "Berinjela"], ["cauliflower", "Couve-flor"], ["spinach", "Espinafre"],
    ["celery", "Aipo"], ["radish", "Rabanete"], ["beetroot", "Beterraba"], ["beet", "Beterraba"],
    ["french loaf", "Pão"], ["bagel", "Pão"], ["pretzel", "Pão"], ["mashed potato", "Batata"],
    ["raspberry", "Framboesa"], ["blueberry", "Mirtilo"], ["grape", "Uva"], ["pear", "Pera"],
    ["peach", "Pêssego"], ["plum", "Ameixa"], ["cherry", "Cereja"], ["tomato", "Tomate"],
    ["carrot", "Cenoura"], ["broccoli", "Brócolis"], ["cucumber", "Pepino"],
    ["onion", "Cebola"], ["garlic", "Alho"], ["corn", "Milho"], ["mushroom", "Cogumelo"],
    ["bell pepper", "Pimentão"], ["pepper", "Pimenta"], ["lettuce", "Alface"], ["cabbage", "Repolho"],
    ["milk", "Leite"], ["cheese", "Queijo"], ["egg", "Ovo"], ["bread", "Pão"], ["chicken", "Frango"],
    ["beef", "Carne bovina"], ["meat", "Carne"], ["fish", "Peixe"], ["rice", "Arroz"],
    ["pasta", "Macarrão"], ["pizza", "Pizza"], ["yogurt", "Iogurte"], ["sausage", "Linguiça"],
    ["chocolate", "Chocolate"], ["wafer", "Wafer"], ["biscuit", "Biscoito"], ["cookie", "Biscoito"],
    ["cereal", "Cereal"]
  ];
  const hit = map.find(([english]) => text.includes(english));
  return hit ? hit[1] : null;
}

/* ============================================================
   OCR
============================================================ */

async function runOCR(canvas) {
  try {
    await loadExternalScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", "Tesseract");
    const recognize = async image => {
      const result = await Tesseract.recognize(image, "por", {
        logger: message => {
          if (message.status === "recognizing text") {
            const progress = Math.round((message.progress || 0) * 100);
            showProgress("Lendo rótulo em português...", 45 + Math.round(progress * 0.15));
          }
        }
      });
      return { text: (result?.data?.text || "").trim(), confidence: Number(result?.data?.confidence) || 0 };
    };

    // O reconhecimento em duas versões reduz falhas com plástico brilhante,
    // letras pequenas e contraste baixo, sem enviar imagens para um servidor.
    const first = await recognize(canvas);
    if (first.confidence >= 72 && first.text.length >= 12) return first.text;
    const enhanced = document.createElement("canvas");
    enhanced.width = canvas.width;
    enhanced.height = canvas.height;
    const ctx = enhanced.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0);
    const image = ctx.getImageData(0, 0, enhanced.width, enhanced.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = Math.round(image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114);
      const adjusted = gray < 150 ? 0 : 255;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = adjusted;
    }
    ctx.putImageData(image, 0, 0);
    const second = await recognize(enhanced);
    return second.confidence > first.confidence || second.text.length > first.text.length ? second.text : first.text;
  } catch (e) {
    console.warn("OCR falhou:", e);
    return "";
  }
}

// Interpreta texto de etiquetas comuns no Brasil. A leitura é uma sugestão:
// datas e pesos precisam ser conferidos visualmente antes de salvar.
function parseBrazilianLabel(text) {
  const raw = String(text || "").replace(/\r/g, "\n");
  const normalized = normalizeText(raw);
  const datePattern = "(\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}|\\d{4}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{1,2})";

  function parseDate(value) {
    if (!value) return "";
    const parts = value.split(/[/.\\-]/).map(Number);
    let year, month, day;
    if (parts[0] > 31) [year, month, day] = parts;
    else {
      [day, month, year] = parts;
      if (year < 100) year += year >= 70 ? 1900 : 2000;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function findDate(labels) {
    for (const label of labels) {
      const pattern = new RegExp("(?:" + label + ")[^\\d]{0,24}" + datePattern, "i");
      const match = normalized.match(pattern);
      if (match) {
        const parsed = parseDate(match[1]);
        if (parsed) return parsed;
      }
    }
    return "";
  }

  const expiryDate = findDate(["validade", "val\\.?", "venc(?:imento)?", "consumir ate", "usar ate", "cons\\.? ate"]);
  const packedDate = findDate(["embalado em", "data de embalagem", "data embalagem", "emb\\.?", "fabricado em", "fab\\.?", "producao"]);

  const cuts = [
    ["paleta", "Paleta bovina"], ["acem", "Acém bovino"], ["patinho", "Patinho bovino"],
    ["maminha", "Maminha bovina"], ["picanha", "Picanha bovina"], ["alcatra", "Alcatra bovina"],
    ["contra\\s*file", "Contrafilé bovino"], ["fraldinha", "Fraldinha bovina"], ["musculo", "Músculo bovino"],
    ["coxao\\s*mole", "Coxão mole bovino"], ["coxao\\s*duro", "Coxão duro bovino"], ["lagarto", "Lagarto bovino"],
    ["cupim", "Cupim bovino"], ["costela", "Costela"], ["peito\\s*bovino", "Peito bovino"],
    ["pernil", "Pernil suíno"], ["lombo", "Lombo suíno"], ["bisteca", "Bisteca suína"],
    ["panceta", "Panceta suína"], ["sobrecoxa", "Sobrecoxa de frango"], ["coxa", "Coxa de frango"],
    ["peito\\s*de\\s*frango", "Peito de frango"], ["asa\\s*de\\s*frango", "Asa de frango"]
  ];
  let name = "";
  for (const [pattern, display] of cuts) {
    if (new RegExp("\\b" + pattern + "\\b", "i").test(normalized)) { name = display; break; }
  }

  // Produtos comuns em embalagens brasileiras que não são cortes de carne.
  // normalizeText remove acentos, por isso as expressões ficam sem diacríticos.
  if (!name) {
    const packagedFoods = [
      ["\\bmabel\\b", "Bolacha Mabel"],
      ["\\bmanteiga\\b", "Manteiga"], ["\\bmargarina\\b", "Margarina"],
      ["\\mbiscoito\\b|\\mbolacha\\b", "Biscoito"],
      ["\\bcream\\s*cracker\\b", "Biscoito cream cracker"],
      ["\\bwafer\\b", "Wafer"], ["\\bbolacha\\s*recheada\\b", "Bolacha recheada"],
      ["\\bleite\\b", "Leite"], ["\\biogurte\\b", "Iogurte"],
      ["\\bqueijo\\b", "Queijo"], ["\\bpao\\s*de\\s*forma\\b", "Pão de forma"]
    ];
    for (const [pattern, display] of packagedFoods) {
      if (new RegExp(pattern, "i").test(normalized)) { name = display; break; }
    }
  }

  const weightMatch = normalized.match(/\b(\d{1,3}(?:[.,]\d{1,3})?)\s*(kg|g)\b/i);
  let weight = "";
  if (weightMatch) {
    const rawNumber = weightMatch[1];
    const number = weightMatch[2].toLowerCase() === "g" && /[.,]\d{3}$/.test(rawNumber)
      ? rawNumber.replace(/[.,]/g, "")
      : rawNumber.replace(",", ".");
    weight = `${number} ${weightMatch[2].toLowerCase()}`;
  }

  return { name, weight, packedDate, expiryDate, rawText: cleanOCRText(raw) };
}

function cleanOCRText(text) {
  return String(text || "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchTerms(text) {
  const clean = cleanOCRText(text);
  if (!clean) return [];

  const words = clean
    .split(" ")
    .map(w => w.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter(w => w.length >= 3);

  const ignored = new Set([
    "com", "sem", "para", "por", "uma", "the", "and", "from", "net",
    "peso", "ml", "g", "kg", "produto", "alimento", "contém"
  ]);

  return [...new Set(words.filter(w => !ignored.has(w.toLowerCase())))].slice(0, 6);
}

/* ============================================================
   OPEN FOOD FACTS
============================================================ */

async function searchFoodDatabase(ocrText, visualResults, packageInfo = {}) {
  const candidates = [];
  // Em etiqueta de carne, o texto já identificado é fonte mais útil que busca
  // genérica: evita misturar um corte com produtos embalados aleatórios.
  if (packageInfo.name || packageInfo.weight || packageInfo.packedDate || packageInfo.expiryDate) return candidates;
  const searchTerms = extractSearchTerms(ocrText);

  for (const term of searchTerms.slice(0, 3)) {
    try {
      const url =
        OPEN_FOOD_FACTS_SEARCH +
        "?search_terms=" + encodeURIComponent(term) +
        "&search_simple=1&action=process&json=1&page_size=5";

      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();

      if (Array.isArray(data.products)) {
        data.products.forEach(product => {
          const name = product.product_name_pt || product.product_name || "";
          if (name) {
            candidates.push({
              name,
              brand: product.brands || "",
              image: product.image_front_url || product.image_url || "",
              source: "Open Food Facts",
              query: term
            });
          }
        });
      }
    } catch (e) {
      console.warn("Busca OFF falhou:", e);
    }
  }

  // Sem texto legível da embalagem, uma busca por rótulo visual (ex.: banana)
  // pode retornar produtos embalados aleatórios; não usamos isso como evidência.


  return candidates;
}

/* ============================================================
   COMBINAÇÃO DE RESULTADOS
============================================================ */

function combineResults(visualResults, ocrText, searchResults, packageInfo = {}) {
  const scores = {};

  function addScore(name, points, source) {
    if (!name) return;

    const clean = normalizeFoodName(name);
    if (!clean) return;

    if (!scores[clean]) {
      scores[clean] = {
        name: clean,
        score: 0,
        sources: []
      };
    }

    scores[clean].score += points;

    if (!scores[clean].sources.includes(source)) {
      scores[clean].sources.push(source);
    }
  }

  visualResults.slice(0, 5).forEach(result => {
    if (result.probability >= 0.01) {
      // A confiança do MobileNet costuma ser baixa em fotos reais de celular;
      // não descarte automaticamente a classe de alimento mais provável.
      const rankPenalty = Math.max(0, (result.rank || 0) - 1) * 2;
      const visualScore = Math.max(20, Math.round(18 + result.probability * 55 - rankPenalty));
      addScore(result.name, visualScore, "IA visual");
    }
  });

  if (packageInfo.name) addScore(packageInfo.name, 82, "Etiqueta em português");

  const ocr = cleanOCRText(ocrText).toLowerCase();

  if (ocr) {
    const knownProducts = [
      "trento", "oreo", "nutella", "nescau", "bis", "kitkat", "kit kat",
      "lacta", "garoto", "nestle", "bauducco", "toddy", "chokito",
      "sonho de valsa", "bombom", "mabel"
    ];

    knownProducts.forEach(product => {
      if (ocr.includes(product)) {
        let display = product;
        if (product === "kit kat") display = "KitKat";
        if (product === "nescau") display = "Nescau";
        if (product === "sonho de valsa") display = "Sonho de Valsa";
        if (product === "mabel") display = "Bolacha Mabel";
        addScore(display, 45, "Texto da embalagem");
      }
    });

    const foodNames = [
      ["melancia", "Melancia"], ["manga", "Manga"], ["laranja", "Laranja"], ["banana", "Banana"],
      ["maçã", "Maçã"], ["maca", "Maçã"], ["tomate", "Tomate"], ["limão", "Limão"], ["limao", "Limão"], ["abacaxi", "Abacaxi"],
      ["morango", "Morango"], ["cenoura", "Cenoura"], ["batata", "Batata"], ["abacate", "Abacate"],
      ["leite", "Leite"], ["queijo", "Queijo"], ["ovo", "Ovo"], ["arroz", "Arroz"],
      ["frango", "Frango"], ["pão", "Pão"], ["pao", "Pão"], ["macarrão", "Macarrão"],
      ["macarrao", "Macarrão"], ["manteiga", "Manteiga"], ["margarina", "Margarina"],
      ["bolacha", "Biscoito"], ["biscoito", "Biscoito"], ["cream cracker", "Biscoito cream cracker"],
      ["wafer", "Wafer"]
    ];

    foodNames.forEach(pair => {
      if (ocr.includes(pair[0])) addScore(pair[1], 40, "OCR");
    });

    const normalizedOCR = normalizeText(ocr);
    FOOD_CATALOG.forEach(item => {
      const phrase = normalizeText(item.name);
      if (phrase.length >= 5 && normalizedOCR.includes(phrase)) addScore(item.name, 42, "Vocabulário do catálogo");
    });
  }

  searchResults.forEach(product => {
    const normalized = normalizeFoodName(product.name);
    addScore(normalized, 35, "Banco de produtos");

    if (product.brand && ocr && ocr.includes(product.brand.toLowerCase())) {
      addScore(normalized, 20, "Marca compatível");
    }
  });

  const ranked = Object.values(scores).sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    if (packageInfo.weight || packageInfo.packedDate || packageInfo.expiryDate) {
      return {
        name: "Alimento para revisar",
        probability: 0.4,
        confidence: 40,
        sources: ["Etiqueta em português"],
        ocrText: cleanOCRText(ocrText),
        packageInfo,
        alternatives: []
      };
    }
    return null;
  }

  const best = ranked[0];
  const confidence = Math.min(98, Math.max(0, best.score));
  if (confidence < 18) return null;

  return {
    name: best.name,
    probability: confidence / 100,
    confidence,
    sources: best.sources,
    ocrText: cleanOCRText(ocrText),
    packageInfo,
    alternatives: ranked.slice(1, 4).map(x => ({
      name: x.name,
      score: x.score
    }))
  };
}

function normalizeFoodName(name) {
  const text = String(name || "").trim();
  if (!text) return "";

  const lower = normalizeText(text);
  const catalogMatch = getFoodCatalogEntry(text, false);
  if (catalogMatch) return catalogMatch.name;

  if (lower.includes("trento")) return "Trento";
  if (lower.includes("oreo")) return "Oreo";
  if (lower.includes("kit kat") || lower.includes("kitkat")) return "KitKat";
  if (lower.includes("nutella")) return "Nutella";
  if (lower.includes("nescau")) return "Nescau";
  if (lower.includes("mabel")) return "Bolacha Mabel";
  if (lower.includes("manteiga")) return "Manteiga";
  if (lower.includes("margarina")) return "Margarina";
  if (lower.includes("biscoito") || lower.includes("bolacha")) return "Biscoito";
  if (lower.includes("orange") || lower.includes("laranja")) return "Laranja";
  if (lower.includes("mango") || lower.includes("manga")) return "Manga";
  if (lower.includes("watermelon") || lower.includes("melancia")) return "Melancia";
  if (lower.includes("melon") || lower.includes("melao")) return "Melão";
  if (lower.includes("banana")) return "Banana";
  if (lower.includes("apple") || lower.includes("maca")) return "Maçã";
  if (lower.includes("tomato") || lower.includes("tomate")) return "Tomate";
  if (lower.includes("milk") || lower.includes("leite")) return "Leite";
  if (lower.includes("cheese") || lower.includes("queijo")) return "Queijo";
  if (lower.includes("egg") || lower.includes("ovo")) return "Ovo";
  if (lower.includes("chicken") || lower.includes("frango")) return "Frango";
  if (lower.includes("rice") || lower.includes("arroz")) return "Arroz";
  if (lower.includes("bread") || lower.includes("pao")) return "Pão";
  if (lower.includes("pasta") || lower.includes("macarrao")) return "Macarrão";

  return text.replace(/\s+/g, " ").slice(0, 80);
}

/* ============================================================
   RESULTADO DA IA
============================================================ */

function showPrediction(result) {
  document.getElementById("predictionBox").classList.remove("hidden");
  document.getElementById("predictionIcon").textContent = iconFor(result.name);
  document.getElementById("predictionName").textContent = result.name;
  const confidenceScore = Math.round(Number(result.confidence) || 0);
  const confidenceLabel = confidenceScore < 40
    ? "Correspondência baixa — revise com atenção"
    : confidenceScore < 65
      ? "Sugestão incerta — confirme antes de salvar"
      : "Sugestão para conferência";
  document.getElementById("predictionConfidence").textContent =
    `${confidenceLabel} · índice ${confidenceScore}% (não é probabilidade calibrada)`;

  const alternatives = document.getElementById("predictionAlternatives");
  alternatives.replaceChildren();
  const otherNames = (result.alternatives || []).map(item => String(item.name || "").trim()).filter(Boolean);
  if (otherNames.length) {
    alternatives.classList.remove("hidden");
    const label = document.createElement("p");
    label.className = "text-xs text-slate-500 mb-1";
    label.textContent = "Não parece certo? Escolha outra sugestão:";
    alternatives.appendChild(label);
    otherNames.forEach((name, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "inline-flex mr-1.5 mb-1.5 px-3 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700";
      button.textContent = name;
      button.addEventListener("click", () => selectPredictionAlternative(index));
      alternatives.appendChild(button);
    });
  } else {
    alternatives.classList.add("hidden");
  }

  let sourceText = "";

  const packageInfo = result.packageInfo || {};
  const packageRows = [
    packageInfo.weight ? `<span class="inline-flex bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">Peso: ${esc(packageInfo.weight)}</span>` : "",
    packageInfo.packedDate ? `<span class="inline-flex bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">Embalado: ${new Date(packageInfo.packedDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>` : "",
    packageInfo.expiryDate ? `<span class="inline-flex bg-green-50 border border-green-100 rounded-lg px-2.5 py-1">Validade lida: ${new Date(packageInfo.expiryDate + "T00:00:00").toLocaleDateString("pt-BR")} — confira</span>` : ""
  ].filter(Boolean);
  if (packageRows.length) sourceText += `<div class="flex flex-wrap gap-1.5 mb-2">${packageRows.join("")}</div>`;

  if (result.sources?.length) {
    sourceText += "🔎 Fontes: " + result.sources.map(esc).join(" • ");
  }

  if (result.ocrText) {
    sourceText += `<br>🔤 Texto lido: "${esc(result.ocrText.slice(0, 120))}"`;
  }

  document.getElementById("predictionSources").innerHTML = sourceText;
}

function selectPredictionAlternative(index) {
  if (!lastPrediction) return;
  const alternative = lastPrediction.alternatives?.[index];
  if (!alternative?.name) return;
  const remaining = lastPrediction.alternatives.filter((_, itemIndex) => itemIndex !== index);
  lastPrediction = {
    ...lastPrediction,
    name: alternative.name,
    confidence: Math.min(98, Math.max(0, Number(alternative.score) || 0)),
    sources: ["Outra possibilidade da análise"],
    alternatives: remaining
  };
  showPrediction(lastPrediction);
  setStatus("Sugestão alterada", "Confira o alimento e a validade antes de salvar.", "ℹ️");
}

function usePrediction() {
  const name = lastPrediction?.name || "Alimento";
  openManualForm(name);
}

// A identificação e a validade precisam ser conferidas antes de salvar.
function quickSavePrediction() {
  const name = lastPrediction?.name;
  if (!name) return;
  openManualForm(name);
  showToast("Confira o alimento e confirme a validade antes de salvar.", "ℹ️");
}

function openManualForm(name) {
  name = name || "";
  document.getElementById("productForm").classList.remove("hidden");
  document.getElementById("foodName").value = name;
  document.getElementById("foodQty").value = 1;
  document.getElementById("foodPrice").value = "";
  const matchingPrediction = name && lastPrediction?.name === name ? lastPrediction : null;
  document.getElementById("productForm").dataset.separateBatch = matchingPrediction ? "true" : "false";
  document.getElementById("foodExpiryConfirmed").checked = false;
  document.getElementById("foodPackageWeight").value = matchingPrediction?.packageInfo?.weight || "";
  document.getElementById("foodPackedDate").value = matchingPrediction?.packageInfo?.packedDate || "";
  const catalogItem = getFoodCatalogEntry(name, false);
  document.getElementById("foodStorage").value = catalogStorage(catalogItem);
  document.getElementById("foodUnit").value = catalogUnit(catalogItem);
  document.getElementById("foodCatalogHint").textContent = "";
  document.getElementById("foodOpened").checked = false;
  document.getElementById("foodOpenedDate").value = todayISO();
  document.getElementById("foodOpenedDateWrap").classList.add("hidden");
  document.getElementById("expiryDate").value = "";
  if (matchingPrediction?.packageInfo?.expiryDate) {
    document.getElementById("expiryDate").value = matchingPrediction.packageInfo.expiryDate;
  }

  document.getElementById("productForm").scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

function saveFood() {
  const name = document.getElementById("foodName").value.trim();
  const expiry = document.getElementById("expiryDate").value;
  const qty = document.getElementById("foodQty").value;
  const price = document.getElementById("foodPrice").value;
  const storage = document.getElementById("foodStorage").value;
  const weight = document.getElementById("foodPackageWeight").value.trim();
  const packedDate = document.getElementById("foodPackedDate").value;
  const unit = document.getElementById("foodUnit").value;
  const catalogItem = getFoodCatalogEntry(name, false);

  if (!name) {
    alert("Informe o nome do alimento.");
    return;
  }

  const separateBatch = document.getElementById("productForm").dataset.separateBatch === "true";
  const expirySource = expiry ? (document.getElementById("foodExpiryConfirmed").checked ? "label-confirmed" : "unconfirmed") : "unknown";
  if (!addOrMergeFood({ name, expiry, qty, price, storage, weight, packedDate, expirySource, unit, category: catalogItem?.category, separateBatch })) return;
  if (pendingBarcodeCode) {
    rememberBarcodeProduct(pendingBarcodeCode, { name, quantity: weight, categories: catalogItem?.category || "" });
    pendingBarcodeCode = "";
  }

  // Se o alimento estava pendente na lista de compras, marca como resolvido.
  const normalized = normalizeText(name);
  const pendingMatch = shoppingList.find(x => !x.checked && normalizeText(x.name) === normalized);
  if (pendingMatch) {
    shoppingList = shoppingList.filter(x => x.id !== pendingMatch.id);
    saveShoppingDB();
    renderShopping();
  }

  render();
  closeScanner();
  showScreen("pantry");
}

/* ============================================================
   CÓDIGO DE BARRAS
============================================================ */

async function startBarcodeScanner() {
  if (barcodeBusy) return;
  barcodeBusy = true;

  try {
    await stopBarcodeScanner();
    const video = document.getElementById("aiCamera");
    document.getElementById("predictionBox").classList.add("hidden");
    document.getElementById("productForm").classList.add("hidden");
    document.getElementById("manualBarcodeEntry").classList.add("hidden");

    // Usa o leitor nativo do navegador primeiro: evita abrir uma segunda
    // câmera e funciona melhor em celulares Chromium atuais.
    if ("BarcodeDetector" in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const wanted = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
        const formats = wanted.filter(format => supported.includes(format));
        if (formats.length) {
          nativeBarcodeDetector = new window.BarcodeDetector({ formats });
          if (!cameraStream) await startCamera();
          if (cameraStream && video.readyState < 2) {
            await new Promise(resolve => {
              video.addEventListener("loadeddata", resolve, { once: true });
              setTimeout(resolve, 1500);
            });
          }
          if (cameraStream && video.readyState >= 2) {
            document.getElementById("reader").classList.add("hidden");
            video.classList.remove("hidden");
            document.getElementById("cameraOverlay").classList.remove("hidden");
            document.getElementById("cameraOverlayHint").textContent = "Centralize o código de barras no quadro";
            scannerRunning = true;
            setStatus("Aponte para o código de barras", "Mantenha o código inteiro e centralizado. O produto será cadastrado quando for reconhecido.", "▦");
            scanBarcodeFrame();
            return;
          }
        }
      } catch (nativeError) {
        console.warn("Leitor nativo indisponível; usando leitor compatível.", nativeError);
        nativeBarcodeDetector = null;
      }
    }

    // Compatibilidade com navegadores sem BarcodeDetector (ex.: alguns iPhones).
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    await loadExternalScript("https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js", "Html5Qrcode");
    document.getElementById("aiCamera").classList.add("hidden");
    document.getElementById("cameraOverlay").classList.add("hidden");
    document.getElementById("reader").classList.remove("hidden");

    const supportedFormats = window.Html5QrcodeSupportedFormats;
    const formats = supportedFormats ? [
      supportedFormats.EAN_13, supportedFormats.EAN_8, supportedFormats.UPC_A,
      supportedFormats.UPC_E, supportedFormats.CODE_128, supportedFormats.CODE_39,
      supportedFormats.ITF
    ].filter(Number.isInteger) : undefined;
    html5Qr = new Html5Qrcode("reader", formats ? { formatsToSupport: formats, verbose: false } : { verbose: false });
    await html5Qr.start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: (width, height) => ({
          width: Math.floor(width * 0.94),
          height: Math.floor(Math.min(height * 0.42, Math.max(120, width * 0.28)))
        }),
        aspectRatio: 1.333,
        videoConstraints: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      },
      code => barcodeFound(code),
      () => {}
    );
    scannerRunning = true;
    document.getElementById("cameraOverlayHint").textContent = "Centralize o código de barras no quadro";
    setStatus("Aponte para o código de barras", "Mantenha o código inteiro e centralizado. O produto será cadastrado quando for reconhecido.", "▦");
  } catch (e) {
    console.error(e);
    await stopBarcodeScanner();
    setStatus("Não foi possível iniciar o leitor", "Confira a permissão da câmera. Você ainda pode digitar o código manualmente abaixo.", "⚠️");
  } finally {
    barcodeBusy = false;
  }
}

async function scanBarcodeFrame() {
  if (!scannerRunning || !nativeBarcodeDetector) return;
  const video = document.getElementById("aiCamera");
  if (!nativeBarcodeDetecting && video?.readyState >= 2) {
    nativeBarcodeDetecting = true;
    try {
      const results = await nativeBarcodeDetector.detect(video);
      if (results?.length && scannerRunning) {
        await barcodeFound(results[0].rawValue);
        return;
      }
    } catch (error) {
      console.debug("Tentando ler o próximo quadro do código de barras.", error);
    } finally {
      nativeBarcodeDetecting = false;
    }
  }
  if (scannerRunning) nativeBarcodeTimer = setTimeout(scanBarcodeFrame, 180);
}

async function stopBarcodeScanner() {
  scannerRunning = false;
  if (nativeBarcodeTimer) clearTimeout(nativeBarcodeTimer);
  nativeBarcodeTimer = null;
  nativeBarcodeDetector = null;
  nativeBarcodeDetecting = false;
  if (html5Qr) {
    try {
      if (html5Qr.getState?.() === 2) await html5Qr.stop();
    } catch (e) {}

    try {
      await html5Qr.clear();
    } catch (e) {}
  }

  html5Qr = null;

  const reader = document.getElementById("reader");
  const aiCamera = document.getElementById("aiCamera");
  const overlay = document.getElementById("cameraOverlay");

  if (reader) reader.classList.add("hidden");
  if (aiCamera) aiCamera.classList.remove("hidden");
  if (overlay) overlay.classList.remove("hidden");
  const hint = document.getElementById("cameraOverlayHint");
  if (hint) hint.textContent = "Centralize o alimento no quadro";
}

async function barcodeFound(code) {
  if (!code || barcodeLookupBusy) return;

  await stopBarcodeScanner();
  await lookupBarcode(code);
}

const LOCAL_BARCODE_ALIAS_KEY = "w2t-local-barcode-products-v1";

function readLocalBarcodeProducts() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_BARCODE_ALIAS_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) {
    console.warn("Não foi possível ler os códigos salvos neste aparelho.", error);
    return {};
  }
}

function rememberBarcodeProduct(code, product) {
  const normalizedCode = String(code || "").replace(/\D/g, "");
  const name = String(product?.name || product?.product_name_pt || product?.product_name || "").trim();
  if (!/^\d{8,14}$/.test(normalizedCode) || !name) return false;
  const products = readLocalBarcodeProducts();
  products[normalizedCode] = {
    name: name.slice(0, 100),
    quantity: String(product?.quantity || "").slice(0, 40),
    categories: String(product?.categories || "").slice(0, 100),
    savedAt: Date.now()
  };
  const entries = Object.entries(products).sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0)).slice(0, 250);
  try {
    localStorage.setItem(LOCAL_BARCODE_ALIAS_KEY, JSON.stringify(Object.fromEntries(entries)));
    return true;
  } catch (error) {
    console.warn("Não foi possível guardar o código neste aparelho.", error);
    return false;
  }
}

function registerProductForScannedBarcode() {
  if (!pendingBarcodeCode) return;
  document.getElementById("registerBarcodeProductBtn")?.classList.add("hidden");
  openManualForm("");
  document.getElementById("foodName")?.focus();
  showToast("Digite o nome do produto; o código ficará salvo somente neste aparelho.", "ℹ️");
}

function toggleManualBarcodeEntry() {
  const entry = document.getElementById("manualBarcodeEntry");
  entry?.classList.toggle("hidden");
  if (entry && !entry.classList.contains("hidden")) document.getElementById("barcodeManualInput")?.focus();
}

function barcodeStorageForProduct(product, name) {
  const label = normalizeText([
    name,
    product?.categories || "",
    ...(Array.isArray(product?.categories_tags) ? product.categories_tags : [])
  ].join(" "));
  if (/refrigerat|resfri|dairy|laticin|queijo|leite|iogurte|carne fresca|fresh meat|frozen|congelad/.test(label)) return "geladeira";
  return "despensa";
}

async function registerScannedProduct(product, code) {
  const name = String(product?.product_name_pt_br || product?.product_name_pt || product?.product_name || product?.product_name_en || "").trim();
  if (!name || name.length < 2) return false;

  const catalogItem = getFoodCatalogEntry(name, true);
  const storage = catalogItem ? catalogStorage(catalogItem) : barcodeStorageForProduct(product, name);
  const weight = String(product?.quantity || "").trim();
  // O código de barras não contém a validade impressa desta embalagem.
  // Mantemos cada pacote separado e deixamos a data em branco até conferência.
  if (!addOrMergeFood({ name, expiry: "", qty: 1, storage, weight, unit: catalogUnit(catalogItem), category: catalogItem?.category, separateBatch: true })) return false;
  rememberBarcodeProduct(code, { name, quantity: weight, categories: product?.categories || catalogItem?.category || "" });
  pendingBarcodeCode = "";

  const normalized = normalizeText(name);
  const pendingMatch = shoppingList.find(item => !item.checked && normalizeText(item.name) === normalized);
  if (pendingMatch) {
    shoppingList = shoppingList.filter(item => item.id !== pendingMatch.id);
    saveShoppingDB();
    renderShopping();
  }

  render();
  const brand = String(product?.brands || "").split(",")[0].trim();
  const label = brand && !normalizeText(name).includes(normalizeText(brand)) ? `${name} · ${brand}` : name;
  setStatus("Produto cadastrado na despensa", `${label}. Confira a embalagem e adicione a validade impressa no cartão do alimento.`, "✓");
  await closeScanner();
  showScreen("pantry");
  showToast(`${name} cadastrado. Adicione a validade impressa na embalagem.`, "✓");
  return true;
}

async function lookupBarcode(rawCode) {
  if (barcodeLookupBusy) return;
  const code = String(rawCode || "").replace(/\D/g, "");
  const input = document.getElementById("barcodeManualInput");
  if (input && rawCode) input.value = code;
  if (!/^\d{8,14}$/.test(code)) {
    setStatus("Confira o código", "Digite os 8 a 14 números do código de barras.", "🔢");
    input?.focus();
    return;
  }

  barcodeLookupBusy = true;
  pendingBarcodeCode = code;
  setStatus("Código reconhecido", "Buscando o nome do produto para cadastrar automaticamente...", "🔎");

  try {
    const localProduct = readLocalBarcodeProducts()[code];
    if (localProduct?.name) {
      setStatus("Produto salvo neste aparelho", `Encontrei “${localProduct.name}” no cadastro local.`, "✓");
      await registerScannedProduct({ product_name_pt: localProduct.name, quantity: localProduct.quantity, categories: localProduct.categories }, code);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let r;
    try {
      r = await fetch(
        OPEN_FOOD_FACTS_PRODUCT + encodeURIComponent(code) + ".json?fields=code,product_name,product_name_pt,product_name_pt_br,product_name_en,brands,quantity,categories,categories_tags&cc=br&lc=pt&tags_lc=pt",
        { signal: controller.signal, headers: { Accept: "application/json" } }
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!r.ok) {
      const error = new Error(`Open Food Facts respondeu com HTTP ${r.status}`);
      error.httpStatus = r.status;
      throw error;
    }

    const data = await r.json();

    if (data.product && (data.status === 1 || String(data.status || "").startsWith("success"))) {
      const p = data.product;
      if (await registerScannedProduct(p, code)) return;
      setStatus("Código reconhecido, produto sem nome", "Não há um nome cadastrado para este código no banco de produtos. Tente novamente ou use o cadastro manual.", "⚠️");
    } else {
      setStatus("Código reconhecido, produto fora do catálogo", "O código foi lido, mas não há nome no banco online. Cadastre o nome e ele ficará disponível neste aparelho nas próximas leituras.", "⚠️");
    }
  } catch (e) {
    console.error(e);
    if (e?.name === "AbortError") {
      setStatus("Busca demorou demais", "O banco não respondeu em 12 segundos. Tente novamente ou cadastre o nome para guardar este código neste aparelho.", "⚠️");
    } else if (e?.httpStatus === 429) {
      setStatus("Muitas consultas seguidas", "O banco limitou temporariamente as consultas. Aguarde um pouco ou cadastre o nome para guardar este código neste aparelho.", "⚠️");
    } else if (e?.httpStatus >= 500) {
      setStatus("Open Food Facts temporariamente indisponível", "O serviço respondeu com erro. Tente novamente mais tarde ou cadastre o nome para guardar este código neste aparelho.", "⚠️");
    } else if (e?.httpStatus === 404) {
      setStatus("Produto fora do catálogo", "O código não foi encontrado no banco online. Você pode cadastrar o nome e guardar o código neste aparelho.", "⚠️");
    } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("Sem conexão com a internet", "A consulta online precisa de internet. Você também pode cadastrar o nome e guardar o código neste aparelho.", "⚠️");
    } else {
      setStatus("Não foi possível consultar o banco", "A conexão com o serviço falhou ou foi bloqueada pelo navegador. Tente outra rede ou cadastre o nome para guardar este código neste aparelho.", "⚠️");
    }
  } finally {
    barcodeLookupBusy = false;
  }
}
