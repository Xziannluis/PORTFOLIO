<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
}

$data = input_json();
$id = (int) ($data['id'] ?? 0);
if ($id <= 0) {
    json_response(['ok' => false, 'message' => 'Valid project id is required.'], 422);
}
if (array_key_exists('image', $data) && $data['image'] !== null && !is_array($data['image'])) {
    json_response(['ok' => false, 'message' => 'Choose a valid project image.'], 422);
}

$pdo = db();
$lookup = $pdo->prepare('SELECT image_url FROM projects WHERE id = ?');
$lookup->execute([$id]);
$oldImageUrl = $lookup->fetchColumn();
if ($oldImageUrl === false) {
    json_response(['ok' => false, 'message' => 'Project not found.'], 404);
}

$pdo->beginTransaction();
$newImageUrl = null;
try {
    $newImageUrl = save_project_image($data['image'] ?? null);
    $stmt = $pdo->prepare('UPDATE projects SET image_url = ? WHERE id = ?');
    $stmt->execute([$newImageUrl, $id]);
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    remove_project_image($newImageUrl);
    throw $error;
}

if (is_string($oldImageUrl)) {
    remove_project_image($oldImageUrl);
}

json_response(['ok' => true]);
