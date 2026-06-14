<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
}

$projects = [
    [
        'Student Services Portal',
        'A responsive portal for announcements, appointment requests, and document tracking with role-based views.',
        'web,database',
        'PHP,MySQL,JavaScript',
        1,
    ],
    [
        'Inventory Tracker',
        'CRUD dashboard with search, low-stock alerts, supplier records, and export-ready reports.',
        'database',
        'Python,SQL,Reports',
        2,
    ],
    [
        'Interactive Portfolio',
        'A compact portfolio interface with animated navigation, project filtering, and responsive content sections.',
        'ui,web',
        'HTML,CSS,UX',
        3,
    ],
    [
        'Capstone Task Board',
        'Kanban-style tracker for group requirements, sprints, deadlines, and progress visibility.',
        'web',
        'React,Firebase,Auth',
        4,
    ],
];

$pdo = db();
$pdo->beginTransaction();
$pdo->exec('DELETE FROM projects');

$stmt = $pdo->prepare(
    'INSERT INTO projects (title, description, categories, tags, sort_order) VALUES (?, ?, ?, ?, ?)'
);

foreach ($projects as $project) {
    $stmt->execute($project);
}

$pdo->commit();

json_response(['ok' => true]);
