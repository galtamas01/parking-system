import type { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { pool, prisma } from "../src/plugins/prisma.js";

describe("Parking Spots API Integration Tests", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
        await pool.end();
    });

    beforeEach(async() => {
        await prisma.$executeRawUnsafe('TRUNCATE TABLE "Reservation", "ParkingSpot" RESTART IDENTITY CASCADE');

        await prisma.parkingSpot.createMany({
            data: [
                { code: "P-01" },
                { code: "P-02" },
                { code: "P-03" },
            ],
        });
    });

    describe("GET /parking-spots", () => {
        it("Lists all parking spots", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/parking-spots",
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            
            expect(body).toHaveLength(3);
            expect(body[0]).toMatchObject({ id: 1, code: "P-01" });
            expect(body[1]).toMatchObject({ id: 2, code: "P-02" });
            expect(body[2]).toMatchObject({ id: 3, code: "P-03" });
        });
    })

    describe("GET /parking-spots/:id/reservations", () => {
        it("Returns active reservations of a parking spot in ascending order", async () => {
            await prisma.reservation.createMany({
                data: [
                    {
                        parkingSpotId: 1,
                        startTime: new Date("2999-01-02T10:00:00Z"),
                        endTime: new Date("2999-01-02T12:00:00Z"),
                        status: "ACTIVE"
                    },
                    {
                        parkingSpotId: 1,
                        startTime: new Date("2999-01-01T10:00:00Z"),
                        endTime: new Date("2999-01-01T12:00:00Z"),
                        status: "ACTIVE"
                    },
                    {
                        parkingSpotId: 1,
                        startTime: new Date("2999-01-03T10:00:00Z"),
                        endTime: new Date("2999-01-03T12:00:00Z"),
                        status: "CANCELLED"
                    }
                ]
            });
            const res = await app.inject({
                method: "GET",
                url: "/parking-spots/1/reservations",
            });
            expect(res.statusCode).toBe(200);

            const body = res.json();
            expect(body).toHaveLength(2);
            expect(new Date(body[0].startTime).getTime()).toBeLessThan(new Date(body[1].startTime).getTime());
            expect(body[0].startTime).toBe("2999-01-01T10:00:00.000Z");
        })

        it("Returns empty list if there is no reservation for the given spot", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/parking-spots/2/reservations",
            });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
        });

        it("Rejects request if ID is invalid", async () => {
            const res1 = await app.inject({
                method: "GET",
                url: "/parking-spots/0/reservations",
            });
            expect(res1.statusCode).toBe(400);

            const res2 = await app.inject({
                method: "GET",
                url: "/parking-spots/abc/reservations",
            });
            expect(res2.statusCode).toBe(400);
        })
    })
})