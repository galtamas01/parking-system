import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { pool, prisma } from "../src/plugins/prisma.js";

describe("POST /reservations database - overlap", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        await pool.end();
    });

    beforeEach(async () => {
        await prisma.$executeRawUnsafe(
            'TRUNCATE TABLE "Reservation", "ParkingSpot" RESTART IDENTITY CASCADE'
        );
        await prisma.parkingSpot.create({ data: { code: "P-01"} });
    });

    const range = (start: string, end: string) => (
        { parkingSpotId: 1, startTime: start, endTime: end, }
    );

    it("Creates a new reservation (201)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/reservations",
            payload: range("2999-01-01T10:00:00Z", "2999-01-01T12:00:00Z"),
        });
        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({ parkingSpotId: 1, status: "ACTIVE" });
    });

    it("Rejects overlapping acitve reservation (409)", async () => {
        await app.inject({
            method: "POST",
            url: "/reservations",
            payload: range("2999-01-01T10:00:00Z", "2999-01-01T12:00:00Z"),
        });
        const res = await app.inject({
            method: "POST",
            url: "/reservations",
            payload: range("2999-01-01T11:00:00Z", "2999-01-01T13:00:00Z"),
        });
        expect(res.statusCode).toBe(409);
    });

    it("Parking spot is available after a cancel", async () => {
        const first = await app.inject({
            method: "POST",
            url: "/reservations",
            payload: range("2999-01-01T10:00:00Z", "2999-01-01T12:00:00Z"),
        });
        const id = first.json().id;

        await app.inject({
            method: "POST",
            url: `/reservations/${id}/cancel`
        })

        const res = await app.inject({
            method: "POST",
            url: "/reservations",
            payload: range("2999-01-01T11:00:00Z", "2999-01-01T13:00:00Z"),
        })
        expect(res.statusCode).toBe(201);
    });

    it("Continous reservations are not overlapping", async() => {
        await app.inject({
            method: "POST",
            url: "/reservations",
            payload: range("2999-01-01T10:00:00Z", "2999-01-01T12:00:00Z"),
        });
        const res = await app.inject({
            method: "POST",
            url: "/reservations",
            payload: range("2999-01-01T12:00:00Z", "2999-01-01T13:00:00Z"),
        });
        expect(res.statusCode).toBe(201);
    })

    describe("POST /reservations/:id/cancel", () => {
        it("Cancels an existing reservation and changes the status to CANCELLED", async () => {
            const created = await app.inject({
                method: "POST", 
                url: "/reservations",
                payload: range("2999-01-01T10:00:00Z", "2999-01-01T12:00:00Z"),
            });
            const id = created.json().id;

            const res = await app.inject({ 
                method: "POST", 
                url: `/reservations/${id}/cancel` 
            });
            expect(res.statusCode).toBe(200);
            expect(res.json().cancelled).toMatchObject({ id, status: "CANCELLED" });
        });

        it("Returns error 404 for cancelling non-existing reservation", async () => {
            const res = await app.inject({ 
                method: "POST", 
                url: "/reservations/9999/cancel" });
            expect(res.statusCode).toBe(404);
        });

        it("Rejects the request if ID is not a number", async() => {
            const res = await app.inject({
                method: "POST",
                url: "/reservations/abc/cancel"
            });
            expect(res.statusCode).toBe(400);
        });

        it("Rejects the request if ID in not a valid number", async() => {
            const resZero = await app.inject({
                method: "POST",
                url: "/reservations/0/cancel"
            });
            expect(resZero.statusCode).toBe(400);

            const resNeg = await app.inject({
                method: "POST",
                url: "/reservations/-3/cancel"
            });
            expect(resNeg.statusCode).toBe(400);
        })
    });

    describe("POST /reservations - Business Logic & Validation", () => {
        let electricSpotId: number;
        let standardSpotId: number;

        beforeEach(async () => {
            const eSpot = await prisma.parkingSpot.create({ data: { code: "E-TEST", type: "ELECTRIC" } });
            electricSpotId = eSpot.id;

            const sSpot = await prisma.parkingSpot.create({ data: { code: "S-TEST", type: "STANDARD" } });
            standardSpotId = sSpot.id;
        });

        it("Returns error 404 if the parking spot does not exist", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/reservations",
                payload: {
                    parkingSpotId: 99999, // Non-existent ID
                    startTime: "2999-01-01T10:00:00Z",
                    endTime: "2999-01-01T12:00:00Z"
                },
            });
            expect(res.statusCode).toBe(404);
        });

        it("Rejects request (400) if an ELECTRIC spot is booked for more than 3 hours", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/reservations",
                payload: {
                    parkingSpotId: electricSpotId,
                    startTime: "2999-01-01T10:00:00Z",
                    endTime: "2999-01-01T14:00:00Z"
                },
            });
            expect(res.statusCode).toBe(400);
        });

        it("Creates a reservation (201) if an ELECTRIC spot is booked for exactly 3 hours", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/reservations",
                payload: {
                    parkingSpotId: electricSpotId,
                    startTime: "2999-01-01T10:00:00Z",
                    endTime: "2999-01-01T13:00:00Z"
                },
            });
            expect(res.statusCode).toBe(201);
        });

        it("Creates a reservation (201) for a STANDARD spot even if it is more than 3 hours", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/reservations",
                payload: {
                    parkingSpotId: standardSpotId,
                    startTime: "2999-01-01T10:00:00Z",
                    endTime: "2999-01-01T20:00:00Z"
                },
            });
            expect(res.statusCode).toBe(201);
        });
    });

})

