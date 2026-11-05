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

if (array_key_exists('image', $data) && $data['image'] !== null && !is_array($data['image'])) {
    json_response(['ok' => false, 'message' => 'Choose a valid project image.'], 422);
}

$pdo = db();
$pdo->beginTransaction();
$imageUrl = null;
try {
    $nextOrder = (int) $pdo
        ->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects')
        ->fetchColumn();
    $imageUrl = save_project_image($data['image'] ?? null);
    $stmt = $pdo->prepare(
        'INSERT INTO projects
            (title, description, categories, tags, image_url, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id'
    );

    $stmt->execute([
        $title,
        $description,
        implode(',', $categories),
        implode(',', $tags),
        $imageUrl,
        $nextOrder,
    ]);

    $id = (int) $stmt->fetchColumn();
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    remove_project_image($imageUrl);
    throw $error;
}

json_response([
    'ok' => true,
    'id' => $id
]);