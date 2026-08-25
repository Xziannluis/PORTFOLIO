const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const projectGrid = document.querySelector("#project-grid");
const projectCount = document.querySelector("#project-count");
const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const navLinks = document.querySelectorAll(".desktop-nav a[href^='#'], .mobile-nav a[href^='#']");
const sections = [...document.querySelectorAll("main section[id]")];
const counters = document.querySelectorAll("[data-count]");
const filters = document.querySelectorAll(".filter");
const contactForm = document.querySelector(".contact-form");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in-view");
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.18 }
);

const countObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const target = entry.target;
      const endValue = Number(target.dataset.count);
      const duration = 900;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        target.textContent = Math.round(endValue * progress);
        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
      countObserver.unobserve(target);
    });
  },
  { threshold: 0.65 }
);

const observeReveals = () => {
  document.querySelectorAll(".reveal, .skill-row").forEach((item) => {
    if (!item.classList.contains("in-view")) revealObserver.observe(item);
  });
};

const observeCounters = () => {
  counters.forEach((counter) => countObserver.observe(counter));
};

const fetchProjects = async () => {
  const response = await fetch("/api/projects", { credentials: "same-origin" });
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.message || "Unable to load projects.");
  return payload.projects;
};

const renderProjects = async () => {
  if (!projectGrid) return;

  try {
    const projects = await fetchProjects();
    if (projectCount) {
      projectCount.dataset.count = String(projects.length);
      projectCount.textContent = "0";
    }

    if (!projects.length) {
      projectGrid.innerHTML = `<p class="admin-empty">No projects uploaded yet.</p>`;
      observeCounters();
      return;
    }

    projectGrid.innerHTML = projects
      .map((project, index) => {
        const categories = project.categories?.join(" ") || "web";
        const tags = project.tags || [];
        const number = String(index + 1).padStart(2, "0");

        return `
          <article class="project-card reveal" data-category="${escapeHtml(categories)}">
            <div class="project-top">
              <span>${number}</span>
              <a href="#contact" aria-label="Ask about ${escapeHtml(project.title)}">&nearr;</a>
            </div>
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.description)}</p>
            <div class="tags">
              ${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
          </article>
        `;
      })
      .join("");

    observeReveals();
    observeCounters();
  } catch (error) {
    projectGrid.innerHTML = `<p class="admin-empty">Projects could not load. Please try again shortly.</p>`;
  }
};

renderProjects();
observeReveals();

menuToggle?.addEventListener("click", () => {
  const isOpen = mobileNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

mobileNav?.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    mobileNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

const setActiveNav = () => {
  const current = sections.filter((section) => section.getBoundingClientRect().top <= 150).at(-1);

  if (!current) return;

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current.id}`);
  });
};

document.addEventListener("scroll", setActiveNav, { passive: true });
setActiveNav();

filters.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    const projects = document.querySelectorAll(".project-card");

    filters.forEach((item) => item.classList.toggle("active", item === button));
    projects.forEach((project) => {
      const categories = project.dataset.category.split(" ");
      project.classList.toggle("is-hidden", filter !== "all" && !categories.includes(filter));
    });
  });
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const status = contactForm.querySelector(".form-status");
  contactForm.reset();
  status.textContent = "Message preview sent. Connect this form to your backend when ready.";
});
