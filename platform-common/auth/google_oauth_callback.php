<?php
declare(strict_types=1);

/**
 * 共通Googleログインのコールバック
 * - 議事録DB（minutes_record_db）の users は email ベース（public/callback.php と同じ同期方針）
 * - user_sessions / user_preferences / project_members は未作成でも動くようフォールバック
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/permission_helper.php';
require_once __DIR__ . '/platform_google_client.php';

final class UnassignedUserException extends RuntimeException
{
}

/**
 * Google userinfo を議事録互換の users に同期し user_id を返します。
 * （minutes_record_dev/public/callback.php の syncUserLoginByEmail と同等）
 */
function syncPlatformUserFromGoogle(PDO $pdo, string $email): int
{
    $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');

    $pdo->beginTransaction();
    try {
        $selectStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $selectStmt->execute([':email' => $email]);
        $user = $selectStmt->fetch();

        if ($user === false) {
            $insertStmt = $pdo->prepare(
                'INSERT INTO users (email, first_login_at, last_login_at, login_count)
                 VALUES (:email, :first_login_at, :last_login_at, :login_count)'
            );
            $insertStmt->execute([
                ':email' => $email,
                ':first_login_at' => $now,
                ':last_login_at' => $now,
                ':login_count' => 1,
            ]);
            $userId = (int)$pdo->lastInsertId();
        } else {
            $userId = (int)$user['id'];
            $updateStmt = $pdo->prepare(
                'UPDATE users
                 SET last_login_at = :last_login_at,
                     login_count = login_count + 1
                 WHERE id = :id'
            );
            $updateStmt->execute([
                ':last_login_at' => $now,
                ':id' => $userId,
            ]);
        }

        $pdo->commit();
        return $userId;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/**
 * セッションテーブルへ session_token_hash を保存（テーブルが無い環境ではスキップ）
 */
function persistPlatformSession(PDO $pdo, int $userId): void
{
    try {
        $rawSessionToken = session_id();
        if ($rawSessionToken === '') {
            throw new RuntimeException('session_id の取得に失敗しました。');
        }
        $sessionHash = hash('sha256', $rawSessionToken);
        $expiresAt = (new DateTimeImmutable('+1 day'))->format('Y-m-d H:i:s');
        $createdAt = (new DateTimeImmutable())->format('Y-m-d H:i:s');

        $stmt = $pdo->prepare(
            'INSERT INTO user_sessions (user_id, session_token_hash, expires_at, ip_address, user_agent, created_at)
             VALUES (:user_id, :session_token_hash, :expires_at, :ip_address, :user_agent, :created_at)'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':session_token_hash' => $sessionHash,
            ':expires_at' => $expiresAt,
            ':ip_address' => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
            ':user_agent' => (string)($_SERVER['HTTP_USER_AGENT'] ?? ''),
            ':created_at' => $createdAt,
        ]);
    } catch (Throwable $e) {
        error_log('[platform-common/google_oauth_callback] user_sessions 保存をスキップ: ' . $e->getMessage());
    }
}

try {
    if (!isset($_GET['code']) || !is_string($_GET['code']) || $_GET['code'] === '') {
        throw new RuntimeException('認可コードがありません。');
    }

    $state = isset($_GET['state']) && is_string($_GET['state']) ? $_GET['state'] : '';
    $sessionState = isset($_SESSION['oauth_state']) && is_string($_SESSION['oauth_state']) ? $_SESSION['oauth_state'] : '';
    if ($state === '' || $sessionState === '' || !hash_equals($sessionState, $state)) {
        throw new RuntimeException('OAuth state の検証に失敗しました。');
    }
    unset($_SESSION['oauth_state']);

    $client = getPlatformGoogleClient();
    $token = $client->fetchAccessTokenWithAuthCode($_GET['code']);
    if (isset($token['error'])) {
        throw new RuntimeException('Google token exchange error: ' . (string)($token['error_description'] ?? 'unknown'));
    }
    $client->setAccessToken($token);

    $oauth2 = new Google\Service\Oauth2($client);
    $userInfo = $oauth2->userinfo->get();

    $googleSub = (string)($userInfo->id ?? '');
    $email = (string)($userInfo->email ?? '');
    $displayName = (string)($userInfo->name ?? '');

    if ($googleSub === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Google userinfo が不正です。');
    }

    $pdo = createPdoFromApplicationEnv();
    $userId = syncPlatformUserFromGoogle($pdo, $email);

    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['user_email'] = $email;
    $_SESSION['user_name'] = $displayName;
    $_SESSION['google_sub'] = $googleSub;

    persistPlatformSession($pdo, $userId);

    if (!hasAnyMembership($pdo, $userId)) {
        throw new UnassignedUserException('ユーザーに所属先がありません。');
    }

    $directOpen = false;
    $defaultAppKey = '';
    try {
        $prefStmt = $pdo->prepare('SELECT default_app_key, direct_open_last_app FROM user_preferences WHERE user_id = :user_id LIMIT 1');
        $prefStmt->execute([':user_id' => $userId]);
        $pref = $prefStmt->fetch();
        $directOpen = is_array($pref) && (int)($pref['direct_open_last_app'] ?? 0) === 1;
        $defaultAppKey = is_array($pref) ? (string)($pref['default_app_key'] ?? '') : '';
    } catch (Throwable $e) {
        // user_preferences 未作成時はデフォルトのまま
    }

    if ($directOpen && $defaultAppKey !== '') {
        header('Location: /' . rawurlencode($defaultAppKey));
        exit;
    }

    header('Location: /dashboard');
    exit;
} catch (UnassignedUserException $e) {
    error_log('[platform-common/google_oauth_callback] ' . $e->getMessage());
    header('Location: /login?error=unassigned_user');
    exit;
} catch (Throwable $e) {
    error_log('[platform-common/google_oauth_callback] ' . $e->getMessage());
    header('Location: /login?error=auth_failed');
    exit;
}
