<?php
declare(strict_types=1);

function hearingInsightCronSecretConfigured(): bool
{
    $sec = getenv('HEARING_INSIGHT_CRON_SECRET');
    return is_string($sec) && trim($sec) !== '';
}

function hearingInsightCronAuthOk(): bool
{
    if (!hearingInsightCronSecretConfigured()) {
        return false;
    }
    $sec = trim((string) getenv('HEARING_INSIGHT_CRON_SECRET'));
    $h = $_SERVER['HTTP_X_CRON_SECRET'] ?? '';
    if (!is_string($h) || $h === '') {
        return false;
    }

    return hash_equals($sec, trim($h));
}
