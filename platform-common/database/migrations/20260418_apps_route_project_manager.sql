-- 既に 20260417 を適用済みで apps.route が /projects のままの環境向け（任意）
USE `alrfy_ai_db_dev`;

UPDATE `apps`
SET `route` = '/project-manager'
WHERE `app_key` = 'project-manager' AND `route` = '/projects';
