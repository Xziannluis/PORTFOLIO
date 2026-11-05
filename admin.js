const loginSection = document.querySelector("#admin-login");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#login-form");
const projectForm = document.querySelector("#project-form");
const projectList = document.querySelector("#admin-project-list");
const projectImageInput = document.querySelector("#project-image");
const projectImagePreview = document.querySelector("#project-image-preview");
const logoutButton = document.querySelector("#logout-button");
const resetButton = document.querySelector("#reset-projects");
let previewObjectUrl = null;

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

const imageToPayload = (file) =>
  new Promise((resolve, reject) => {
    if (file.size > 3 * 1024 * 1024) {
      reject(new Error("Project images must be 3 MB or smaller."));
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      reject(new Error("Choose a PNG, JPG, or WebP image."));
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const [, base64] = String(reader.result).split(",", 2);
      if (!base64) {
        reject(new Error("The selected image could not be read."));
        return;
      }
      resolve({ mimeType: file.type, base64 });
    });
    reader.addEventListener("error", () =>
      reject(new Error("The selected image could not be read."))
    );
    reader.readAsDataURL(file);
  });

const readApiResponse = async (response) => {
  const body = await response.text();
  let payload;

  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== "object") {
    throw new Error(
      `The server returned an invalid response (HTTP ${response.status}). Check the API deployment.`
    );
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || `Request failed (HTTP ${response.status}).`);
  }
  return payload;
};

const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  return readApiResponse(response);
};

const setLoggedIn = async (isLoggedIn) => {
  loginSection.classList.toggle("is-hidden", isLoggedIn);
  dashboard.classList.toggle("is-hidden", !isLoggedIn);
  if (isLoggedIn) await renderProjects();
};

const getProjects = async () => {
  const payload = await apiRequest("api/projects.php");
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
              ${
                project.image_url
                  ? `<img class="admin-project-image" src="${escapeHtml(project.image_url)}" alt="${escapeHtml(project.title)} screenshot" />`
                  : ""
              }
              <h3>${escapeHtml(project.title)}</h3>
              <p>${escapeHtml(project.description)}</p>
              <div class="tags">
                ${project.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
              </div>
              <label class="admin-project-image-upload">
                <span>Upload or replace screenshot</span>
                <input type="file" data-image-input="${project.id}" accept="image/png,image/jpeg,image/webp" />
              </label>
              <button class="btn secondary" type="button" data-image-save="${project.id}">Save screenshot</button>
            </div>
            <button class="btn danger" type="button" data-delete="${project.id}">Remove</button>
          </article>
        `
      )
      .join("");
  } catch (error) {
    projectList.innerHTML = `<p class="admin-empty">Projects could not load: ${escapeHtml(error.message)}</p>`;
  }
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const status = loginForm.querySelector(".form-status");

  try {
    await apiRequest("api/login.php", {
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
  const status = projectForm.querySelector(".form-status");
  const submitButton = projectForm.querySelector('button[type="submit"]');

  try {
    submitButton.disabled = true;
    status.textContent = "Adding project...";
    const imageFile = projectImageInput.files[0];
    const image = imageFile ? await imageToPayload(imageFile) : null;

    await apiRequest("api/create_project.php", {
      method: "POST",
      body: JSON.stringify({
        title: formData.get("title").trim(),
        description: formData.get("description").trim(),
        categories: categories.length ? categories : ["web"],
        tags,
        image,
      }),
    });

    projectForm.reset();
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    projectImagePreview.removeAttribute("src");
    projectImagePreview.classList.add("is-hidden");
    status.textContent = "Project added.";
    await renderProjects();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

projectImageInput.addEventListener("change", () => {
  const [file] = projectImageInput.files;
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
  projectImagePreview.classList.add("is-hidden");
  projectImagePreview.removeAttribute("src");
  if (!file) return;

  previewObjectUrl = URL.createObjectURL(file);
  projectImagePreview.src = previewObjectUrl;
  projectImagePreview.classList.remove("is-hidden");
});

projectList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    await apiRequest("api/delete_project.php", {
      method: "POST",
      body: JSON.stringify({ id: Number(deleteButton.dataset.delete) }),
    });

    await renderProjects();
    return;
  }

  const imageButton = event.target.closest("[data-image-save]");
  if (!imageButton) return;

  const projectId = Number(imageButton.dataset.imageSave);
  const imageInput = projectList.querySelector(
    `[data-image-input="${projectId}"]`
  );
  const [file] = imageInput.files;
  if (!file) {
    imageInput.focus();
    return;
  }

  try {
    imageButton.disabled = true;
    const image = await imageToPayload(file);
    await apiRequest("api/update_project_image.php", {
      method: "POST",
      body: JSON.stringify({ id: projectId, image }),
    });
    await renderProjects();
  } catch (error) {
    window.alert(error.message);
  } finally {
    imageButton.disabled = false;
  }
});

resetButton.addEventListener("click", async () => {
  await apiRequest("api/reset_projects.php", { method: "POST", body: "{}" });
  await renderProjects();
});

logoutButton.addEventListener("click", async () => {
  await apiRequest("api/logout.php", { method: "POST", body: "{}" });
  await setLoggedIn(false);
});

(async () => {
  try {
    const payload = await apiRequest("api/session.php");
    await setLoggedIn(payload.loggedIn);
  } catch {
    await setLoggedIn(false);
  }
})();
