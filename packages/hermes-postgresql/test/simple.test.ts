// import { OutboxConsumersCollectionName, OutboxMessagesCollectionName } from '../src/consts.js'
import { expect, jest, test } from '@jest/globals'
import { postgres } from './postgresql.js'

jest.setTimeout(3 * 60 * 1000)

test('Sending one event works', async () => {
  return await postgres(async () => {
    // await migrate(sql)
    // await Promise.resolve()
    await Promise.resolve()
    expect(1).toBe(1)
  })
})
