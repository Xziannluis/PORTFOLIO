CREATE DATABASE IF NOT EXISTS portfolio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE portfolio_db;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  categories VARCHAR(255) NOT NULL,
  tags VARCHAR(255) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO admins (username, password_hash)
VALUES ('admin', '$2y$10$RYw6GDSUiV9CxZQrWd3xb.pTzFQRnZFEqptPzBZg2/f502sf.MEhq')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);

INSERT INTO projects (title, description, categories, tags, sort_order)
SELECT * FROM (
  SELECT
    'Student Services Portal',
    'A responsive portal for announcements, appointment requests, and document tracking with role-based views.',
    'web,database',
    'PHP,MySQL,JavaScript',
    1
  UNION ALL
  SELECT
    'Inventory Tracker',
    'CRUD dashboard with search, low-stock alerts, supplier records, and export-ready reports.',
    'database',
    'Python,SQL,Reports',
    2
  UNION ALL
  SELECT
    'Interactive Portfolio',
    'A compact portfolio interface with animated navigation, project filtering, and responsive content sections.',
    'ui,web',
    'HTML,CSS,UX',
    3
  UNION ALL
  SELECT
    'Capstone Task Board',
    'Kanban-style tracker for group requirements, sprints, deadlines, and progress visibility.',
    'web',
    'React,Firebase,Auth',
    4
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM projects);
