-- Synthetic legacy records for validating an existing HRMS database upgrade.
INSERT INTO branches (id, name, updated_at)
VALUES ('10000000-0000-4000-8000-000000000001', 'QA旧库分公司', now());
INSERT INTO projects (id, branch_id, name, updated_at)
VALUES ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'QA旧库项目', now());
INSERT INTO users (id, username, password_hash, display_name, role, employee_type, updated_at)
VALUES ('30000000-0000-4000-8000-000000000001', 'qa-legacy-referrer', 'disabled-synthetic-account', 'QA推荐人', 'EMPLOYEE', '普通员工', now());
INSERT INTO policies (id, name, type, project_id, employee_type, amount, achievement_conditions, effective_at, updated_at)
VALUES ('40000000-0000-4000-8000-000000000001', 'QA历史推荐政策', 'EMPLOYEE_REFERRAL',
  '20000000-0000-4000-8000-000000000001', '普通员工', 500, '历史文字规则满30天', '2026-01-01', now());
INSERT INTO job_demands (id, project_id, title, required_count, requirements, salary, work_time, work_location, deadline, referral_policy_id, updated_at)
VALUES ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  'QA旧岗位', 10, '测试要求', '5000元/月', '白班', '四川成都', '2027-12-31', '40000000-0000-4000-8000-000000000001', now());
INSERT INTO people (id, name, id_card, phone, project_id, job_title, updated_at)
SELECT ('60000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'QA历史候选人' || i, '10000019900101000' || i, '1000000000' || i,
  '20000000-0000-4000-8000-000000000001', 'QA旧岗位', now()
FROM generate_series(1, 2) AS i;
INSERT INTO applications (id, person_id, job_demand_id, source, recommender_user_id, updated_at)
SELECT ('70000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('60000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '50000000-0000-4000-8000-000000000001', 'REFERRAL', '30000000-0000-4000-8000-000000000001', now()
FROM generate_series(1, 2) AS i;
INSERT INTO referral_records (id, application_id, person_id, job_demand_id, recommender_user_id, policy_id, policy_snapshot)
SELECT ('80000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('60000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '{"amount":"500","version":1}'::jsonb
FROM generate_series(1, 2) AS i;
INSERT INTO referral_reward_records (id, referral_id, policy_id, amount, status, paid_at, notes, updated_at)
SELECT ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('80000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '40000000-0000-4000-8000-000000000001', 500,
  CASE WHEN i = 1 THEN 'PENDING' ELSE 'PAID' END::"RewardStatus",
  CASE WHEN i = 2 THEN '2026-07-31 12:00:00'::timestamp ELSE NULL END,
  'QA历史记录不可改写', now()
FROM generate_series(1, 2) AS i;
