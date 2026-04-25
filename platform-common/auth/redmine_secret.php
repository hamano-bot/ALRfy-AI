<?php
declare(strict_types=1);

/**
 * Redmine API キーの暗号化/復号ユーティリティ。
 *
 * 保存形式:
 * - sodium:<base64url(nonce + ciphertext)>
 * - openssl:<base64url(iv + tag + ciphertext)>
 * - (互換) prefix なしは平文として扱う
 */

function platformRedmineSecretKey(): ?string
{
    static $cached = null;
    static $resolved = false;
    if ($resolved) {
        return $cached;
    }
    $resolved = true;

    $b64 = getenv('REDMINE_API_KEY_ENCRYPTION_KEY_B64');
    if (is_string($b64) && trim($b64) !== '') {
        $decoded = base64_decode(trim($b64), true);
        if ($decoded !== false && $decoded !== '') {
            $cached = hash('sha256', $decoded, true);
            return $cached;
        }
    }

    $raw = getenv('REDMINE_API_KEY_ENCRYPTION_KEY');
    if (is_string($raw) && trim($raw) !== '') {
        $cached = hash('sha256', trim($raw), true);
        return $cached;
    }

    return null;
}

function platformBase64UrlEncode(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function platformBase64UrlDecode(string $encoded): ?string
{
    $normalized = strtr($encoded, '-_', '+/');
    $pad = strlen($normalized) % 4;
    if ($pad > 0) {
        $normalized .= str_repeat('=', 4 - $pad);
    }
    $decoded = base64_decode($normalized, true);
    return $decoded === false ? null : $decoded;
}

function platformRedmineApiKeyEncrypt(string $plain): string
{
    $key = platformRedmineSecretKey();
    if ($key === null) {
        throw new RuntimeException('REDMINE_API_KEY_ENCRYPTION_KEY(_B64) が未設定です。');
    }

    if (function_exists('sodium_crypto_secretbox') && defined('SODIUM_CRYPTO_SECRETBOX_NONCEBYTES')) {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = sodium_crypto_secretbox($plain, $nonce, $key);
        return 'sodium:' . platformBase64UrlEncode($nonce . $cipher);
    }

    if (function_exists('openssl_encrypt') && function_exists('openssl_cipher_iv_length')) {
        $ivLen = openssl_cipher_iv_length('aes-256-gcm');
        if (is_int($ivLen) && $ivLen > 0) {
            $iv = random_bytes($ivLen);
            $tag = '';
            $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
            if (is_string($cipher) && $tag !== '') {
                return 'openssl:' . platformBase64UrlEncode($iv . $tag . $cipher);
            }
        }
    }

    throw new RuntimeException('利用可能な暗号化ライブラリが見つかりません（sodium/openssl）。');
}

function platformRedmineApiKeyDecrypt(?string $stored): ?string
{
    if ($stored === null) {
        return null;
    }
    $trimmed = trim($stored);
    if ($trimmed === '') {
        return null;
    }

    if (str_starts_with($trimmed, 'sodium:')) {
        if (!(function_exists('sodium_crypto_secretbox_open') && defined('SODIUM_CRYPTO_SECRETBOX_NONCEBYTES'))) {
            return null;
        }
        $key = platformRedmineSecretKey();
        if ($key === null) {
            return null;
        }
        $payload = platformBase64UrlDecode(substr($trimmed, 7));
        if ($payload === null || strlen($payload) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return null;
        }
        $nonce = substr($payload, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = substr($payload, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain = sodium_crypto_secretbox_open($cipher, $nonce, $key);
        return is_string($plain) ? $plain : null;
    }

    if (str_starts_with($trimmed, 'openssl:')) {
        if (!(function_exists('openssl_decrypt') && function_exists('openssl_cipher_iv_length'))) {
            return null;
        }
        $key = platformRedmineSecretKey();
        if ($key === null) {
            return null;
        }
        $ivLen = openssl_cipher_iv_length('aes-256-gcm');
        if (!is_int($ivLen) || $ivLen <= 0) {
            return null;
        }
        $payload = platformBase64UrlDecode(substr($trimmed, 8));
        if ($payload === null || strlen($payload) <= ($ivLen + 16)) {
            return null;
        }
        $iv = substr($payload, 0, $ivLen);
        $tag = substr($payload, $ivLen, 16);
        $cipher = substr($payload, $ivLen + 16);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        return is_string($plain) ? $plain : null;
    }

    // 旧データ互換: prefix なしは平文として扱う
    return $trimmed;
}
