import postgres from 'postgres'
import * as crypto from 'node:crypto'

const parseArgs = (args) => {
  const result = {}

  args.forEach((arg, index) => {
    if (arg.startsWith('-')) {
      // Remove leading dashes
      const key = arg.replace(/^--?/, '')

      // Handle `-n=10` style
      if (key.includes('=')) {
        const [name, value] = key.split('=', 2)
        result[name] = isNaN(value) ? value : Number(value)
      } else {
        // Handle `-n 10` style
        const nextValue = args[index + 1]
        if (nextValue && !nextValue.startsWith('-')) {
          result[key] = isNaN(nextValue) ? nextValue : Number(nextValue)
        }
      }
    }
  })

  return result
}

// Example usage:
const args = process.argv.slice(2) // Skip `node` and script name
const parsedArgs = parseArgs(args)
const n = Number(parsedArgs['n']) || 1

console.info(`n = ${n}`)

const send = async () => {
  const sql = postgres({
    host: 'localhost',
    port: 5434,
    database: 'hermes',
    user: 'hermes',
    password: 'hermes',
    types: {
      bigint: postgres.BigInt,
    },
  })

  try {
    const p = Promise.all(
      Array(n)
        .fill(0)
        .map((_, i) => {
          return sql`
            INSERT INTO outbox ("messageId", "messageType", "partitionKey", "data")
            VALUES(${crypto.randomBytes(10).toString('hex')}, 'SomeEvent', 'default', ${sql.json({ i })})
          `
        }),
    )
    await p

    console.info(`Sent`)
  } catch (e) {
    console.error(e)
  } finally {
    await sql.end()
  }
}

send()
