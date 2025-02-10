"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// import { OutboxConsumer, addDisposeOnSigterm } from '@outbox'
// import { addDisposeOnSigterm } from '@arturwojnar/hermes'
const hermes_1 = require("@arturwojnar/hermes");
// import { createOutboxConsumer } from '@arturwojnar/hermes-mongodb'
const amqplib_1 = __importDefault(require("amqplib"));
const assert_1 = __importDefault(require("assert"));
const mongodb_1 = require("mongodb");
const promises_1 = require("node:timers/promises");
const index_1 = require("../../packages/hermes-mongodb/src/index");
// https://www.rabbitmq.com/blog/2014/02/19/distributed-semaphores-with-rabbitmq
function setupSemaphore() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield amqplib_1.default.connect('amqp://localhost');
        const channel = yield conn.createChannel();
        const semaphoreQueue = 'resource.semaphore';
        yield channel.assertQueue(semaphoreQueue, { durable: true });
        channel.sendToQueue(semaphoreQueue, Buffer.from('token'), { persistent: true });
        console.log('Semaphore setup complete.');
        yield channel.close();
        yield conn.close();
    });
}
function acquireSemaphore() {
    return __awaiter(this, void 0, void 0, function* () {
        const conn = yield amqplib_1.default.connect('amqp://localhost');
        const channel = yield conn.createChannel();
        const semaphoreQueue = 'resource.semaphore';
        yield channel.assertQueue(semaphoreQueue, { durable: true });
        yield channel.consume(semaphoreQueue, (msg) => {
            if (msg && msg.content.toString() === 'token') {
                console.log('Resource acquired');
                // Process the resource as needed. Do not acknowledge the message.
                // If you need to release the semaphore intentionally, you can reject the message back to the queue
                // channel.nack(msg, false, true);
            }
        }, { noAck: false });
    });
}
const MONGODB_URI = `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`;
const QUEUE = `medicine`;
const start = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const client = new mongodb_1.MongoClient(MONGODB_URI);
        const db = client.db('aid-kit');
        const connection = yield amqplib_1.default.connect(`amqp://localhost`);
        (0, assert_1.default)(connection);
        const channel = yield connection.createChannel();
        (0, assert_1.default)(channel);
        channel.assertQueue(QUEUE);
        yield client.connect();
        const outbox = (0, index_1.createOutboxConsumer)({
            client,
            db,
            publish: (event) => __awaiter(void 0, void 0, void 0, function* () {
                (0, assert_1.default)(channel);
                try {
                    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(event)), { mandatory: true });
                    return Promise.resolve();
                }
                catch (_a) {
                    return Promise.reject();
                }
            }),
        });
        const stop = yield outbox.start();
        (0, hermes_1.addDisposeOnSigterm)(() => __awaiter(void 0, void 0, void 0, function* () {
            yield stop();
            yield client.close(true);
            yield connection.close();
            yield channel.close();
        }));
        (() => __awaiter(void 0, void 0, void 0, function* () {
            while (true) {
                const medicineId = new mongodb_1.ObjectId().toString();
                const patientId = new mongodb_1.ObjectId().toString();
                try {
                    yield outbox.publish({
                        name: 'MedicineAssigned',
                        data: {
                            medicineId,
                            patientId,
                        },
                    });
                }
                catch (_b) {
                    yield (0, promises_1.setTimeout)(1000);
                    continue;
                }
                console.info(`Event published for medicine ${medicineId} nad patient ${patientId}.`);
                yield (0, promises_1.setTimeout)(1000);
            }
        }))();
        (() => __awaiter(void 0, void 0, void 0, function* () {
            const connection = yield amqplib_1.default.connect(`amqp://localhost:5672`);
            (0, assert_1.default)(connection);
            const channel = yield connection.createChannel();
            (0, assert_1.default)(channel);
            channel.assertQueue(QUEUE);
            (0, hermes_1.addDisposeOnSigterm)(() => __awaiter(void 0, void 0, void 0, function* () {
                yield connection.close();
                yield channel.close();
            }));
            while (true) {
                try {
                    yield channel.consume(QUEUE, (message) => {
                        if (message) {
                            const payload = JSON.parse(message.content.toString());
                            console.info(`Consumed event for medicine ${payload.data.medicineId} and patient ${payload.data.patientId}`);
                            channel.ack(message);
                        }
                    });
                }
                catch (_c) {
                    yield (0, promises_1.setTimeout)(1000);
                }
            }
        }))();
    }
    catch (error) {
        console.error(error);
        throw error;
    }
});
start();
