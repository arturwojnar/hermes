type Lsn = `${string}/${string}`

const LSN_REGEXP = new RegExp(`[0-9a-f]+/[0-9a-f]+`, 'i')

const convertLsnToBigInt = (lsn: Lsn) => {
  const [upperWal, lowerWal] = lsn.split('/').map((x) => parseInt(x, 16))

  return (BigInt(upperWal) << 32n) | BigInt(lowerWal)
}
const constructLsn = (upperWal: number, lowerWal: number): Lsn => `${upperWal}/${lowerWal}`
const isLsn = (value: string): value is Lsn => LSN_REGEXP.test(value)
const toLsn = (value: string): Lsn => {
  if (isLsn(value)) {
    return value
  }

  throw new Error(`not LSN ${value}`)
}

export { Lsn, constructLsn, convertLsnToBigInt, isLsn, toLsn }
