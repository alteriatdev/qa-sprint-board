-- Маппинг участника команды на его Jira accountId.
-- Нужен, чтобы синк резолвил поле «QA» эпика (мульти-юзер пикер) в member.id:
-- имена в Jira не совпадают с бордой (DariaA_QA != Daria A), матчим по accountId.
ALTER TABLE members ADD COLUMN IF NOT EXISTS jira_account_id TEXT;

-- Бэкфилл по факту из Jira (10 тестеров активного спринта).
UPDATE members SET jira_account_id = '712020:ee5687c2-6ce1-441c-8427-8d0fcce3ae2d' WHERE id = 'denisk';
UPDATE members SET jira_account_id = '712020:32678de6-addb-473e-b98f-a699726cb523' WHERE id = 'vasiliy';
UPDATE members SET jira_account_id = '712020:035ea27b-74ca-475c-ae6d-d0aa2b3d959d' WHERE id = 'denisv';
UPDATE members SET jira_account_id = '712020:0f009a3a-57de-4d7f-9380-83d2f7e20e98' WHERE id = 'veronika';
UPDATE members SET jira_account_id = '712020:2c182a5c-52d9-42ed-9b87-6db5b63a571d' WHERE id = 'yaroslav';
UPDATE members SET jira_account_id = '712020:67cfc971-97e9-41f6-ab15-40e3bf30a8be' WHERE id = 'natalia';
UPDATE members SET jira_account_id = '712020:bc0b6bf2-a3ee-4496-9d58-a23538bc975b' WHERE id = 'julia';
UPDATE members SET jira_account_id = '712020:6f0d7900-f940-4190-8460-80e739cf3524' WHERE id = 'aleksey';
UPDATE members SET jira_account_id = '712020:826cca20-fb51-49d5-ba05-1fd1c055c2c1' WHERE id = 'daria';
UPDATE members SET jira_account_id = '70121:26af151c-c55a-46af-8118-242eb32788fc' WHERE id = 'edvard';
