import {
  Duration,
  NonEmptyString,
  PositiveInteger,
  Uuid4String,
  addDisposeOnSigterm,
  literalObject,
  parseUuid4,
} from '@arturwojnar/hermes'
import {
  type HermesMessageEnvelope,
  type MessageEnvelope,
  createOutboxConsumer,
  useBasicAsyncOutboxConsumerPolicy,
} from '@arturwojnar/hermes-postgresql'
import { Command, DefaultCommandMetadata, DefaultRecord, Event, getInMemoryMessageBus } from '@event-driven-io/emmett'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { StatusCodes } from 'http-status-codes'
import crypto, { randomInt } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import postgres, { PostgresError, Sql } from 'postgres'
import validator from 'validator'

const app = express()

app.use(express.json())
app.use(cors())
app.use(helmet())

type MessageId = Uuid4String<'MessageId'>
type PatientId = Uuid4String<'PatientId'>
type Subject = NonEmptyString<'Subject'>
type Email = NonEmptyString<'Email'>
type RegisterPatientRequest = {
  email: string
}
type RegisterPatientResponse = {
  id: PatientId
}
type CommonMetadata = DefaultCommandMetadata & {
  redeliveryCount: number
  messageId: string
}
type DomainCommand<CommandType extends string = string, CommandData extends DefaultRecord = DefaultRecord> = {
  kind: 'command'
} & Command<CommandType, CommandData, CommonMetadata | undefined>
type DomainEvent<EventType extends string = string, EventData extends DefaultRecord = DefaultRecord> = {
  kind: 'event'
} & Event<EventType, EventData, CommonMetadata | undefined>
type _AddUserToIdp = DomainCommand<
  '_AddUserToIdp',
  {
    systemId: PatientId
    email: Email
  }
>
type _StorePatient = DomainCommand<
  '_StorePatient',
  {
    systemId: PatientId
    sub: Subject
    email: Email
  }
>
type _RevertPatientRegistration = DomainCommand<
  '_RevertPatientRegistration',
  | {
      systemId: PatientId
    }
  | {
      sub: Subject
    }
  | {
      systemId: PatientId
      sub: Subject
    }
>
type PatientRegisteredSuccessfully = DomainEvent<
  'PatientRegisteredSuccessfully',
  {
    patientId: PatientId
    patientSub: Subject
  }
>
type PatientRegistrationFailed = DomainEvent<
  'PatientRegisteredSuccessfully',
  {
    email: Email
  }
>
type RegisterPatientCommand = _AddUserToIdp | _StorePatient | _RevertPatientRegistration
type RegisterPatientEvent = PatientRegisteredSuccessfully | PatientRegistrationFailed

const dbOptions = {
  host: 'localhost',
  port: 5434,
  database: 'hermes',
  user: 'hermes',
  password: 'hermes',
}
const messageBus = getInMemoryMessageBus()
const sql = postgres(dbOptions)

const parseEmail = (value: string) => {
  if (!validator.isEmail(value)) {
    throw new Error(`The value ${value} is not an email.`)
  }

  return value as Email
}
const parsePatientId = (value: string) => parseUuid4<'PatientId'>(value) as PatientId
const parseMessageId = (value: string) => parseUuid4<'MessageId'>(value) as MessageId

const getIdPUser = async (email: Email): Promise<Subject> => Promise.resolve(crypto.randomUUID() as Subject)
const addUserToIdentityProvider = async (email: Email) => {
  console.info(`Adding ${email} to IdP`)
  await setTimeout(200)
  return crypto.randomUUID() as Subject
}
const removeUserFromIdentityProvider = async (sub: Subject) => {
  console.info(`Removing ${sub} from the IdP`)
  await setTimeout(200)
}
const storePatient = async (systemId: PatientId, sub: Subject, sql?: Sql): Promise<PositiveInteger> => {
  console.info(`Storing ${systemId} / ${sub}`)
  await setTimeout(200)
  return randomInt(99999999)
}
const removePatient = async (systemId: PatientId) => {
  console.info(`Removing ${systemId} from the database`)
  await setTimeout(200)
}
const waitForResult = async (systemId: PatientId): Promise<void> => {
  await setTimeout(Duration.ofSeconds(5).ms)
}
const constructMessageId = (...values: (string | { toString: () => string })[]) => {
  return values
    .reduce<crypto.Hash>((messageId, value) => {
      messageId.update(value.toString())

      return messageId
    }, crypto.createHash('sha256'))
    .digest('hex')
}

const publishOne = async (
  envelope: Omit<HermesMessageEnvelope<RegisterPatientCommand | RegisterPatientEvent>, 'lsn'>,
) => {
  const { message, messageId, redeliveryCount } = envelope
  const metadata: CommonMetadata = {
    redeliveryCount,
    messageId,
    now: new Date(),
  }
  console.info(`publish ${message.type}`)

  if (message.kind === 'command') {
    await messageBus.send({
      ...message,
      metadata,
    })
  } else {
    await messageBus.publish({
      ...message,
      metadata,
    })
  }
}
const outbox = createOutboxConsumer<RegisterPatientCommand | RegisterPatientEvent>({
  getOptions() {
    return {
      host: 'localhost',
      port: 5434,
      database: 'hermes',
      user: 'hermes',
      password: 'hermes',
    }
  },
  publish: async (message) => {
    // if this function passes, then the message will be acknowledged;
    // otherwise, in case of an error the message won't be acknowledged.
    if (Array.isArray(message)) {
      for (const nextMessage of message) {
        await publishOne(nextMessage)
      }
    } else {
      await publishOne(message)
    }
  },
  consumerName: 'app',
  asyncOutbox: useBasicAsyncOutboxConsumerPolicy(),
})

const revertRegistration = async (params: _RevertPatientRegistration['data'], email: Email) => {
  const messageIdParam = 'sub' in params ? params.sub.toString() : params.systemId.toString()
  const revertCommand = literalObject<MessageEnvelope<_RevertPatientRegistration>>({
    message: {
      kind: 'command',
      type: '_RevertPatientRegistration',
      data: params,
    },
    messageId: constructMessageId('_RevertPatientRegistration', messageIdParam),
    messageType: '_RevertPatientRegistration',
  })
  const registrationFailedEvent = literalObject<MessageEnvelope<PatientRegistrationFailed>>({
    messageId: constructMessageId('PatientRegistrationFailedPatientRegistrationFailed', messageIdParam),
    messageType: 'PatientRegistrationFailed',
    message: {
      kind: 'event',
      type: 'PatientRegisteredSuccessfully',
      data: {
        email,
      },
    },
  })

  await outbox.send([revertCommand, registrationFailedEvent])
}

const sendStoreCommand = async (sub: Subject, systemId: PatientId, email: Email) => {
  const storePatientCommand = literalObject<MessageEnvelope<_StorePatient>>({
    message: {
      kind: 'command',
      type: '_StorePatient',
      data: { systemId, sub, email },
    },
    messageId: constructMessageId('_StorePatient', sub),
    messageType: '_StorePatient',
  })
  await outbox.queue(storePatientCommand)
}

messageBus.handle<_RevertPatientRegistration>(async ({ data, metadata }) => {
  try {
    if ('systemId' in data) {
      await removePatient(data.systemId)
    }

    if ('sub' in data) {
      await removeUserFromIdentityProvider(data.sub)
    }
  } catch (error) {
    if (metadata && 'redeliveryCount' in metadata && metadata.redeliveryCount < 5) {
      throw error
    }
  }
}, '_RevertPatientRegistration')

messageBus.handle<_AddUserToIdp>(async ({ data, metadata }) => {
  let sub: Subject | undefined

  try {
    console.info(`_AddUserToIdp`)
    sub = await addUserToIdentityProvider(data.email)
    // This is the place where something bad can happen.
    // Imagine that the previous I/O operation is completed, and the next one will never be.
    // If so, the handler will be called again. That's why this is called “at-least-once delivery”.
    await sendStoreCommand(sub, data.systemId, data.email)
  } catch (error) {
    // Handling the case when _AddUserToIdp is called another time.
    // Before the change happened (addUserToIdentityProvider) without publishing a command (sendStoreCommand).
    if ((error as Error)?.name === `UserAlreadyExistsError`) {
      await sendStoreCommand(await getIdPUser(data.email), data.systemId, data.email)
    } else {
      // In this place we can check the `redeliveryCount` of `metadata`.
      console.error(error)

      // Fail on the `sendStoreCommand`.
      if (sub) {
        await revertRegistration({ sub }, data.email)
      }
      // If an error if thrown, then this handler fails
      // and the related outbox message won't be acknowledged
      // but we don;t do that in this case.
    }
  }
}, '_AddUserToIdp')

messageBus.handle<_StorePatient>(async ({ data }) => {
  try {
    console.info(`_StorePatient`)

    await sql.begin(async (sql) => {
      await storePatient(data.systemId, data.sub, sql)
      const patientRegisterdEvent = literalObject<MessageEnvelope<PatientRegisteredSuccessfully>>({
        message: {
          kind: 'event',
          type: 'PatientRegisteredSuccessfully',
          data: { patientId: data.systemId, patientSub: data.sub },
        },
        messageId: constructMessageId('PatientRegisteredSuccessfully', data.sub),
        messageType: 'PatientRegisteredSuccessfully',
      })
      await outbox.queue(patientRegisterdEvent, { tx: sql })
    })
  } catch (error) {
    // Patient already exists.
    if ((error as PostgresError)?.code === `23505`) {
      return
    }

    console.error(error)

    await revertRegistration({ sub: data.sub, systemId: data.systemId }, data.email)
  }
}, '_StorePatient')

const registerPatient = async (params: RegisterPatientRequest) => {
  const patientId = parsePatientId(crypto.randomUUID())
  const addUserToIdPCommand = literalObject<MessageEnvelope<_AddUserToIdp>>({
    message: {
      kind: 'command',
      type: '_AddUserToIdp',
      data: { email: parseEmail(params.email), systemId: patientId },
    },
    messageType: '_AddUserToIdp',
    messageId: constructMessageId('_AddUserToIdp', patientId),
  })

  await outbox.queue(addUserToIdPCommand)

  return patientId
}

app.post<string, any, RegisterPatientResponse, RegisterPatientRequest>('/patient', async (req, res) => {
  const { body } = req

  const patientId = await registerPatient(body)

  try {
    await waitForResult(patientId)

    res.send({ id: patientId })
  } catch (error) {
    // do logging
    res.sendStatus(StatusCodes.REQUEST_TIMEOUT)
  }
})

const main = async () => {
  try {
    const stopOutbox = await outbox.start()
    // const stopAsyncOutbox = asyncOutbox.start()

    addDisposeOnSigterm(stopOutbox)
    // addDisposeOnSigterm(stopAsyncOutbox)
    addDisposeOnSigterm(sql.end)

    addDisposeOnSigterm(() => process.exit(0))
  } catch (error) {
    //
    console.error(error)
    throw error
  }
}

main()

app.listen(3000)
