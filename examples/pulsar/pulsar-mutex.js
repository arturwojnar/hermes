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
exports.PulsarMutex = void 0;
const promises_1 = require("node:timers/promises");
const DEFAULT_MUTEX_NAME = 'mutex';
const CHECK_MUTEX_EVERY_N_MINUTES = 30 * 1000;
class PulsarMutex {
    constructor(_client, _mutexTopic = `public/default/mutex`, _waitAfterFailedSubscription = CHECK_MUTEX_EVERY_N_MINUTES) {
        this._client = _client;
        this._mutexTopic = _mutexTopic;
        this._waitAfterFailedSubscription = _waitAfterFailedSubscription;
        this._mutex = null;
    }
    lock() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                try {
                    this._mutex = yield this._client.subscribe({
                        topic: this._mutexTopic,
                        subscription: DEFAULT_MUTEX_NAME,
                        subscriptionType: 'Exclusive',
                    });
                    return;
                }
                catch (_a) {
                    yield (0, promises_1.setTimeout)(this._waitAfterFailedSubscription);
                }
            }
        });
    }
    unlock() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._mutex && this._mutex.isConnected()) {
                yield this._mutex.unsubscribe();
            }
        });
    }
}
exports.PulsarMutex = PulsarMutex;
