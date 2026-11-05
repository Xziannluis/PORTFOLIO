# Netlify deployment

The PHP files in `api/` are for PHP-capable hosts. Netlify does not execute PHP,
so the Netlify site uses `netlify/functions/admin-api.mjs` for its API instead.
The existing `/api/*.php` URLs are rewritten to that function.

1. In Netlify, set `NEON_DATABASE_URL` to the connection string for the Neon
   database containing the `admins` and `projects` tables.
2. Set `ADMIN_SESSION_SECRET` to a new, random secret of at least 32 characters.
   You can generate one locally with
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Do not use the database password for this value.
3. Ensure the Neon database schema matches `database.sql`. Run that SQL in the
   Neon SQL Editor after deploying schema updates. It safely adds the
   `projects.image_url` column to an existing database.
4. Deploy the site again. Netlify installs the dependencies from `package.json`
   and publishes the function and rewrites.

Project screenshots can be uploaded for new or existing projects from the admin
page as PNG, JPG, or WebP files up to 3 MB. Netlify stores uploads in the
persistent `portfolio-project-images` Blobs store; no extra environment variable
is needed.

If the API reports a server error after deployment, open **Netlify > Functions >
admin-login > Logs** and inspect the failed invocation. A missing environment
variable is reported directly by the login form; database connection or schema
errors are recorded in the function logs. After changing environment variables,
redeploy so the function receives the updated values.

The admin password is the one associated with the `admin` row in the database.
If you do not know it, update `admins.password_hash` with a bcrypt hash generated
for a new password before signing in. Generate a hash locally with
`node --input-type=module -e "import bcrypt from 'bcryptjs'; console.log(await bcrypt.hash('CHOOSE_A_NEW_PASSWORD', 12))"`,
then update the row in the Neon SQL Editor.

For local development with XAMPP, the existing PHP API remains available.
The local `api/.env` file is excluded from Git. If it contained credentials that
were already pushed to a remote repository, rotate those credentials.
