// ============================================================================
// APP: Main SPA Router & Initialization
// ============================================================================

(() => {
  const themeKey = "portfolio-theme";

  function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (document.body) {
      document.body.setAttribute("data-theme", theme);
    }
    localStorage.setItem(themeKey, theme);
  }

  function updateThemeButtons(theme) {
    const isDark = theme === "dark";
    const toggles = document.querySelectorAll(".theme-toggle");

    toggles.forEach((toggle) => {
      toggle.classList.toggle("is-dark", isDark);
      toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");

      const icon = toggle.querySelector(".theme-thumb-icon");
      if (icon) {
        icon.className = isDark ? "fa-solid fa-moon theme-thumb-icon" : "fa-solid fa-sun theme-thumb-icon";
      }
    });
  }

  function initThemeToggle() {
    const savedTheme = localStorage.getItem(themeKey);
    const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : (preferredDark ? "dark" : "light");

    applyTheme(initialTheme);
    updateThemeButtons(initialTheme);

    document.querySelectorAll(".theme-toggle").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        updateThemeButtons(next);
      });
    });
  }

  function initActiveNav() {
    const page = document.body.getAttribute("data-page");
    if (!page) return;

    const activeLink = document.querySelector(`.nav-link[data-nav="${page}"]`);
    if (activeLink) {
      activeLink.classList.add("is-active");
    }
  }

  function setupSlideshow(root) {
    const slides = Array.from(root.querySelectorAll("[data-slide]"));
    const dots = Array.from(root.querySelectorAll("[data-slide-to]"));
    const prev = root.querySelector("[data-slide-prev]");
    const next = root.querySelector("[data-slide-next]");

    if (!slides.length) return;

    let index = slides.findIndex((slide) => slide.classList.contains("is-active"));
    if (index < 0) index = 0;

    const setSlide = (nextIndex) => {
      index = (nextIndex + slides.length) % slides.length;

      slides.forEach((slide, i) => {
        slide.classList.toggle("is-active", i === index);
        slide.setAttribute("aria-hidden", i === index ? "false" : "true");
      });

      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === index);
        dot.setAttribute("aria-current", i === index ? "true" : "false");
      });
    };

    let timer = null;

    const start = () => {
      if (timer) return;
      timer = window.setInterval(() => setSlide(index + 1), 6500);
    };

    const stop = () => {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    };

    prev?.addEventListener("click", () => setSlide(index - 1));
    next?.addEventListener("click", () => setSlide(index + 1));

    dots.forEach((dot) => {
      dot.addEventListener("click", () => {
        const dotIndex = Number(dot.getAttribute("data-slide-to"));
        if (!Number.isNaN(dotIndex)) {
          setSlide(dotIndex);
        }
      });
    });

    root.addEventListener("mouseenter", stop);
    root.addEventListener("mouseleave", start);
    root.addEventListener("focusin", stop);
    root.addEventListener("focusout", start);

    setSlide(index);
    start();
  }

  function initHeroSlideshows() {
    document.querySelectorAll("[data-slideshow]").forEach(setupSlideshow);
  }

  function init() {
    initThemeToggle();
    initActiveNav();
    initHeroSlideshows();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
