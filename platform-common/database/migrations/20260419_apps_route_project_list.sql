-- Next 案件一覧の公開パスを `/project-list` に統一（旧 `/project-manager` は Next で `/project-list` へリダイレクト）
USE `minutes_record_db`;

UPDATE `apps`
SET `route` = '/project-list'
WHERE `app_key` = 'project-manager' AND `route` IN ('/project-manager', '/projects', '');
