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

$stmt = db()->prepare('DELETE FROM projects WHERE id = ?');
$stmt->execute([$id]);

json_response(['ok' => true]);
