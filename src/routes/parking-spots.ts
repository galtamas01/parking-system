import { type FastifyPluginAsync } from "fastify";
import { Type } from "typebox"
import { prisma } from "../plugins/prisma.js";

export const parkingSpotRoutes: FastifyPluginAsync = async (app) => {
    app.get(
        "/parking-spots",
        {
            schema: {
                tags: ["Parking Spots"],
                summary: "List all parking spots",
            },
        },
        async (request, reply) => {
            const spots = await prisma.parkingSpot.findMany();
            return reply.send(spots);
        }
    );

    app.get(
        "/parking-spots/:id/reservations",
        {
            schema: {
                tags: ["Parking Spots"],
                summary: "Active reservations of a selected parking spot",
                params: Type.Object({
                    id: Type.Integer({ minimum: 1 }),
                }),
            },
        },
        async (request, reply) => {
            const { id } = request.params as { id: number };

            const reservations = await prisma.reservation.findMany({
                where: {
                    parkingSpotId: id,
                    status: "ACTIVE"
                },
                orderBy: { startTime: "asc" }
            });

            return reply.send(reservations);
        }
    );
};