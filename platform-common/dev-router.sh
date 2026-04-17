#!/usr/bin/env sh
# PHP 組み込みサーバー（router.php）。Next とポートを分ける前提。
# 使い方: ./dev-router.sh   または   ./dev-router.sh 127.0.0.1:8002
set -eu
cd "$(dirname "$0")"
LISTEN="${1:-127.0.0.1:8000}"
echo "platform-common: http://${LISTEN}/  (router: router.php)"
echo "Next BFF 用の例: PORTAL_API_BASE_URL=http://${LISTEN}"
echo ""
exec php -S "$LISTEN" router.php
