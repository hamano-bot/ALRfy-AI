#!/usr/bin/env bash
# メールで project_members を付与（docker exec -i のみ。mysql クライアント・docker cp 不要）
#
# 例:
#   ./platform-common/database/scripts/grant-project-members.sh shiono@shift-jp.net m.koga@shift-jp.net
#
# 環境変数:
#   CONTAINER (既定: ALRfy-AI-DB)
#   MYSQL_USER (既定: root)
#   MYSQL_PASSWORD / MYSQL_ROOT_PASSWORD (既定: root)
#   PROJECT_ID (既定: 1)
#   ROLE (既定: editor)

set -euo pipefail

CONTAINER="${CONTAINER:-ALRfy-AI-DB}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-${MYSQL_ROOT_PASSWORD:-root}}"
PROJECT_ID="${PROJECT_ID:-1}"
ROLE="${ROLE:-editor}"
DATABASE="${DATABASE:-alrfy_ai_db_dev}"

case "$ROLE" in owner|editor|viewer) ;; *)
  echo "ROLE must be owner, editor, or viewer" >&2
  exit 1
  ;;
esac

if [[ $# -lt 1 ]]; then
  echo "usage: $0 email1 [email2 ...]" >&2
  exit 1
fi

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

in_list=""
sep=""
for email in "$@"; do
  e="${email//$'\r'/}"
  e="${e//$'\n'/}"
  e="${e#"${e%%[![:space:]]*}"}"
  e="${e%"${e##*[![:space:]]}"}"
  [[ -z "$e" ]] && continue
  esc="$(sql_escape "$e")"
  in_list+="${sep}'${esc}'"
  sep=","
done

if [[ -z "$in_list" ]]; then
  echo "no valid emails" >&2
  exit 1
fi

docker exec -i "$CONTAINER" mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --default-character-set=utf8mb4 "$DATABASE" <<EOF
USE ${DATABASE};

INSERT INTO project_members (project_id, user_id, role)
SELECT ${PROJECT_ID}, id, '${ROLE}'
FROM users
WHERE email IN (${in_list})
ON DUPLICATE KEY UPDATE role = VALUES(role);

SELECT pm.project_id, p.name AS project_name, u.email, pm.role
FROM project_members pm
JOIN projects p ON p.id = pm.project_id
JOIN users u ON u.id = pm.user_id
WHERE u.email IN (${in_list})
ORDER BY u.email;
EOF
