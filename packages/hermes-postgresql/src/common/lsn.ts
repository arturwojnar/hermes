type Lsn = `${string}/${string}`

const LSN_REGEXP = new RegExp(`^[0-9a-f]+/[0-9a-f]+$`, 'i')

const getUpperAndLowerWAL = (lsn: Lsn) => {
  return lsn.split('/').map((x) => parseInt(x, 16))
}
const convertLsnToBigInt = (lsn: Lsn) => {
  const [upperWal, lowerWal] = getUpperAndLowerWAL(lsn)

  return (BigInt(upperWal) << 32n) | BigInt(lowerWal)
}
const convertLsnToBuffer = (lsn: Lsn) => {
  const buffer = Buffer.alloc(8)
  const value = convertLsnToBigInt(lsn)

  buffer.writeBigUInt64BE(value)

  return buffer
}
const convertBigIntToLsn = (lsn: bigint) => {
  const upperWal = lsn >> 32n
  const lowerWal = lsn & 0xffffffffn
  return `${upperWal.toString(16).toUpperCase()}/${lowerWal.toString(16).toUpperCase()}`
}
const incrementWAL = (lsn: Lsn) => {
  return convertLsnToBigInt(lsn) + BigInt(1)
}
const constructLsn = (lsn: Buffer): Lsn => {
  const upperWal = lsn.readUInt32BE(0).toString(16).toUpperCase()
  const lowerWal = lsn.readUInt32BE(4).toString(16).toUpperCase()

  return `${upperWal}/${lowerWal}`
}
const isLsn = (value: string): value is Lsn => LSN_REGEXP.test(value)
const toLsn = (value: string): Lsn => {
  if (isLsn(value)) {
    return value
  }

  throw new Error(`not LSN ${value}`)
}

export {
  constructLsn,
  convertBigIntToLsn,
  convertLsnToBigInt,
  convertLsnToBuffer,
  getUpperAndLowerWAL,
  incrementWAL,
  isLsn,
  Lsn,
  toLsn,
}
