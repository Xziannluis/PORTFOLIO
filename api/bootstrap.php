<?php
declare(strict_types=1);

$sessionPath = dirname(__DIR__) . '/tmp_sessions';
if (!is_dir($sessionPath)) {
    mkdir($sessionPath, 0775, true);
}
session_save_path($sessionPath);
session_start();

header('Content-Type: application/json; charset=utf-8');

const DB_HOST = '127.0.0.1';
const DB_NAME = 'portfolio_db';
const DB_USER = 'root';
const DB_PASS = '';

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

    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
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
    ];
}
