<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
}

$data = input_json();

$title = trim((string) ($data['title'] ?? ''));
$description = trim((string) ($data['description'] ?? ''));
$categories = array_values(
    array_filter(array_map('trim', (array) ($data['categories'] ?? [])))
);
$tags = array_values(
    array_filter(array_map('trim', (array) ($data['tags'] ?? [])))
);

if ($title === '' || $description === '') {
    json_response([
        'ok' => false,
        'message' => 'Title and description are required.'
    ], 422);
}

if (!$categories) {
    $categories = ['web'];
}

$nextOrder = (int) db()
    ->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects')
    ->fetchColumn();

$stmt = db()->prepare(
    'INSERT INTO projects
        (title, description, categories, tags, sort_order)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id'
);

$stmt->execute([
    $title,
    $description,
    implode(',', $categories),
    implode(',', $tags),
    $nextOrder,
]);

$id = (int) $stmt->fetchColumn();

json_response([
    'ok' => true,
    'id' => $id
]);