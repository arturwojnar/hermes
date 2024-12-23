const toTimestamp = (value: bigint) => new Date(Date.UTC(2000, 0, 1) + Number(value / 1000n))
const toServerSystemClock = (epochMs: number) => BigInt(epochMs - Date.UTC(2000, 0, 1)) * 1000n

export { toServerSystemClock, toTimestamp }
