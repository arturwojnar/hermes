'use strict';

const hermesPostgresql = require('..');
const assert = require('assert').strict;

assert.strictEqual(hermesPostgresql(), 'Hello from hermesPostgresql');
console.info('hermesPostgresql tests passed');
