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
exports.doPublishing = void 0;
const mongodb_1 = require("mongodb");
const promises_1 = require("node:timers/promises");
const doPublishing = (outbox) => __awaiter(void 0, void 0, void 0, function* () {
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
        catch (_a) {
            yield (0, promises_1.setTimeout)(1000);
            continue;
        }
        console.info(`Event published for medicine ${medicineId} nad patient ${patientId}.`);
        yield (0, promises_1.setTimeout)(1000);
    }
});
exports.doPublishing = doPublishing;
