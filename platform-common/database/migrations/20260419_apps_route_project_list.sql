-- Next Project一覧の公開パスを `/project-list` に統一（旧 `/project-manager` は Next で `/project-list` へリダイレクト）
USE `alrfy_ai_db_dev`;

UPDATE `apps`
SET `route` = '/project-list'
WHERE `app_key` = 'project-manager' AND `route` IN ('/project-manager', '/projects', '');
