-- ============================================================
-- estimate_item_master: 見積入力の「項目名」補完の説明コメント（既存DB向け）
-- 初回作成が 20260427 で COMMENT 付きなら本ファイルは冪等でほぼ no-op 相当
-- ============================================================

USE `alrfy_ai_db_dev`;

ALTER TABLE `estimate_item_master`
  MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'この補完マスタ行のID（主キー・自動採番）',
  MODIFY COLUMN `item_name` VARCHAR(255) NOT NULL COMMENT '見積入力画面の明細「項目名」欄に補完する文字列。候補の表示名兼マッチキー。マスタ内で一意',
  MODIFY COLUMN `unit_type` ENUM('person_month','person_day','set','page','times','percent','monthly_fee','annual_fee') NOT NULL DEFAULT 'set' COMMENT '項目名を補完確定したとき、明細の「単位」欄へ入れる値（見積明細と同じENUM）',
  MODIFY COLUMN `unit_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '項目名を補完確定したとき、明細の「単価」欄へ入れる標準単価',
  MODIFY COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=見積入力の項目名候補に出す 0=候補から除く',
  MODIFY COLUMN `sort_order` INT NOT NULL DEFAULT 0 COMMENT '見積入力画面の項目名候補リストの並び（昇順・小さいほど上。同順位は項目名順）',
  MODIFY COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'この補完マスタ行を登録した日時',
  MODIFY COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'この補完マスタ行を最後に更新した日時',
  COMMENT='見積入力（編集）画面の明細「項目名」を補完するためのマスタ。候補選択や名称一致時に単位・単価もセットする';
