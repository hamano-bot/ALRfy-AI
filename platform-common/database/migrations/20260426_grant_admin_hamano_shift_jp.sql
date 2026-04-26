-- 濱野和洋（hamano@shift-jp.net）に管理者フラグを付与
-- 本番・ステージングでは USE のデータベース名を環境に合わせて変更してから実行してください。

USE `alrfy_ai_db_dev`;

UPDATE `users`
SET `is_admin` = 1
WHERE LOWER(TRIM(`email`)) = LOWER('hamano@shift-jp.net');
