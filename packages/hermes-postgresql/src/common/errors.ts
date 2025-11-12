import { HermesError } from '@arturwojnar/hermes'
import { DeepReadonly } from 'ts-essentials'

/**
 * Error codes specific to Hermes PostgreSQL.
 *
 * These codes help identify and handle different error scenarios
 * when working with the outbox consumer.
 */
enum HermesErrorCode {
  /**
   * Thrown when attempting to start a consumer that's already taken by another process.
   *
   * This occurs when a PostgreSQL replication slot with the same name is already
   * active in another consumer instance.
   */
  ConsumerAlreadyTaken = 'ConsumerAlreadyTaken',
}

/**
 * Parameters for the {@link HermesConsumerAlreadyTakenError}.
 */
type ConsumerAlreadyTakenParams = DeepReadonly<{
  /** The consumer name that's already taken */
  consumerName: string
  /** The partition key of the consumer that's already taken */
  partitionKey: string
}>

/**
 * Error thrown when a consumer with the same name and partition key is already running.
 *
 * This error occurs when attempting to create a PostgreSQL replication slot that's
 * already in use by another consumer instance. Only one consumer per
 * (`consumerName`, `partitionKey`) combination can run at a time.
 *
 * ## Common Causes
 *
 * 1. **Multiple instances** of the same service running without different partition keys
 * 2. **Crashed process** left a replication slot active (will eventually timeout)
 * 3. **Configuration error** using the same consumer name across different services
 *
 * ## Resolution Strategies
 *
 * ### Option 1: Use Different Partition Keys
 * ```typescript
 * // Instance 1
 * const outbox1 = createOutboxConsumer({
 *   // ...
 *   consumerName: 'my-service',
 *   partitionKey: 'instance-1' // Different partition
 * })
 *
 * // Instance 2
 * const outbox2 = createOutboxConsumer({
 *   // ...
 *   consumerName: 'my-service',
 *   partitionKey: 'instance-2' // Different partition
 * })
 * ```
 *
 * ### Option 2: Wait and Retry
 * ```typescript
 * async function startWithRetry(outbox: OutboxConsumer, maxRetries = 3) {
 *   for (let i = 0; i < maxRetries; i++) {
 *     try {
 *       return await outbox.start()
 *     } catch (error) {
 *       if (error instanceof HermesConsumerAlreadyTakenError) {
 *         console.log(`Consumer taken, retrying in 5s (${i + 1}/${maxRetries})...`)
 *         await new Promise(resolve => setTimeout(resolve, 5000))
 *       } else {
 *         throw error
 *       }
 *     }
 *   }
 *   throw new Error('Failed to start consumer after retries')
 * }
 * ```
 *
 * ### Option 3: Manually Drop Replication Slot (Use with Caution)
 * ```sql
 * -- Check active replication slots
 * SELECT * FROM pg_replication_slots;
 *
 * -- Drop the slot (only if you're sure the other consumer is dead)
 * SELECT pg_drop_replication_slot('hermes_my_service_default');
 * ```
 *
 * @example
 * ### Catching and Handling the Error
 * ```typescript
 * try {
 *   const stop = await outbox.start()
 * } catch (error) {
 *   if (error instanceof HermesConsumerAlreadyTakenError) {
 *     console.error(
 *       `Consumer '${error.params.consumerName}' ` +
 *       `with partition '${error.params.partitionKey}' is already running`
 *     )
 *
 *     // Option: Use a different partition key
 *     // Option: Wait and retry
 *     // Option: Alert ops team
 *   } else {
 *     throw error
 *   }
 * }
 * ```
 *
 * @example
 * ### Preventing the Error in Multi-Instance Deployments
 * ```typescript
 * // Use environment-based partition keys
 * const outbox = createOutboxConsumer({
 *   // ...
 *   consumerName: 'order-service',
 *   partitionKey: process.env.INSTANCE_ID || 'default'
 * })
 * ```
 *
 * @see {@link ConsumerCreationParams.consumerName} for consumer naming
 * @see {@link ConsumerCreationParams.partitionKey} for partition configuration
 */
class HermesConsumerAlreadyTakenError extends HermesError<
  ConsumerAlreadyTakenParams,
  HermesErrorCode.ConsumerAlreadyTaken
> {
  /**
   * Creates a new HermesConsumerAlreadyTakenError.
   *
   * @param params - The consumer name and partition key that are already taken
   */
  constructor(params: ConsumerAlreadyTakenParams) {
    super(
      HermesErrorCode.ConsumerAlreadyTaken,
      params,
      `Consumer ${params.consumerName} with the ${params.partitionKey} has been already taken by another PID.`,
    )
  }
}

export { HermesConsumerAlreadyTakenError, HermesErrorCode }
