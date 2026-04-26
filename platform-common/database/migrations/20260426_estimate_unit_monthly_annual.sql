-- 見積明細・ルールの unit_type に 月額・年額（monthly_fee / annual_fee）を追加
USE `alrfy_ai_db_dev`;

ALTER TABLE `project_estimate_lines`
  MODIFY COLUMN `unit_type` ENUM(
    'person_month','person_day','set','page','times','percent','monthly_fee','annual_fee'
  ) NOT NULL DEFAULT 'set';

ALTER TABLE `estimate_rule_items`
  MODIFY COLUMN `unit_type` ENUM(
    'person_month','person_day','set','page','times','percent','monthly_fee','annual_fee'
  ) NOT NULL DEFAULT 'set';
