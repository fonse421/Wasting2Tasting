/* Abertura animada: primeiro uso apenas, com pular, Escape e suporte a teclado. */
const WELCOME_INTRO_KEY = "w2t-welcome-intro-seen-v1";
let welcomeIntroKeyHandler = null;

function initWelcomeIntro() {
  const overlay = document.getElementById("welcomeIntro");
  if (!overlay) return;
  let seen = false;
  try { seen = localStorage.getItem(WELCOME_INTRO_KEY) === "1"; } catch (error) {}
  if (seen) return;

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("intro-open");
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  document.getElementById("welcomeStart")?.focus({ preventScroll: true });

  welcomeIntroKeyHandler = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      finishWelcomeIntro();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...overlay.querySelectorAll("button:not([disabled])")];
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };
  document.addEventListener("keydown", welcomeIntroKeyHandler);
}

function finishWelcomeIntro() {
  const overlay = document.getElementById("welcomeIntro");
  if (!overlay || overlay.classList.contains("hidden")) return;
  try { localStorage.setItem(WELCOME_INTRO_KEY, "1"); } catch (error) {}
  overlay.classList.add("is-leaving");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("intro-open");
  if (welcomeIntroKeyHandler) document.removeEventListener("keydown", welcomeIntroKeyHandler);
  welcomeIntroKeyHandler = null;
  window.setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("is-open", "is-leaving");
    document.querySelector("#home button")?.focus({ preventScroll: true });
  }, 400);
}
