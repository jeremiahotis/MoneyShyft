import { down, up } from '../20260224170000_create_connectshyft_threads';

function buildKnexMock() {
  const dropped: string[] = [];

  const knex: any = {
    raw: jest.fn(async () => undefined),
    schema: {
      withSchema: (schema: string) => ({
        dropTableIfExists: async (tableName: string) => {
          dropped.push(`${schema}.${tableName}`);
        },
      }),
    },
  };

  return {
    knex,
    dropped,
  };
}

describe('20260224170000_create_connectshyft_threads migration', () => {
  it('creates connectshyft cs_threads schema elements idempotently', async () => {
    const { knex } = buildKnexMock();

    await up(knex);

    const rawCalls = knex.raw.mock.calls.map((call: [string]) => call[0]);

    expect(rawCalls).toEqual(expect.arrayContaining([
      'CREATE SCHEMA IF NOT EXISTS connectshyft',
    ]));
    expect(rawCalls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS connectshyft.cs_threads'))).toBe(true);
    expect(rawCalls.some((sql: string) => sql.includes('connectshyft_cs_threads_active_identity_uq'))).toBe(true);
    expect(rawCalls.some((sql: string) => sql.includes('connectshyft_cs_threads_due_eval_idx'))).toBe(true);
    expect(rawCalls.some((sql: string) => sql.includes('cs_threads_state_ck'))).toBe(true);
    expect(rawCalls.some((sql: string) => sql.includes('cs_threads_escalation_stage_non_negative_ck'))).toBe(true);
    expect(rawCalls.some((sql: string) => sql.includes('cs_threads_escalation_count_non_negative_ck'))).toBe(true);
  });

  it('drops connectshyft cs_threads table in down migration', async () => {
    const { knex, dropped } = buildKnexMock();

    await down(knex);

    expect(dropped).toEqual([
      'connectshyft.cs_threads',
    ]);
  });
});
