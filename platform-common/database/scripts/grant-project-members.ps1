#Requires -Version 5.1
<#
.SYNOPSIS
  Grant project_members rows by email (pipes SQL into docker exec -i; no host mysql, no docker cp).

.EXAMPLE
  .\platform-common\database\scripts\grant-project-members.ps1 user1@example.com user2@example.com

.EXAMPLE
  .\platform-common\database\scripts\grant-project-members.ps1 -Emails @('a@example.com') -ProjectId 2 -Container ALRfy-AI-DB
#>
param(
  [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
  [string[]] $Emails,

  [int] $ProjectId = 1,

  [ValidateSet('owner', 'editor', 'viewer')]
  [string] $Role = 'editor',

  [string] $Container = 'ALRfy-AI-DB',

  [string] $MysqlUser = 'root',

  [string] $MysqlPassword = $(if ($env:MYSQL_ROOT_PASSWORD) { $env:MYSQL_ROOT_PASSWORD } elseif ($env:MYSQL_PASSWORD) { $env:MYSQL_PASSWORD } else { 'root' }),

  [string] $Database = 'alrfy_ai_db_dev'
)

function Escape-SqlLiteral {
  param([string] $Value)
  $q = "$([char]39)"
  return $Value.Replace($q, $q + $q)
}

$clean = New-Object System.Collections.Generic.List[string]
foreach ($e in $Emails) {
  $t = $e.Trim()
  if ($t.Length -gt 0) { [void]$clean.Add($t) }
}
if ($clean.Count -eq 0) {
  throw 'At least one email address is required.'
}

$sq = [char]39
$comma = [char]44
$parts = New-Object System.Collections.Generic.List[string]
foreach ($e in $clean) {
  [void]$parts.Add($sq + (Escape-SqlLiteral $e) + $sq)
}
$inList = [string]::Join($comma, $parts)

$sql = [string]::Join(
  [Environment]::NewLine,
  @(
    "USE $Database;",
    '',
    'INSERT INTO project_members (project_id, user_id, role)',
    "SELECT $ProjectId, id, $sq$Role$sq",
    'FROM users',
    "WHERE email IN ($inList)",
    'ON DUPLICATE KEY UPDATE role = VALUES(role);',
    '',
    'SELECT pm.project_id, p.name AS project_name, u.email, pm.role',
    'FROM project_members pm',
    'JOIN projects p ON p.id = pm.project_id',
    'JOIN users u ON u.id = pm.user_id',
    "WHERE u.email IN ($inList)",
    'ORDER BY u.email;'
  )
)

$sql | docker exec -i $Container mysql -u"$MysqlUser" -p"$MysqlPassword" --default-character-set=utf8mb4 $Database
exit $LASTEXITCODE
