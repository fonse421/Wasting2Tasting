/* Abertura: mostra o monograma animado por um instante e sai quando o app está pronto.
   Aparece uma vez por visita; o resto do app espera o evento "w2t:splash-done". */
(function initSplash() {
  const el = document.getElementById("splash");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (el) el.remove();
    if (themeMeta) themeMeta.setAttribute("content", "#DDF5E6");
    window.dispatchEvent(new Event("w2t:splash-done"));
  };
  const onReady = fn => document.readyState === "complete" ? fn() : window.addEventListener("load", fn, { once: true });

  if (!el || document.documentElement.classList.contains("no-splash")) { onReady(finish); return; }

  try { sessionStorage.setItem("w2t-splash", "1"); } catch (error) {}
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MIN_VISIBLE = reduced ? 700 : 2100; // tempo para a animação ser lida
  const leave = () => { el.classList.add("leaving"); setTimeout(finish, reduced ? 220 : 400); };
  onReady(() => setTimeout(leave, Math.max(0, MIN_VISIBLE - performance.now())));
  setTimeout(leave, 6000); // segurança: nunca prende a pessoa na abertura
})();

// Executa fn quando a abertura terminar (ou já na hora, se ela não existir/já passou).
let splashIsDone = false;
window.addEventListener("w2t:splash-done", () => { splashIsDone = true; });
function onSplashDone(fn) {
  if (splashIsDone) fn(); else window.addEventListener("w2t:splash-done", fn, { once: true });
}
