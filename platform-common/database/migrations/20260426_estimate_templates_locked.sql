-- estimate_templates: ロック列（全体テンプレの編集制限に使用）
ALTER TABLE `estimate_templates`
  ADD COLUMN `locked` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=ロック（管理者のみ更新・解除）' AFTER `lines_json`;
