import { Sql } from 'postgres'

// type Start = () => Promise<Stop>
// type Stop = () => Promise<void>
// type Publish<Event> = (event: Event | Event[]) => Promise<void>
// type OutboxConsumer<Event> = {
//   start: Start
//   publish: Publish<Event>
// }
// type NowFunction = () => Date
// type ErrorCallback = (error: unknown) => void
// type ConsumerCreationParams<Event> = {
//   // client: MongoClient
//   // db: Db
//   publish: (event: Event) => AsyncOrSync<void> | never
//   /**
//    * @defaultValue `default`
//    */
//   partitionKey?: string
//   /**
//    * @defaultValue 1000
//    */
//   waitAfterFailedPublishMs?: number
//   /**
//    * @defaultValue true
//    */
//   shouldDisposeOnSigterm?: boolean
//   /**
//    * Use with consciously and carefully.
//    * When `true`, Hermes will be affecting many documents, resulting in much more I/O operations.
//    * @defaultValue false
//    */
//   saveTimestamps?: boolean
//   /**
//    * @defaultValue `noop`
//    */
//   onFailedPublish?: ErrorCallback
//   /**
//    * @defaultValue `noop`
//    */
//   onDbError?: ErrorCallback
//   /**
//    * @defaultValue `() => new Date()`
//    */
//   now?: NowFunction
// }

export const migrate = async (sql: Sql) => {
  await sql`
    DO $$
    BEGIN
      CREATE TABLE IF NOT EXISTS outbox (
        position    BIGSERIAL     PRIMARY KEY,
        event_type  VARCHAR(250)  NOT NULL,
        data        JSONB         NOT NULL
      );

      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'outbox_pub') 
      THEN
          CREATE PUBLICATION outbox_pub FOR TABLE outbox;
      END IF;
    END $$;
  `
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'outbox_pub') 
      THEN
          SELECT * FROM pg_create_logical_replication_slot('outbox_slot', 'pgoutput');
      END IF;
    END $$;
  `
}

// export const createOutboxConsumer = <Event>(params: ConsumerCreationParams<Event>): OutboxConsumer<Event> => {
//   //
// }
