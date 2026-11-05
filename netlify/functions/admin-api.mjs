import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";

const COOKIE_NAME = "portfolio_admin";
const SESSION_DURATION_SECONDS = 12 * 60 * 60;
const MAX_PROJECT_IMAGE_BYTES = 3 * 1024 * 1024;

const defaultProjects = [
  [
    "Student Services Portal",
    "A responsive portal for announcements, appointment requests, and document tracking with role-based views.",
    "web,database",
    "PHP,MySQL,JavaScript",
    1,
  ],
  [
    "Inventory Tracker",
    "CRUD dashboard with search, low-stock alerts, supplier records, and export-ready reports.",
    "database",
    "Python,SQL,Reports",
    2,
  ],
  [
    "Interactive Portfolio",
    "A compact portfolio interface with animated navigation, project filtering, and responsive content sections.",
    "ui,web",
    "HTML,CSS,UX",
    3,
  ],
  [
    "Capstone Task Board",
    "Kanban-style tracker for group requirements, sprints, deadlines, and progress visibility.",
    "web",
    "React,Firebase,Auth",
    4,
  ],
];

const response = (payload, statusCode = 200, headers = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  },
  body: JSON.stringify(payload),
});

const getSql = () => {
  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing NEON_DATABASE_URL.");
  return neon(databaseUrl);
};

const getSessionSecret = () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  }
  return secret;
};

const signSession = (admin) => {
  const payload = Buffer.from(
    JSON.stringify({
      id: Number(admin.id),
      username: admin.username,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
    })
  ).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
};

const readSession = (event) => {
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  if (!cookie) return null;

  const token = cookie.slice(COOKIE_NAME.length + 1);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      !Number.isInteger(session.id) ||
      typeof session.username !== "string" ||
      !Number.isInteger(session.expiresAt) ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

const sessionCookie = (value, maxAge) =>
  `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const readBody = (event) => {
  try {
    const parsed = JSON.parse(event.body || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const splitList = (value) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const projectFromRow = (row) => ({
  id: Number(row.id),
  title: row.title,
  description: row.description,
  categories: splitList(row.categories),
  tags: splitList(row.tags),
  image_url:
    row.image_url ||
    (row.has_image ? `/api/project-image.php?id=${Number(row.id)}` : null),
});

const parseProjectImage = (image) => {
  if (image == null) return null;
  if (
    typeof image !== "object" ||
    typeof image.mimeType !== "string" ||
    typeof image.base64 !== "string"
  ) {
    throw new Error("Choose a valid PNG, JPG, or WebP project image.");
  }

  const extensions = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const extension = extensions[image.mimeType];
  if (!extension) {
    throw new Error("Project images must be PNG, JPG, or WebP.");
  }
  if (
    !image.base64 ||
    image.base64.length > Math.ceil(MAX_PROJECT_IMAGE_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      image.base64
    )
  ) {
    throw new Error("Project images must be 3 MB or smaller.");
  }

  const bytes = Buffer.from(image.base64, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_PROJECT_IMAGE_BYTES ||
    bytes.toString("base64") !== image.base64
  ) {
    throw new Error("Project images must be valid files no larger than 3 MB.");
  }

  const isPng = bytes.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  const isJpeg = bytes.length >= 3 && bytes.subarray(0, 3).equals(
    Buffer.from([0xff, 0xd8, 0xff])
  );
  const isWebp =
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (
    (image.mimeType === "image/png" && !isPng) ||
    (image.mimeType === "image/jpeg" && !isJpeg) ||
    (image.mimeType === "image/webp" && !isWebp)
  ) {
    throw new Error("The selected file contents do not match its image type.");
  }

  return {
    mimeType: image.mimeType,
    base64: image.base64,
  };
};

const requirePost = (event) =>
  event.httpMethod === "POST"
    ? null
    : response({ ok: false, message: "Method not allowed." }, 405, {
        Allow: "POST",
      });

const requireAdmin = (event) => {
  const admin = readSession(event);
  return admin
    ? { admin }
    : {
        error: response(
          { ok: false, message: "Your session has expired. Please sign in again." },
          401
        ),
      };
};

export const handler = async (event) => {
  const endpoint = event.queryStringParameters?.endpoint;

  try {
    if (endpoint === "project_image") {
      if (event.httpMethod !== "GET") {
        return response({ ok: false, message: "Method not allowed." }, 405, {
          Allow: "GET",
        });
      }

      const id = Number(event.queryStringParameters?.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return response({ ok: false, message: "Project image not found." }, 404);
      }
      const sql = getSql();
      const [image] = await sql`
        SELECT
          replace(encode(image_data, 'base64'), chr(10), '') AS base64,
          image_mime_type
        FROM projects
        WHERE id = ${id} AND image_data IS NOT NULL
      `;
      if (!image?.base64) {
        return response({ ok: false, message: "Project image not found." }, 404);
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": image.image_mime_type,
          "Cache-Control": "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
        body: image.base64,
        isBase64Encoded: true,
      };
    }

    if (endpoint === "projects") {
      if (event.httpMethod !== "GET") {
        return response({ ok: false, message: "Method not allowed." }, 405, {
          Allow: "GET",
        });
      }

      const sql = getSql();
      const rows = await sql`
        SELECT
          id, title, description, categories, tags, image_url,
          image_data IS NOT NULL AS has_image
        FROM projects
        ORDER BY sort_order ASC, id ASC
      `;
      return response({ ok: true, projects: rows.map(projectFromRow) });
    }

    if (endpoint === "session") {
      if (event.httpMethod !== "GET") {
        return response({ ok: false, message: "Method not allowed." }, 405, {
          Allow: "GET",
        });
      }
      const admin = readSession(event);
      return response({
        ok: true,
        loggedIn: Boolean(admin),
        admin: admin ? { id: admin.id, username: admin.username } : null,
      });
    }

    if (endpoint === "login") {
      const methodError = requirePost(event);
      if (methodError) return methodError;

      const data = readBody(event);
      if (!data) {
        return response({ ok: false, message: "Request body must be valid JSON." }, 400);
      }

      const username =
        typeof data.username === "string" ? data.username.trim() : "";
      const password = typeof data.password === "string" ? data.password : "";
      if (!username || !password) {
        return response(
          { ok: false, message: "Username and password are required." },
          422
        );
      }

      const sql = getSql();
      const [admin] = await sql`
        SELECT id, username, password_hash
        FROM admins
        WHERE username = ${username}
        LIMIT 1
      `;
      if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
        return response({ ok: false, message: "Invalid admin account." }, 401);
      }

      return response(
        {
          ok: true,
          admin: { id: Number(admin.id), username: admin.username },
        },
        200,
        {
          "Set-Cookie": sessionCookie(
            signSession(admin),
            SESSION_DURATION_SECONDS
          ),
        }
      );
    }

    if (endpoint === "logout") {
      const methodError = requirePost(event);
      if (methodError) return methodError;
      return response({ ok: true }, 200, {
        "Set-Cookie": sessionCookie("", 0),
      });
    }

    if (endpoint === "create_project") {
      const methodError = requirePost(event);
      if (methodError) return methodError;
      const auth = requireAdmin(event);
      if (auth.error) return auth.error;

      const data = readBody(event);
      if (!data) {
        return response({ ok: false, message: "Request body must be valid JSON." }, 400);
      }
      const title = typeof data.title === "string" ? data.title.trim() : "";
      const description =
        typeof data.description === "string" ? data.description.trim() : "";
      const categories = Array.isArray(data.categories)
        ? data.categories
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      const tags = Array.isArray(data.tags)
        ? data.tags
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      let image;

      if (!title || !description) {
        return response(
          { ok: false, message: "Title and description are required." },
          422
        );
      }

      try {
        image = parseProjectImage(data.image);
      } catch (error) {
        return response(
          { ok: false, message: error.message },
          422
        );
      }

      const sql = getSql();
      const [order] = await sql`
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
        FROM projects
      `;
      const [project] = await sql`
        INSERT INTO projects
          (title, description, categories, tags, image_url, image_data, image_mime_type, sort_order)
        VALUES (
          ${title},
          ${description},
          ${categories.length ? categories.join(",") : "web"},
          ${tags.join(",")},
          NULL,
          decode(${image ? image.base64 : null}, 'base64'),
          ${image ? image.mimeType : null},
          ${Number(order.next_order)}
        )
        RETURNING id
      `;
      return response({ ok: true, id: Number(project.id) });
    }

    if (endpoint === "delete_project") {
      const methodError = requirePost(event);
      if (methodError) return methodError;
      const auth = requireAdmin(event);
      if (auth.error) return auth.error;

      const data = readBody(event);
      const id = Number(data?.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return response({ ok: false, message: "Valid project id is required." }, 422);
      }

      const sql = getSql();
      await sql`DELETE FROM projects WHERE id = ${id}`;
      return response({ ok: true });
    }

    if (endpoint === "update_project_image") {
      const methodError = requirePost(event);
      if (methodError) return methodError;
      const auth = requireAdmin(event);
      if (auth.error) return auth.error;

      const data = readBody(event);
      const id = Number(data?.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return response({ ok: false, message: "Valid project id is required." }, 422);
      }

      let image;
      try {
        image = parseProjectImage(data?.image);
      } catch (error) {
        return response({ ok: false, message: error.message }, 422);
      }

      const sql = getSql();
      const [project] = await sql`SELECT id FROM projects WHERE id = ${id}`;
      if (!project) {
        return response({ ok: false, message: "Project not found." }, 404);
      }

      await sql`
        UPDATE projects
        SET image_url = NULL,
            image_data = decode(${image ? image.base64 : null}, 'base64'),
            image_mime_type = ${image ? image.mimeType : null}
        WHERE id = ${id}
      `;
      return response({ ok: true });
    }

    if (endpoint === "reset_projects") {
      const methodError = requirePost(event);
      if (methodError) return methodError;
      const auth = requireAdmin(event);
      if (auth.error) return auth.error;

      const sql = getSql();
      await sql.transaction([
        sql`DELETE FROM projects`,
        ...defaultProjects.map(
          ([title, description, categories, tags, sortOrder]) =>
            sql`
              INSERT INTO projects
                    (title, description, categories, tags, image_url, image_data, image_mime_type, sort_order)
                  VALUES
                    (${title}, ${description}, ${categories}, ${tags}, NULL, NULL, NULL, ${sortOrder})
                `
        ),
      ]);
      return response({ ok: true });
    }

    return response({ ok: false, message: "API endpoint not found." }, 404);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    console.error(
      "Admin API request failed:",
      errorCode ? `${errorCode}: ${errorMessage}` : errorMessage
    );

    if (errorMessage === "Missing NEON_DATABASE_URL.") {
      return response(
        {
          ok: false,
          message:
            "Server setup incomplete: add NEON_DATABASE_URL in Netlify environment variables, then redeploy.",
        },
        500
      );
    }

    if (errorMessage.startsWith("ADMIN_SESSION_SECRET")) {
      return response(
        {
          ok: false,
          message:
            "Server setup incomplete: set ADMIN_SESSION_SECRET to a random value of at least 32 characters, then redeploy.",
        },
        500
      );
    }

    if (
      errorCode === "42703" ||
      /column ["']?image_(?:url|data|mime_type)["']? does not exist/i.test(
        errorMessage
      )
    ) {
      return response(
        {
          ok: false,
          message:
            "The database needs the project image columns. In Neon SQL Editor, run: ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT; ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_data BYTEA; ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_mime_type VARCHAR(32);",
        },
        500
      );
    }

    return response(
      {
        ok: false,
        message:
          "The server could not complete the request. Check the Netlify Function logs for the cause.",
      },
      500
    );
  }
};
