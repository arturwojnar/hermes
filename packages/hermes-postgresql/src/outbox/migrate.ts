import { Sql } from 'postgres'
import { PublicationName, SlotName } from '../common/consts.js'

export const dropReplicationSlot = async (sql: Sql, slotName = SlotName) => {
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

export const migrate = async (sql: Sql) => {
  await sql`
    DO $$
    BEGIN
      IF current_setting('wal_level') != 'logical' THEN
        RAISE EXCEPTION 'wal_level must be set to logical';
      END IF;
    END $$;
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "outbox" (
      "position"      BIGSERIAL     PRIMARY KEY,
      "messageId"     VARCHAR(250)  NOT NULL,
      "messageType"   VARCHAR(250)  NOT NULL,
      "partitionKey"  VARCHAR(50)   DEFAULT 'default' NOT NULL,
      "data"          JSONB         NOT NULL,
      "addedAt"       TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "createdAt"     TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "lsn"           VARCHAR(50)   NULL,
      "sentAt"        TIMESTAMPTZ   NULL
    );
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "outboxConsumer" (
      "id"                      BIGSERIAL     PRIMARY KEY,
      "consumerName"            VARCHAR(30)   NOT NULL,
      "partitionKey"            VARCHAR(50)   DEFAULT 'default' NOT NULL,
      "lastProcessedLsn"        VARCHAR(20)   DEFAULT '0/00000000' NOT NULL,
      "lastProcessedPosition"   BIGINT        DEFAULT NULL,
      "failedNextLsn"           VARCHAR(20)   DEFAULT NULL,
      "nextLsnRedeliveryCount"  INTEGER       DEFAULT 0 NOT NULL,
      "createdAt"               TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
      "lastUpdatedAt"           TIMESTAMPTZ   DEFAULT NOW() NULL
    );
  `

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "consumerNameIdx" ON "outboxConsumer" ("consumerName" DESC);`
  await sql`CREATE INDEX IF NOT EXISTS "consumerNameAndPartKeyIdx" ON "outboxConsumer" ("consumerName" DESC, "partitionKey" NULLS LAST);`

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
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_replication_slots WHERE slot_name = '${SlotName}')
      THEN
          PERFORM pg_create_logical_replication_slot('${SlotName}', 'pgoutput');
          slot_created := true;
      END IF;

      RAISE NOTICE 'Slot created: %', slot_created;
    END $$;
  `)
}
