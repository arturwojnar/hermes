import { Sql } from 'postgres'
import { PublicationName, type SlotName } from '../common/consts.js'
import { OutboxConsumerStatuses } from './OutboxConsumerState.js'

export const dropReplicationSlot = async (sql: Sql, slotName: SlotName) => {
  await sql.unsafe(
    `
    SELECT pg_drop_replication_slot(slot_name)
    FROM pg_replication_slots
    WHERE slot_name = $1
    AND active = false
  `,
    [slotName],
  )
}

export const migrate = async (sql: Sql, slotName: string) => {
  await sql`
    DO $$
    BEGIN
      IF current_setting('wal_level') != 'logical' THEN
        RAISE EXCEPTION 'wal_level must be set to logical';
      END IF;
    END $$;
  `
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_type t 
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace 
      WHERE t.typname = 'ConsumerStatus'
    )
  `
  if (!exists) {
    const enumValues = OutboxConsumerStatuses.map((status) => `'${status}'`).join(', ')
    await sql.unsafe(`
    CREATE TYPE "ConsumerStatus" AS ENUM (${enumValues})
  `)
  }

  await sql`
    CREATE TABLE IF NOT EXISTS "outbox" (
      "position"      BIGSERIAL     PRIMARY KEY,
      "messageId"     VARCHAR(250)  NOT NULL,
      "messageType"   VARCHAR(250)  NOT NULL,
      "partitionKey"  VARCHAR(30)   DEFAULT 'default' NOT NULL,
      "data"          JSONB         NOT NULL,
      "addedAt"       TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "createdAt"     TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "lsn"           VARCHAR(50)   NULL,
      "sentAt"        TIMESTAMPTZ   NULL
    );
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "asyncOutbox" (
      "position"      BIGSERIAL     PRIMARY KEY,
      "consumerName"  VARCHAR(30)   NOT NULL,
      "messageId"     VARCHAR(250)  NOT NULL,
      "messageType"   VARCHAR(250)  NOT NULL,
      "data"          JSONB         NOT NULL,
      "addedAt"       TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "createdAt"     TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "failsCount"    INTEGER       DEFAULT 0,
      "sentAt"        TIMESTAMPTZ   NULL,
      "delivered"     BOOLEAN       DEFAULT FALSE
    );
  `

  await sql`CREATE INDEX IF NOT EXISTS "asyncOutboxDeliveredIdx" ON "asyncOutbox" ("delivered" ASC);`
  await sql`CREATE INDEX IF NOT EXISTS "asyncOutboxDeliveredWithDateIdx" ON "asyncOutbox" ("delivered" ASC, "addedAt" ASC);`

  await sql`
    CREATE TABLE IF NOT EXISTS "outboxConsumer" (
      "id"                      BIGSERIAL         PRIMARY KEY,
      "consumerName"            VARCHAR(30)       NOT NULL,
      "partitionKey"            VARCHAR(30)       DEFAULT 'default' NOT NULL,
      "status"                  "ConsumerStatus"  DEFAULT 'CREATED' NOT NULL,
      "lastProcessedLsn"        VARCHAR(20)       DEFAULT '0/00000000' NOT NULL,
      "failedNextLsn"           VARCHAR(20)       DEFAULT NULL,
      "nextLsnRedeliveryCount"  INTEGER           DEFAULT 0 NOT NULL,
      "createdAt"               TIMESTAMPTZ       DEFAULT NOW() NOT NULL,
      "lastUpdatedAt"           TIMESTAMPTZ       DEFAULT NOW() NULL
    );
  `

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "consumerNameIdx" ON "outboxConsumer" ("consumerName" DESC, "partitionKey");`

  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = '${PublicationName}') THEN
        CREATE PUBLICATION ${PublicationName} FOR TABLE outbox;
      END IF;
    END $$;
  `)

  await sql.unsafe(`
    DO $$
    DECLARE
      slot_created boolean;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_replication_slots WHERE slot_name = '${slotName}')
      THEN
          PERFORM pg_create_logical_replication_slot('${slotName}', 'pgoutput');
          slot_created := true;
      END IF;

      RAISE NOTICE 'Slot created: %', slot_created;
    END $$;
  `)
}
