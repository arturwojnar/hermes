const { randomUUID } = require('crypto')
process.env.MONGOMS_DOWNLOAD_DIR = `/tmp/mongo-mem-${randomUUID()}`
