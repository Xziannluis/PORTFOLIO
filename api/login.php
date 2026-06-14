<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(['ok' => false, 'message' => 'Method not allowed.'], 405);
}

$data = input_json();
$username = trim((string) ($data['username'] ?? ''));
$password = (string) ($data['password'] ?? '');

if ($username === '' || $password === '') {
    json_response(['ok' => false, 'message' => 'Username and password are required.'], 422);
}

$stmt = db()->prepare('SELECT * FROM admins WHERE username = ? LIMIT 1');
$stmt->execute([$username]);
$admin = $stmt->fetch();

if (!$admin || !password_verify($password, $admin['password_hash'])) {
    json_response(['ok' => false, 'message' => 'Invalid admin account.'], 401);
}

session_regenerate_id(true);
$_SESSION['admin_id'] = (int) $admin['id'];
$_SESSION['admin_username'] = $admin['username'];

json_response([
    'ok' => true,
    'admin' => [
        'id' => (int) $admin['id'],
        'username' => $admin['username'],
    ],
]);
