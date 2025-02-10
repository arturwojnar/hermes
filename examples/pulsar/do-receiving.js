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
exports.doReceiving = void 0;
const promises_1 = require("node:timers/promises");
const doReceiving = (subscription) => __awaiter(void 0, void 0, void 0, function* () {
    while (true) {
        try {
            const message = yield subscription.receive();
            const event = JSON.parse(message.getData().toString('utf-8'));
            console.info(`Consumed event for medicine ${event.data.medicineId} and patient ${event.data.patientId}`);
        }
        catch (_a) {
            yield (0, promises_1.setTimeout)(1000);
        }
    }
});
exports.doReceiving = doReceiving;
