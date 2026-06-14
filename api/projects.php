<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$stmt = db()->query('SELECT * FROM projects ORDER BY sort_order ASC, id ASC');
$projects = array_map('project_from_row', $stmt->fetchAll());

json_response(['ok' => true, 'projects' => $projects]);
