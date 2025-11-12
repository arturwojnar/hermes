import { ClientSession, Db, MongoClient, ObjectId, type ChangeStreamInsertDocument, type ResumeToken } from 'mongodb'
import { type AsyncOrSync } from 'ts-essentials'

/**
 * MongoDB document model for outbox messages.
 *
 * This represents the structure of documents stored in the outbox collection.
 * Each message is tracked with metadata for delivery and debugging.
 *
 * @template Event - The type of the domain event/message
 *
 * @example
 * ```typescript
 * // Document in MongoDB outbox collection:
 * {
 *   _id: ObjectId("507f1f77bcf86cd799439011"),
 *   occurredAt: ISODate("2024-01-15T10:30:00Z"),
 *   data: {
 *     type: "MedicineAssigned",
 *     patientId: "patient-123",
 *     medicineId: "med-456"
 *   },
 *   partitionKey: "default",
 *   sentAt: ISODate("2024-01-15T10:30:02Z")  // Optional, only if saveTimestamps enabled
 * }
 * ```
 */
type OutboxMessageModel<Event> = {
  /** MongoDB ObjectId uniquely identifying this message */
  _id: ObjectId
  /** Timestamp when the event was queued to the outbox */
  occurredAt: Date
  /** The actual domain event/message data */
  data: Event
  /** Partition key for horizontal scaling (default: 'default') */
  partitionKey: string
  /** Optional timestamp when message was successfully sent (only if saveTimestamps enabled) */
  sentAt?: Date
}

/**
 * MongoDB document model for outbox consumer state.
 *
 * This tracks the consumer's progress through the Change Stream, enabling
 * resume capability after crashes or restarts.
 *
 * @example
 * ```typescript
 * // Document in MongoDB consumer state collection:
 * {
 *   _id: ObjectId("507f1f77bcf86cd799439012"),
 *   lastProcessedId: ObjectId("507f1f77bcf86cd799439011"),
 *   resumeToken: { _data: "826..." },
 *   partitionKey: "default",
 *   lastUpdatedAt: ISODate("2024-01-15T10:30:02Z"),
 *   createdAt: ISODate("2024-01-15T10:00:00Z")
 * }
 * ```
 */
type OutboxConsumerModel = {
  /** MongoDB ObjectId uniquely identifying this consumer */
  _id: ObjectId
  /** ObjectId of the last successfully processed message (null if none processed yet) */
  lastProcessedId: ObjectId | null
  /** MongoDB Change Stream resume token for crash recovery */
  resumeToken: ResumeToken
  /** Partition key this consumer is responsible for */
  partitionKey: string
  /** Timestamp of last state update (null if never updated) */
  lastUpdatedAt: Date | null
  /** Timestamp when this consumer was created */
  createdAt: Date
}

/**
 * MongoDB Change Stream document type for outbox messages.
 *
 * This represents the structure of change events received from MongoDB Change Streams.
 *
 * @template Event - The type of the domain event/message
 *
 * @internal
 */
type OutboxMessageStream<Event> = ChangeStreamInsertDocument<OutboxMessageModel<Event>>

/**
 * Function type that starts the outbox consumer and returns a stop function.
 *
 * When called, this function:
 * 1. Checks MongoDB version compatibility
 * 2. Ensures indexes are created
 * 3. Loads or creates consumer state
 * 4. Opens a Change Stream
 * 5. Begins processing events
 *
 * @returns Promise that resolves to a {@link Stop} function for graceful shutdown
 *
 * @example
 * Basic start/stop
 * ```typescript
 * const outbox = createOutboxConsumer({ ... })
 *
 * // Start consuming
 * const stop = await outbox.start()
 * console.log('Consumer started')
 *
 * // Later, gracefully stop
 * await stop()
 * console.log('Consumer stopped')
 * ```
 *
 * @example
 * Automatic cleanup with shouldDisposeOnSigterm
 * ```typescript
 * const outbox = createOutboxConsumer({
 *   // ...
 *   shouldDisposeOnSigterm: true  // Default behavior
 * })
 *
 * const stop = await outbox.start()
 * // Consumer will automatically stop on SIGTERM/SIGINT
 * // No need to manually call stop() in signal handlers
 * ```
 *
 * @see {@link Stop} - The returned shutdown function
 */
type Start = () => Promise<Stop>

/**
 * Function type that stops the outbox consumer gracefully.
 *
 * When called, this function:
 * 1. Closes the Change Stream
 * 2. Waits for in-flight events to complete
 * 3. Cleans up resources
 *
 * @returns Promise that resolves when consumer has fully stopped
 *
 * @example
 * Manual shutdown
 * ```typescript
 * const stop = await outbox.start()
 *
 * // Later...
 * await stop()
 * console.log('Consumer stopped gracefully')
 * ```
 *
 * @example
 * Shutdown with timeout
 * ```typescript
 * const stop = await outbox.start()
 *
 * process.on('SIGTERM', async () => {
 *   console.log('Shutting down...')
 *
 *   const timeout = setTimeout(() => {
 *     console.error('Shutdown timeout, forcing exit')
 *     process.exit(1)
 *   }, 5000)
 *
 *   await stop()
 *   clearTimeout(timeout)
 *   console.log('Shutdown complete')
 * })
 * ```
 *
 * @see {@link Start} - The function that returns this stop function
 */
type Stop = () => Promise<void>

/**
 * Function type for publishing events to the outbox with transactional consistency.
 *
 * This function queues events to the outbox collection. Events are inserted into MongoDB
 * and will be streamed via Change Streams to the consumer's `publish` callback.
 *
 * ## Usage Patterns
 *
 * 1. **With callback** - Publish event with business logic in same transaction
 * 2. **With session** - Use existing MongoDB session
 * 3. **Without transaction** - Creates new transaction automatically
 *
 * @template Event - Type of events (use discriminated unions for multiple event types)
 *
 * @param event - Single event or array of events to publish
 * @param sessionOrCallback - Optional session or callback for transactional consistency
 *
 * @returns Promise that resolves when event(s) are committed to outbox collection
 *
 * @example
 * Publish with business logic (recommended)
 * ```typescript
 * await outbox.publish(medicineAssignedEvent, async (session, db) => {
 *   // Business logic in same transaction
 *   await db.collection('assignments').insertOne({
 *     patientId: 'patient-123',
 *     medicineId: 'med-456',
 *     assignedAt: new Date()
 *   }, { session })
 * })
 * // Either both succeed or both fail - no inconsistency possible
 * ```
 *
 * @example
 * Publish with existing session
 * ```typescript
 * await client.withSession(async (session) => {
 *   await session.withTransaction(async (session) => {
 *     // Business operations
 *     await db.collection('tasks').updateOne(
 *       { _id: taskId },
 *       { $set: { status: 'completed' } },
 *       { session }
 *     )
 *
 *     // Publish event in same transaction
 *     await outbox.publish({
 *       type: 'TaskCompleted',
 *       taskId,
 *       completedAt: new Date()
 *     }, session)
 *   })
 * })
 * ```
 *
 * @example
 * Publish without transaction (auto-transaction)
 * ```typescript
 * // Hermes creates transaction automatically
 * await outbox.publish({
 *   type: 'NotificationSent',
 *   userId: 'user-123'
 * })
 * // Event inserted in its own transaction
 * ```
 *
 * @example
 * Publish multiple events
 * ```typescript
 * await outbox.publish([
 *   { type: 'OrderCreated', orderId: '1' },
 *   { type: 'InvoiceGenerated', invoiceId: '1' }
 * ], async (session, db) => {
 *   await db.collection('orders').insertOne(order, { session })
 * })
 * ```
 *
 * @see {@link SaveWithEventCallback} - Callback type for transactional publishing
 * @see {@link OutboxConsumer} - Consumer interface containing this method
 */
type Publish<Event> = (
  event: Event | Event[],
  /**
   * @defaultValue undefined - Creates new transaction
   */
  sessionOrCallback?: ClientSession | SaveWithEventCallback | undefined,
) => Promise<void>

/**
 * Callback function type for publishing events with business logic in the same transaction.
 *
 * This callback receives a new MongoDB session and allows you to perform business operations
 * atomically with event publishing. The callback runs inside a MongoDB transaction, ensuring
 * either both operations succeed or both fail.
 *
 * @param session - MongoDB session for the transaction (pass this to all MongoDB operations)
 * @param db - The database instance passed during consumer creation
 * @param client - The MongoDB client instance passed during consumer creation
 *
 * @returns Promise that resolves when all operations in the callback complete
 *
 * @example
 * Medicine assignment with event
 * ```typescript
 * await outbox.publish(
 *   {
 *     type: 'MedicineAssigned',
 *     patientId: 'patient-123',
 *     medicineId: 'med-456'
 *   },
 *   async (session, db) => {
 *     // Store assignment in same transaction
 *     await db.collection('medicine_assignments').insertOne({
 *       patientId: 'patient-123',
 *       medicineId: 'med-456',
 *       assignedAt: new Date(),
 *       assignedBy: 'doctor-789'
 *     }, { session })
 *
 *     // Update patient record
 *     await db.collection('patients').updateOne(
 *       { _id: 'patient-123' },
 *       { $push: { assignedMedicines: 'med-456' } },
 *       { session }
 *     )
 *   }
 * )
 * ```
 *
 * @example
 * Order creation with multiple updates
 * ```typescript
 * await outbox.publish(
 *   {
 *     type: 'OrderCreated',
 *     orderId: 'order-123',
 *     customerId: 'customer-456'
 *   },
 *   async (session, db, client) => {
 *     // Create order
 *     await db.collection('orders').insertOne(order, { session })
 *
 *     // Update customer stats
 *     await db.collection('customers').updateOne(
 *       { _id: 'customer-456' },
 *       { $inc: { totalOrders: 1 } },
 *       { session }
 *     )
 *
 *     // Access different database if needed
 *     const analyticsDb = client.db('analytics')
 *     await analyticsDb.collection('events').insertOne(
 *       { type: 'order_created', timestamp: new Date() },
 *       { session }
 *     )
 *   }
 * )
 * ```
 *
 * @see {@link Publish} - Function type that accepts this callback
 */
type SaveWithEventCallback = (session: ClientSession, db: Db, client: MongoClient) => Promise<void>

/**
 * Interface for the MongoDB Outbox Consumer.
 *
 * This is the main interface for interacting with Hermes MongoDB. It provides methods for:
 * - Starting/stopping the consumer
 * - Publishing events with transactional consistency
 * - Scoping multiple event publishes to a single transaction
 *
 * @template Event - Type of events handled by the consumer (use discriminated unions for multiple event types)
 *
 * @example
 * Basic consumer setup
 * ```typescript
 * type DomainEvent =
 *   | { type: 'MedicineAssigned'; patientId: string; medicineId: string }
 *   | { type: 'TaskCompleted'; taskId: string; completedAt: Date }
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   client,
 *   db: client.db('hospital'),
 *   publish: async (event) => {
 *     await messageBroker.publish(event)
 *   }
 * })
 *
 * // Start consuming
 * const stop = await outbox.start()
 *
 * // Publish events
 * await outbox.publish({
 *   type: 'MedicineAssigned',
 *   patientId: 'patient-123',
 *   medicineId: 'med-456'
 * }, async (session, db) => {
 *   await db.collection('assignments').insertOne({ ... }, { session })
 * })
 * ```
 *
 * @see {@link createOutboxConsumer} - Factory function to create instances
 * @see {@link Start} - Start method type
 * @see {@link Publish} - Publish method type
 * @see {@link WithScope} - WithScope method type
 */
type OutboxConsumer<Event extends OutboxEvent> = {
  /** Starts the consumer and begins processing events via Change Streams */
  start: Start
  /** Publishes event(s) to the outbox with optional transactional consistency */
  publish: Publish<Event>
  /** Creates a transaction scope for publishing multiple events atomically */
  withScope: WithScope<Event>
}

/**
 * Callback function type for handling errors.
 *
 * Used for error callbacks in {@link ConsumerCreationParams} to handle publish failures
 * and database errors.
 *
 * @param error - The error that occurred (can be any type)
 *
 * @example
 * Logging errors
 * ```typescript
 * const outbox = createOutboxConsumer({
 *   // ...
 *   onFailedPublish: (error) => {
 *     console.error('Failed to publish event:', error)
 *     // Alert monitoring system
 *     monitoring.alert('outbox_publish_failed', { error })
 *   },
 *   onDbError: (error) => {
 *     console.error('Database error:', error)
 *     // Alert critical error
 *     monitoring.alert('outbox_db_error', { error })
 *   }
 * })
 * ```
 */
type ErrorCallback = (error: unknown) => void

/**
 * Function type that returns the current date/time.
 *
 * Used internally for timestamping operations. Can be overridden for testing.
 *
 * @returns Current date/time
 *
 * @example
 * Using custom time function for testing
 * ```typescript
 * const outbox = createOutboxConsumer({
 *   // ...
 *   now: () => new Date('2024-01-15T10:00:00Z')  // Fixed time for tests
 * })
 * ```
 *
 * @example
 * Default behavior
 * ```typescript
 * const outbox = createOutboxConsumer({
 *   // ...
 *   // Defaults to: () => new Date()
 * })
 * ```
 */
type NowFunction = () => Date

/**
 * Configuration parameters for creating a MongoDB outbox consumer.
 *
 * @template Event - Type of events handled by the consumer (use discriminated unions for multiple event types)
 *
 * @example
 * Basic configuration
 * ```typescript
 * type DomainEvent =
 *   | { type: 'MedicineAssigned'; patientId: string; medicineId: string }
 *   | { type: 'TaskCompleted'; taskId: string }
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   client: mongoClient,
 *   db: mongoClient.db('hospital'),
 *   publish: async (event) => {
 *     await messageBroker.publish(event)
 *   }
 * })
 * ```
 *
 * @example
 * Full configuration with all options
 * ```typescript
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   client: mongoClient,
 *   db: mongoClient.db('hospital'),
 *   publish: async (event) => {
 *     // IMPORTANT: Throw error on failure to trigger retry
 *     await messageBroker.publish(event)
 *   },
 *   partitionKey: 'tenant-123',
 *   waitAfterFailedPublishMs: 5000,
 *   shouldDisposeOnSigterm: true,
 *   saveTimestamps: false,
 *   onFailedPublish: (error) => {
 *     console.error('Publish failed:', error)
 *   },
 *   onDbError: (error) => {
 *     console.error('Database error:', error)
 *   },
 *   now: () => new Date()
 * })
 * ```
 */
type ConsumerCreationParams<Event> = {
  /**
   * MongoDB client instance.
   *
   * @example
   * ```typescript
   * import { MongoClient } from 'mongodb'
   *
   * const client = new MongoClient('mongodb://localhost:27017')
   * await client.connect()
   * ```
   */
  client: MongoClient

  /**
   * MongoDB database instance where the outbox will operate.
   *
   * The outbox will create two collections in this database:
   * - `hermes_outbox_messages` - Stores outgoing events
   * - `hermes_outbox_consumers` - Stores consumer state
   *
   * @example
   * ```typescript
   * const db = client.db('hospital')
   * ```
   */
  db: Db

  /**
   * Callback function invoked when Hermes delivers an event.
   *
   * **IMPORTANT**: This callback MUST throw an error if publish fails. If it completes
   * successfully, the event is considered delivered and won't be retried.
   *
   * @param event - The event to publish
   * @throws Error to trigger redelivery
   *
   * @example
   * Publishing to RabbitMQ
   * ```typescript
   * publish: async (event) => {
   *   // ✅ Throws on failure - event will be retried
   *   await rabbitMQChannel.publish(
   *     'events',
   *     event.type,
   *     Buffer.from(JSON.stringify(event))
   *   )
   * }
   * ```
   *
   * @example
   * Publishing with idempotency check
   * ```typescript
   * publish: async (event) => {
   *   const eventId = `${event.type}-${event.patientId}`
   *
   *   // Check if already processed
   *   if (await isProcessed(eventId)) {
   *     return // Safe to skip
   *   }
   *
   *   await broker.publish(event)
   *   await markProcessed(eventId)
   * }
   * ```
   */
  publish: (event: Event) => AsyncOrSync<void> | never

  /**
   * Partition key for horizontal scaling.
   *
   * Multiple consumers can run concurrently by using different partition keys.
   * Events are filtered by partition key, allowing you to scale by tenant, region, etc.
   *
   * @defaultValue `'default'`
   *
   * @example
   * Multi-tenant partitioning
   * ```typescript
   * // Tenant 1 consumer
   * const tenant1Outbox = createOutboxConsumer({
   *   // ...
   *   partitionKey: 'tenant-abc'
   * })
   *
   * // Tenant 2 consumer
   * const tenant2Outbox = createOutboxConsumer({
   *   // ...
   *   partitionKey: 'tenant-xyz'
   * })
   *
   * // Publish to specific partition
   * await tenant1Outbox.publish(event, async (session, db) => {
   *   // Event goes to tenant-abc partition
   * })
   * ```
   */
  partitionKey?: string

  /**
   * Wait time in milliseconds after a failed publish attempt before retrying.
   *
   * @defaultValue 1000 (1 second)
   *
   * @example
   * ```typescript
   * {
   *   waitAfterFailedPublishMs: 5000  // Wait 5 seconds between retries
   * }
   * ```
   */
  waitAfterFailedPublishMs?: number

  /**
   * Whether to automatically stop the consumer on SIGTERM/SIGINT signals.
   *
   * When `true`, Hermes registers signal handlers to gracefully shutdown on process termination.
   *
   * @defaultValue true
   *
   * @example
   * Automatic shutdown (default)
   * ```typescript
   * {
   *   shouldDisposeOnSigterm: true  // Consumer stops on SIGTERM/SIGINT
   * }
   * ```
   *
   * @example
   * Manual shutdown control
   * ```typescript
   * {
   *   shouldDisposeOnSigterm: false  // You handle shutdown yourself
   * }
   *
   * const stop = await outbox.start()
   * process.on('SIGTERM', async () => {
   *   await stop()
   *   process.exit(0)
   * })
   * ```
   */
  shouldDisposeOnSigterm?: boolean

  /**
   * Whether to save `sentAt` timestamps for each processed message.
   *
   * ⚠️ **Use with caution**: When `true`, Hermes will update each message document after
   * successful delivery, significantly increasing I/O operations and database load.
   *
   * Only enable this if you need to track exact delivery times for debugging or auditing.
   *
   * @defaultValue false
   *
   * @example
   * ```typescript
   * {
   *   saveTimestamps: true  // Each message gets sentAt field after delivery
   * }
   * ```
   */
  saveTimestamps?: boolean

  /**
   * Callback invoked when event publishing fails.
   *
   * Use this for logging, monitoring, or alerting on publish failures.
   * Hermes will continue retrying the event after calling this callback.
   *
   * @defaultValue No-op function
   *
   * @example
   * ```typescript
   * {
   *   onFailedPublish: (error) => {
   *     console.error('Failed to publish event:', error)
   *     monitoring.increment('outbox.publish.failures')
   *   }
   * }
   * ```
   */
  onFailedPublish?: ErrorCallback

  /**
   * Callback invoked when a database error occurs.
   *
   * Use this for logging, monitoring, or alerting on database issues.
   *
   * @defaultValue No-op function
   *
   * @example
   * ```typescript
   * {
   *   onDbError: (error) => {
   *     console.error('Database error:', error)
   *     monitoring.alert('outbox.database.error', { error })
   *   }
   * }
   * ```
   */
  onDbError?: ErrorCallback

  /**
   * Function that returns the current date/time.
   *
   * Override this for testing with fixed timestamps.
   *
   * @defaultValue `() => new Date()`
   *
   * @example
   * Testing with fixed time
   * ```typescript
   * {
   *   now: () => new Date('2024-01-15T10:00:00Z')
   * }
   * ```
   */
  now?: NowFunction
}

/**
 * Scope object provided to the {@link WithScope} callback.
 *
 * Contains a MongoDB session and a scoped `publish` function that automatically
 * uses the session for transactional consistency.
 *
 * @template Event - Type of events (use discriminated unions for multiple event types)
 *
 * @example
 * Using OutboxScope to publish multiple events
 * ```typescript
 * await outbox.withScope(async ({ publish, session, client }) => {
 *   // All publishes use the same transaction
 *   await publish({ type: 'Event1', data: 'foo' })
 *   await publish({ type: 'Event2', data: 'bar' })
 *
 *   // Session available for MongoDB operations
 *   await db.collection('logs').insertOne({ ... }, { session })
 * })
 * ```
 *
 * @see {@link WithScope} - Function type that creates this scope
 */
type OutboxScope<Event extends OutboxEvent> = {
  /** MongoDB session for the transaction - pass this to all MongoDB operations */
  session: ClientSession
  /** MongoDB client instance */
  client: MongoClient
  /** Scoped publish function that automatically uses the session */
  publish: (event: Event | Event[]) => Promise<void>
}

/**
 * Base type for all events.
 *
 * Events can be any object type. Use discriminated unions with a `type` field
 * for type-safe event handling.
 *
 * @example
 * Domain events with discriminated union
 * ```typescript
 * type DomainEvent =
 *   | { type: 'MedicineAssigned'; patientId: string; medicineId: string }
 *   | { type: 'TaskCompleted'; taskId: string; completedAt: Date }
 *   | { type: 'UserRegistered'; userId: string; email: string }
 *
 * const outbox = createOutboxConsumer<DomainEvent>({
 *   // ...
 *   publish: async (event) => {
 *     switch (event.type) {
 *       case 'MedicineAssigned':
 *         // TypeScript knows event has patientId and medicineId
 *         await handleMedicineAssignment(event)
 *         break
 *       case 'TaskCompleted':
 *         // TypeScript knows event has taskId and completedAt
 *         await handleTaskCompletion(event)
 *         break
 *       case 'UserRegistered':
 *         // TypeScript knows event has userId and email
 *         await handleUserRegistration(event)
 *         break
 *     }
 *   }
 * })
 * ```
 */
type OutboxEvent = object

/**
 * Function type that creates a transaction scope for publishing multiple events atomically.
 *
 * This method is useful when you need to publish multiple events in a single transaction
 * without repeatedly passing the session parameter.
 *
 * ## When to Use
 *
 * - Publishing multiple related events that should be atomic
 * - No business data to save, only events
 * - Simplifying code by not passing session explicitly
 *
 * @template Event - Type of events (use discriminated unions for multiple event types)
 *
 * @param scopeFn - Callback that receives {@link OutboxScope} with session and scoped publish function
 *
 * @returns Promise that resolves when all operations in the scope complete
 *
 * @example
 * Publishing multiple events atomically
 * ```typescript
 * await outbox.withScope(async ({ publish }) => {
 *   // All three events in same transaction
 *   await publish({ type: 'OrderCreated', orderId: '123' })
 *   await publish({ type: 'InventoryReserved', items: [...] })
 *   await publish({ type: 'InvoiceGenerated', invoiceId: '456' })
 * })
 * // Either all three succeed or all three fail
 * ```
 *
 * @example
 * Combining with MongoDB operations
 * ```typescript
 * await outbox.withScope(async ({ publish, session }) => {
 *   // MongoDB operations using the same session
 *   await db.collection('tasks').updateOne(
 *     { _id: taskId },
 *     { $set: { status: 'archived' } },
 *     { session }
 *   )
 *
 *   // Events published in same transaction
 *   await publish({ type: 'TaskArchived', taskId })
 *   await publish({ type: 'NotificationSent', userId: assigneeId })
 * })
 * ```
 *
 * @example
 * Return value from withScope
 * ```typescript
 * const result = await outbox.withScope(async ({ publish, session }) => {
 *   await publish(event1)
 *   await publish(event2)
 *   return { success: true, count: 2 }
 * })
 *
 * console.log(result)  // { success: true, count: 2 }
 * ```
 *
 * @see {@link OutboxScope} - Scope object provided to the callback
 * @see {@link OutboxConsumer} - Consumer interface containing this method
 */
type WithScope<Event extends OutboxEvent> = (scopeFn: (scope: OutboxScope<Event>) => Promise<void>) => Promise<void>

export {
  type ConsumerCreationParams,
  type ErrorCallback,
  type NowFunction,
  type OutboxConsumer,
  type OutboxConsumerModel,
  type OutboxEvent,
  type OutboxMessageModel,
  type OutboxMessageStream,
  type OutboxScope,
  type Publish,
  type SaveWithEventCallback,
  type Start,
  type Stop,
  type WithScope,
}
