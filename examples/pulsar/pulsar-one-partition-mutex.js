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
Object.defineProperty(exports, "__esModule", { value: true });
const hermes_1 = require("@arturwojnar/hermes");
const hermes_mongodb_1 = require("@arturwojnar/hermes-mongodb");
const utils_1 = require("../../packages/hermes/src/utils");
const mongodb_1 = require("../node_modules/mongodb/mongodb");
const index_1 = require("../node_modules/pulsar-client/index");
const do_publishing_1 = require("./do-publishing");
const do_receiving_1 = require("./do-receiving");
const pulsar_mutex_1 = require("./pulsar-mutex");
const MONGODB_URI = `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`;
const PULSAR_URI = `pulsar://localhost:6650`;
const start = () => __awaiter(void 0, void 0, void 0, function* () {
    const pulsarClient = new index_1.Client({ serviceUrl: PULSAR_URI });
    const mutex = new pulsar_mutex_1.PulsarMutex(pulsarClient);
    const producer = yield pulsarClient.createProducer({ topic: `public/default/events` });
    const subscription = yield pulsarClient.subscribe({ topic: `public/default/events`, subscription: 'test' });
    (0, hermes_1.addDisposeOnSigterm)(() => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, utils_1.swallow)(() => mutex.unlock());
        yield (0, utils_1.swallow)(() => subscription.close());
        yield (0, utils_1.swallow)(() => producer.close());
        yield (0, utils_1.swallow)(() => pulsarClient.close());
    }));
    yield mutex.lock();
    try {
        const client = new mongodb_1.MongoClient(MONGODB_URI);
        const db = client.db('aid-kit');
        yield client.connect();
        const outbox = (0, hermes_mongodb_1.createOutboxConsumer)({
            client,
            db,
            publish: (event) => __awaiter(void 0, void 0, void 0, function* () {
                // Normally, you should choose a corresponding topic for the given event.
                yield producer.send({
                    data: Buffer.from(JSON.stringify(event)),
                });
            }),
        });
        // Hermes automatically registers the dispose on SIGTERM
        yield outbox.start();
        (0, do_publishing_1.doPublishing)(outbox).catch(console.error);
        (0, do_receiving_1.doReceiving)(subscription).catch(console.error);
    }
    catch (error) {
        console.error(error);
        throw error;
    }
});
start();
