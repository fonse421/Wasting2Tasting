# Wasting2Tasting

Despensa inteligente para reduzir o desperdício de comida. Funciona no navegador do celular e pode ser instalada como app (PWA).

**Site:** https://fonse421.github.io/Wasting2Tasting/

## O que faz

- Controla os alimentos da despensa e as datas de validade
- Escaneia produtos pela câmera (código de barras, leitura de rótulo por OCR e reconhecimento visual por IA)
- Mantém uma lista de compras
- **Modo resgate:** destaca o que vence primeiro e sugere receitas para aproveitar
- Catálogo de receitas com passo a passo
- Exportar e importar cópia de segurança dos dados (Perfil → Exportar dados)

## Privacidade

Todos os dados (despensa, lista de compras, histórico) ficam **somente no navegador** do aparelho, em `localStorage`. Nada é enviado para um servidor próprio, e os dados não sincronizam entre aparelhos. Por isso, faça a cópia de segurança de vez em quando.

Ao consultar um código de barras, o app usa a API pública do [Open Food Facts](https://world.openfoodfacts.org/).

## Como rodar

É um site estático, sem etapa de build obrigatória. Como usa service worker e câmera, abra por um servidor local (não direto pelo arquivo):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html` | O app inteiro (HTML, CSS e JavaScript) |
| `sw.js` | Service worker: guarda o app no cache para abrir rápido |
| `manifest.json` | Configuração de instalação como app |
| `icon-192.png`, `icon-512.png` | Ícones e logo |

## Bibliotecas externas (carregadas por CDN)

Tailwind CSS, TensorFlow.js + MobileNet (reconhecimento de imagem), Tesseract.js (OCR) e html5-qrcode (leitor de código de barras). O TensorFlow, o Tesseract e o leitor de código só são baixados quando o scanner é usado.
