import { Knex } from 'knex';

const CONNECTSHYFT_SCHEMA = 'connectshyft';
const THREADS_TABLE = 'cs_threads';

const THREAD_STATE_CHECK = 'cs_threads_state_ck';
const THREAD_ESCALATION_STAGE_CHECK = 'cs_threads_escalation_stage_non_negative_ck';
const THREAD_ESCALATION_COUNT_CHECK = 'cs_threads_escalation_count_non_negative_ck';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE SCHEMA IF NOT EXISTS connectshyft');

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS connectshyft.${THREADS_TABLE} (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id TEXT NOT NULL,
      org_unit_id TEXT NOT NULL,
      neighbor_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'UNCLAIMED',
      source TEXT NOT NULL DEFAULT 'VOICE',
      claimed_by_user_id TEXT NULL,
      escalation_stage INTEGER NOT NULL DEFAULT 0,
      escalation_count INTEGER NOT NULL DEFAULT 0,
      next_evaluation_at_utc TIMESTAMPTZ NULL,
      last_inbound_cs_number_id TEXT NULL,
      preferred_outbound_cs_number_id TEXT NULL,
      last_activity_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id TEXT NULL,
      updated_by_user_id TEXT NULL,
      created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS connectshyft_cs_threads_scope_idx
    ON connectshyft.${THREADS_TABLE} (tenant_id, org_unit_id, id)
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS connectshyft_cs_threads_active_identity_uq
    ON connectshyft.${THREADS_TABLE} (tenant_id, org_unit_id, neighbor_id)
    WHERE state <> 'CLOSED'
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS connectshyft_cs_threads_due_eval_idx
    ON connectshyft.${THREADS_TABLE} (state, next_evaluation_at_utc, org_unit_id)
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${THREAD_STATE_CHECK}'
          AND conrelid = 'connectshyft.${THREADS_TABLE}'::regclass
      ) THEN
        ALTER TABLE connectshyft.${THREADS_TABLE}
          ADD CONSTRAINT ${THREAD_STATE_CHECK}
          CHECK (state IN ('UNCLAIMED', 'CLAIMED', 'CLOSED'));
      END IF;
    END $$;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${THREAD_ESCALATION_STAGE_CHECK}'
          AND conrelid = 'connectshyft.${THREADS_TABLE}'::regclass
      ) THEN
        ALTER TABLE connectshyft.${THREADS_TABLE}
          ADD CONSTRAINT ${THREAD_ESCALATION_STAGE_CHECK}
          CHECK (escalation_stage >= 0);
      END IF;
    END $$;
  `);

  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${THREAD_ESCALATION_COUNT_CHECK}'
          AND conrelid = 'connectshyft.${THREADS_TABLE}'::regclass
      ) THEN
        ALTER TABLE connectshyft.${THREADS_TABLE}
          ADD CONSTRAINT ${THREAD_ESCALATION_COUNT_CHECK}
          CHECK (escalation_count >= 0);
      END IF;
    END $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema(CONNECTSHYFT_SCHEMA).dropTableIfExists(THREADS_TABLE);
}
