import { describe, it, expect } from "vitest";
import { validateReservationInput } from "../src/services/reservation.service.js";

describe("validateReservationInput", () => {
    const now = new Date("2026-01-01T12:00:00Z");

    it("Passes with valid future timestamp", () => {
        expect(() => validateReservationInput(
            { parkingSpotId: 1, startTime: "2026-01-01T13:00:00Z", endTime: "2026-01-01T14:00:00Z" },
            now
        )).not.toThrow();
    });

    it("Fails with past start time", () => {
        expect(() => validateReservationInput(
            { parkingSpotId: 1, startTime: "2025-12-31T12:00:00Z", endTime: "2026-01-01T14:00:00Z" },
            now
        )).toThrow();
    });
    
    it("Fails if start is later than end", () => {
        expect(() => validateReservationInput(
            { parkingSpotId: 1, startTime: "2026-01-01T14:00:00Z", endTime: "2026-01-01T13:00:00Z" },
            now
        )).toThrow();
    });
});