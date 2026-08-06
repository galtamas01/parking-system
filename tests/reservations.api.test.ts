import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("POST /reservations validation", () => {
    let app: FastifyInstance;

    beforeAll(async() => {
        app = buildApp();
        await app.ready();
    });

    afterAll(async() => { await app.close() });

    it("Gives error 400 for swapped time interval", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/reservations",
            payload: {
                parkingSpotId: 1,
                startTime: "2999-01-01T14:00:00Z",
                endTime: "2999-01-01T13:00:00Z",
            },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("earlier than end");
    })

    it("Gives error 400 for incomplete payload", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/reservations",
            payload: {
                startTime: "2999-01-01T13:00:00Z",
                endTime: "2999-01-01T14:00:00Z",
            }
        });
        expect(res.statusCode).toBe(400);
    });
});