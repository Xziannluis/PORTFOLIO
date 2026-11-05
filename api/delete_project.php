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

$pdo = db();
$lookup = $pdo->prepare('SELECT image_url FROM projects WHERE id = ?');
$lookup->execute([$id]);
$imageUrl = $lookup->fetchColumn();

$stmt = $pdo->prepare('DELETE FROM projects WHERE id = ?');
$stmt->execute([$id]);
remove_project_image(is_string($imageUrl) ? $imageUrl : null);

json_response(['ok' => true]);
