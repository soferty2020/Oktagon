"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_PREFIX = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = void 0;
exports.isCalendarPeriod = isCalendarPeriod;
exports.DEFAULT_PAGE_SIZE = 25;
exports.MAX_PAGE_SIZE = 100;
function isCalendarPeriod(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value;
    return (Number.isInteger(candidate.year) &&
        Number.isInteger(candidate.month) &&
        candidate.month >= 1 &&
        candidate.month <= 12);
}
exports.API_PREFIX = 'api/v1';
//# sourceMappingURL=transport.js.map