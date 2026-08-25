import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";

type ProjectInput = {
  title?: unknown;
  description?: unknown;
  categories?: unknown;
  tags?: unknown;
};

type StoredProject = {
  id: number;
  title: string;
  description: string;
  categories: string[];
  tags: string[];
  sortOrder: number;
  createdAt: string;
};

type AdminConfig = {
  username: string;
  password?: string;
  passwordHash?: string;
  sessionSecret: string;
};

type SessionPayload = {
  username: string;
  expiresAt: number;
};

const sessionCookie = "portfolio_admin_session";
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7;
const projectsKey = "projects-v1";
const portfolioStore = getStore({ name: "portfolio-data", consistency: "strong" });

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function methodNotAllowed() {
  return json({ ok: false, message: "Method not allowed." }, 405);
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function serializeProject(project: StoredProject) {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    categories: project.categories,
    tags: project.tags,
  };
}

function defaultProjects(): StoredProject[] {
  const createdAt = new Date().toISOString();

  return [
    {
      id: 1,
      title: "Student Services Portal",
      description:
        "A responsive portal for announcements, appointment requests, and document tracking with role-based views.",
      categories: ["web", "database"],
      tags: ["PHP", "MySQL", "JavaScript"],
      sortOrder: 1,
      createdAt,
    },
    {
      id: 2,
      title: "Inventory Tracker",
      description:
        "CRUD dashboard with search, low-stock alerts, supplier records, and export-ready reports.",
      categories: ["database"],
      tags: ["Python", "SQL", "Reports"],
      sortOrder: 2,
      createdAt,
    },
    {
      id: 3,
      title: "Interactive Portfolio",
      description:
        "A compact portfolio interface with animated navigation, project filtering, and responsive content sections.",
      categories: ["ui", "web"],
      tags: ["HTML", "CSS", "UX"],
      sortOrder: 3,
      createdAt,
    },
    {
      id: 4,
      title: "Capstone Task Board",
      description:
        "Kanban-style tracker for group requirements, sprints, deadlines, and progress visibility.",
      categories: ["web"],
      tags: ["React", "Firebase", "Auth"],
      sortOrder: 4,
      createdAt,
    },
  ];
}

async function readProjects() {
  const storedProjects = (await portfolioStore.get(projectsKey, {
    type: "json",
  })) as StoredProject[] | null;

  if (Array.isArray(storedProjects)) {
    return storedProjects.sort((first, second) => first.sortOrder - second.sortOrder || first.id - second.id);
  }

  const projects = defaultProjects();
  await portfolioStore.setJSON(projectsKey, projects);
  return projects;
}

async function writeProjects(projects: StoredProject[]) {
  await portfolioStore.setJSON(projectsKey, projects);
}

function getAdminConfig(): AdminConfig | null {
  const username = Netlify.env.get("PORTFOLIO_ADMIN_USERNAME")?.trim() || "admin";
  const passwordHash = Netlify.env.get("PORTFOLIO_ADMIN_PASSWORD_HASH")?.trim();
  const password = Netlify.env.get("PORTFOLIO_ADMIN_PASSWORD");
  const sessionSecret =
    Netlify.env.get("PORTFOLIO_SESSION_SECRET")?.trim() || passwordHash || password;

  if (!sessionSecret || (!passwordHash && !password)) return null;
  return { username, password, passwordHash, sessionSecret };
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function signSession(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(admin: AdminConfig) {
  const payload = Buffer.from(
    JSON.stringify({ username: admin.username, expiresAt: Date.now() + sessionDurationMs }),
  ).toString("base64url");
  return `${payload}.${signSession(payload, admin.sessionSecret)}`;
}

function readSessionToken(token: string, admin: AdminConfig) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  if (!safeEqual(signature, signSession(payload, admin.sessionSecret))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (session.username !== admin.username || session.expiresAt <= Date.now()) return null;
    return { username: session.username };
  } catch {
    return null;
  }
}

function isSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

async function readBody(req: Request) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getAdmin(context: Context) {
  const token = context.cookies.get(sessionCookie);
  const admin = getAdminConfig();
  if (!token || !admin) return null;
  return readSessionToken(token, admin);
}

function requireAdmin(context: Context) {
  const admin = getAdmin(context);
  return admin ? { admin } : { response: json({ ok: false, message: "Unauthorized." }, 401) };
}

async function listProjects(req: Request) {
  if (req.method !== "GET") return methodNotAllowed();
  const projects = await readProjects();
  return json({ ok: true, projects: projects.map(serializeProject) });
}

async function login(req: Request, context: Context) {
  if (req.method !== "POST") return methodNotAllowed();
  if (!isSameOrigin(req)) return json({ ok: false, message: "Invalid request origin." }, 403);

  const admin = getAdminConfig();
  if (!admin) {
    return json({ ok: false, message: "The admin account has not been configured." }, 503);
  }

  const data = await readBody(req);
  const username = String(data.username ?? "").trim();
  const password = String(data.password ?? "");

  if (!username || !password) {
    return json({ ok: false, message: "Username and password are required." }, 422);
  }

  const passwordMatches = admin.passwordHash
    ? await bcrypt.compare(password, admin.passwordHash)
    : safeEqual(password, admin.password as string);

  if (username !== admin.username || !passwordMatches) {
    return json({ ok: false, message: "Invalid admin account." }, 401);
  }

  const expiresAt = new Date(Date.now() + sessionDurationMs);
  context.cookies.set({
    name: sessionCookie,
    value: createSessionToken(admin),
    path: "/",
    expires: expiresAt,
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "Strict",
  });

  return json({ ok: true, admin: { username: admin.username } });
}

function logout(req: Request, context: Context) {
  if (req.method !== "POST") return methodNotAllowed();
  if (!isSameOrigin(req)) return json({ ok: false, message: "Invalid request origin." }, 403);

  context.cookies.delete(sessionCookie);
  return json({ ok: true });
}

function session(req: Request, context: Context) {
  if (req.method !== "GET") return methodNotAllowed();
  const admin = getAdmin(context);
  return json({ ok: true, loggedIn: Boolean(admin), admin });
}

async function createProject(req: Request, context: Context) {
  if (req.method !== "POST") return methodNotAllowed();
  if (!isSameOrigin(req)) return json({ ok: false, message: "Invalid request origin." }, 403);
  const auth = requireAdmin(context);
  if ("response" in auth) return auth.response;

  const data = (await readBody(req)) as ProjectInput;
  const title = String(data.title ?? "").trim();
  const description = String(data.description ?? "").trim();
  const categories = normalizeList(data.categories);
  const tags = normalizeList(data.tags);

  if (!title || !description) {
    return json({ ok: false, message: "Title and description are required." }, 422);
  }

  const projects = await readProjects();
  const nextId = projects.reduce((highest, project) => Math.max(highest, project.id), 0) + 1;
  const nextSortOrder = projects.reduce((highest, project) => Math.max(highest, project.sortOrder), 0) + 1;
  projects.push({
    id: nextId,
    title,
    description,
    categories: categories.length ? categories : ["web"],
    tags,
    sortOrder: nextSortOrder,
    createdAt: new Date().toISOString(),
  });
  await writeProjects(projects);

  return json({ ok: true, id: nextId }, 201);
}

async function deleteProject(req: Request, context: Context) {
  if (req.method !== "POST") return methodNotAllowed();
  if (!isSameOrigin(req)) return json({ ok: false, message: "Invalid request origin." }, 403);
  const auth = requireAdmin(context);
  if ("response" in auth) return auth.response;

  const data = await readBody(req);
  const id = Number(data.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ ok: false, message: "Valid project id is required." }, 422);
  }

  const projects = await readProjects();
  await writeProjects(projects.filter((project) => project.id !== id));
  return json({ ok: true });
}

async function resetProjects(req: Request, context: Context) {
  if (req.method !== "POST") return methodNotAllowed();
  if (!isSameOrigin(req)) return json({ ok: false, message: "Invalid request origin." }, 403);
  const auth = requireAdmin(context);
  if ("response" in auth) return auth.response;

  await writeProjects(defaultProjects());
  return json({ ok: true });
}

export default async function handler(req: Request, context: Context) {
  try {
    const endpoint = new URL(req.url).pathname.replace(/^\/api\/?/, "");

    switch (endpoint) {
      case "projects":
        return await listProjects(req);
      case "login":
        return await login(req, context);
      case "logout":
        return logout(req, context);
      case "session":
        return session(req, context);
      case "projects/create":
        return await createProject(req, context);
      case "projects/delete":
        return await deleteProject(req, context);
      case "projects/reset":
        return await resetProjects(req, context);
      default:
        return json({ ok: false, message: "Not found." }, 404);
    }
  } catch {
    return json({ ok: false, message: "The request could not be completed." }, 500);
  }
}

export const config: Config = {
  path: "/api/*",
};
