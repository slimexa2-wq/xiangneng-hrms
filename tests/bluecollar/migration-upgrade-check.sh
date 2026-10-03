#!/usr/bin/env bash
set -euo pipefail

qa_repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
qa_container='xiangneng-bluecollar-qa-postgres'
qa_upgrade_database="xiangneng_bluecollar_upgrade_${RANDOM}${RANDOM}"

# Pin all Docker access to the same local daemon as the isolated integration DB.
qa_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS \
    -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
qa_sql() {
  qa_docker exec -i "$qa_container" psql -X -v ON_ERROR_STOP=1 -U qa -d "$qa_upgrade_database" "$@"
}
qa_cleanup() {
  qa_docker exec "$qa_container" dropdb --if-exists -U qa "$qa_upgrade_database" >/dev/null
}
qa_docker exec "$qa_container" createdb -U qa "$qa_upgrade_database"
trap qa_cleanup EXIT
for qa_migration in "$qa_repository_root"/prisma/migrations/202607*/migration.sql; do
  qa_sql < "$qa_migration" >/dev/null
done
qa_sql < "$qa_repository_root/tests/bluecollar/legacy-fixture.sql" >/dev/null

# A duplicate person/job attribution must block the unique index, with no silent
# deletion. Use a disposable transaction so the successful upgrade remains clean.
qa_sql <<'SQL' >/dev/null
BEGIN;
INSERT INTO applications (id, person_id, job_demand_id, source, recommender_user_id, updated_at)
VALUES ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001', 'REFERRAL', '30000000-0000-4000-8000-000000000001', now());
INSERT INTO referral_records (id, application_id, person_id, job_demand_id, recommender_user_id)
VALUES ('80000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003',
  '60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001');
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX qa_test_referral_unique ON referral_records(person_id, job_demand_id);
    RAISE EXCEPTION 'Expected duplicate-referral rejection';
  EXCEPTION WHEN unique_violation THEN
    IF (SELECT count(*) FROM referral_records) <> 3 THEN
      RAISE EXCEPTION 'Legacy duplicate history was unexpectedly changed';
    END IF;
  END;
END $$;
ROLLBACK;
SQL

qa_sql < "$qa_repository_root/prisma/migrations/20261002090000_bluecollar_recruitment/migration.sql" >/dev/null
qa_sql <<'SQL' >/dev/null
DO $$
BEGIN
  IF (SELECT count(*) FROM referral_records) <> 2 OR (SELECT count(*) FROM referral_reward_records) <> 2 THEN
    RAISE EXCEPTION 'Legacy referrals or rewards were lost';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM referral_reward_records WHERE id = '90000000-0000-4000-8000-000000000001'
    AND amount = 500 AND status = 'PENDING' AND paid_at IS NULL AND notes = 'QA历史记录不可改写') THEN
    RAISE EXCEPTION 'Legacy pending reward was changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM referral_reward_records WHERE id = '90000000-0000-4000-8000-000000000002'
    AND amount = 500 AND status = 'PAID' AND paid_at = '2026-07-31 12:00:00' AND notes = 'QA历史记录不可改写') THEN
    RAISE EXCEPTION 'Legacy paid reward was changed';
  END IF;
  IF EXISTS (SELECT 1 FROM referral_records WHERE policy_snapshot <> '{"amount":"500","version":1}'::jsonb) THEN
    RAISE EXCEPTION 'Legacy policy snapshots were rewritten';
  END IF;
  IF (SELECT count(*) FROM referral_reward_payments) <> 0 THEN
    RAISE EXCEPTION 'Payment proofs were invented for historical rewards';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM policies WHERE retention_days = 30) THEN
    RAISE EXCEPTION 'Policy migration default is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RewardStatus' AND e.enumlabel = 'APPROVED') THEN
    RAISE EXCEPTION 'New approval enum state is missing';
  END IF;
END $$;
SQL

printf '%s\n' 'PASS: old HRMS data preserved; duplicate-referral unique index blocks safely; new approval/payment schema present.'
