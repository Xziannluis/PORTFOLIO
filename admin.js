const loginSection = document.querySelector("#admin-login");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#login-form");
const projectForm = document.querySelector("#project-form");
const projectList = document.querySelector("#admin-project-list");
const logoutButton = document.querySelector("#logout-button");
const resetButton = document.querySelector("#reset-projects");

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const normalizeList = (value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.message || "Request failed.");
  return payload;
};

const setLoggedIn = async (isLoggedIn) => {
  loginSection.classList.toggle("is-hidden", isLoggedIn);
  dashboard.classList.toggle("is-hidden", !isLoggedIn);
  if (isLoggedIn) await renderProjects();
};

const getProjects = async () => {
  const payload = await apiRequest("/api/projects");
  return payload.projects;
};

const renderProjects = async () => {
  try {
    const projects = await getProjects();

    if (!projects.length) {
      projectList.innerHTML = `<p class="admin-empty">No projects yet. Add one using the form.</p>`;
      return;
    }

    projectList.innerHTML = projects
      .map(
        (project, index) => `
          <article class="admin-project-item">
            <div>
              <span>${String(index + 1).padStart(2, "0")}</span>
              <h3>${escapeHtml(project.title)}</h3>
              <p>${escapeHtml(project.description)}</p>
              <div class="tags">
                ${project.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
            <button class="btn danger" type="button" data-delete="${project.id}">Remove</button>
          </article>
        `
      )
      .join("");
  } catch (error) {
    projectList.innerHTML = `<p class="admin-empty">Projects could not load. Please try again shortly.</p>`;
  }
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const status = loginForm.querySelector(".form-status");

  try {
    await apiRequest("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
      }),
    });
    status.textContent = "";
    loginForm.reset();
    await setLoggedIn(true);
  } catch (error) {
    status.textContent = error.message;
  }
});

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const categories = normalizeList(formData.get("categories").toLowerCase());
  const tags = normalizeList(formData.get("tags"));

  await apiRequest("/api/projects/create", {
    method: "POST",
    body: JSON.stringify({
      title: formData.get("title").trim(),
      description: formData.get("description").trim(),
      categories: categories.length ? categories : ["web"],
      tags,
    }),
  });

  projectForm.reset();
  await renderProjects();
});

projectList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  await apiRequest("/api/projects/delete", {
    method: "POST",
    body: JSON.stringify({ id: Number(button.dataset.delete) }),
  });

  await renderProjects();
});

resetButton.addEventListener("click", async () => {
  await apiRequest("/api/projects/reset", { method: "POST", body: "{}" });
  await renderProjects();
});

logoutButton.addEventListener("click", async () => {
  await apiRequest("/api/logout", { method: "POST", body: "{}" });
  await setLoggedIn(false);
});

(async () => {
  try {
    const payload = await apiRequest("/api/session");
    await setLoggedIn(payload.loggedIn);
  } catch {
    await setLoggedIn(false);
  }
})();
