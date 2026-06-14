<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

json_response([
    'ok' => true,
    'loggedIn' => !empty($_SESSION['admin_id']),
    'admin' => empty($_SESSION['admin_id'])
        ? null
        : [
            'id' => (int) $_SESSION['admin_id'],
            'username' => (string) $_SESSION['admin_username'],
        ],
]);
