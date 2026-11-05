<?php
declare(strict_types=1);

$sessionPath = dirname(__DIR__) . '/tmp_sessions';
if (!is_dir($sessionPath)) {
    mkdir($sessionPath, 0775, true);
}
session_save_path($sessionPath);
session_start();

header('Content-Type: application/json; charset=utf-8');

// --- tiny .env loader (no composer needed) ---
// Put a file named ".env" next to this one (same folder as bootstrap.php,
// or adjust the path below), and make sure ".env" is in .gitignore.
function load_env(string $path): void
{
    if (!is_file($path)) {
        return;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if (getenv($key) === false) {
            putenv("$key=$value");
        }
    }
}

load_env(__DIR__ . '/.env');

const DB_HOST = null; // unused now, kept only so old references don't fatal-error
const DB_NAME = null;
const DB_USER = null;
const DB_PASS = null;

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    // Get this from your Neon dashboard -> "Connection string" tab.
    // Store it in api/.env as:
    // NEON_DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-shiny-grass-ax2ae9ad-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require
    $url = getenv('NEON_DATABASE_URL');
    if ($url === false || $url === '') {
        json_response(['ok' => false, 'message' => 'Database not configured (missing NEON_DATABASE_URL).'], 500);
    }

    $parts = parse_url($url);
    $dsn = sprintf(
        'pgsql:host=%s;port=%s;dbname=%s;sslmode=require',
        $parts['host'],
        $parts['port'] ?? 5432,
        ltrim($parts['path'], '/')
    );

    $pdo = new PDO($dsn, $parts['user'], $parts['pass'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    return $pdo;
}

function require_admin(): void
{
    if (empty($_SESSION['admin_id'])) {
        json_response(['ok' => false, 'message' => 'Unauthorized.'], 401);
    }
}

function input_json(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);

    return is_array($data) ? $data : [];
}

function split_list(string $value): array
{
    $items = array_map('trim', explode(',', $value));
    return array_values(array_filter($items, static fn ($item) => $item !== ''));
}

function project_from_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'description' => $row['description'],
        'categories' => split_list($row['categories']),
        'tags' => split_list($row['tags']),
        'image_url' => $row['image_url'] ?? null,
    ];
}

function save_project_image(?array $image): ?string
{
    if ($image === null) {
        return null;
    }

    $mimeTypes = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/webp' => 'webp',
    ];
    $mimeType = $image['mimeType'] ?? '';
    $base64 = $image['base64'] ?? '';
    if (!isset($mimeTypes[$mimeType]) || !is_string($base64) || $base64 === '') {
        json_response(['ok' => false, 'message' => 'Choose a valid PNG, JPG, or WebP project image.'], 422);
    }

    if (strlen($base64) > 4 * 1024 * 1024) {
        json_response(['ok' => false, 'message' => 'Project images must be 3 MB or smaller.'], 422);
    }

    $bytes = base64_decode($base64, true);
    if ($bytes === false || strlen($bytes) > 3 * 1024 * 1024) {
        json_response(['ok' => false, 'message' => 'Project images must be valid files no larger than 3 MB.'], 422);
    }

    $imageInfo = getimagesizefromstring($bytes);
    if ($imageInfo === false || $imageInfo['mime'] !== $mimeType) {
        json_response(['ok' => false, 'message' => 'The selected file contents do not match its image type.'], 422);
    }

    $directory = dirname(__DIR__) . '/assets/project-uploads';
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create the project image directory.');
    }

    $filename = bin2hex(random_bytes(16)) . '.' . $mimeTypes[$mimeType];
    if (file_put_contents($directory . '/' . $filename, $bytes, LOCK_EX) === false) {
        throw new RuntimeException('Unable to save the project image.');
    }

    return 'assets/project-uploads/' . $filename;
}

function remove_project_image(?string $imageUrl): void
{
    $prefix = 'assets/project-uploads/';
    if ($imageUrl === null || !str_starts_with($imageUrl, $prefix)) {
        return;
    }

    $filename = substr($imageUrl, strlen($prefix));
    if (!preg_match('/^[a-f0-9]{32}\.(png|jpg|webp)$/', $filename)) {
        return;
    }

    $path = dirname(__DIR__) . '/' . $prefix . $filename;
    if (is_file($path) && !unlink($path)) {
        throw new RuntimeException('Unable to remove the project image.');
    }
}