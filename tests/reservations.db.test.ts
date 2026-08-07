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
})