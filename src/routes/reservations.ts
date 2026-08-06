import { type FastifyPluginAsync } from "fastify";
import { Type } from "typebox"
import { prisma } from "../plugins/prisma.js";

export const reservationRoutes: FastifyPluginAsync = async (app) => {
    app.post(
        "/reservations",
        {
            schema: {
                tags: ["Reservations"],
                summary: "New parking spot reservation",
                body: Type.Object({
                    parkingSpotId: Type.Integer({minimum: 1}),
                    startTime: Type.String({format: "date-time"}),
                    endTime: Type.String({format: "date-time"}),
                }),
            },
        },
        async (request, reply) => {
            const { parkingSpotId, startTime, endTime } = request.body as any;
            const start = new Date(startTime);
            const end = new Date(endTime);
            const now = new Date();

            if (start < now) {
                return reply.status(400).send({
                    error: "Bad Request",
                    message: "You can't make reservation to a past date"
                });
            }

            if (start >= end) {
                return reply.status(400).send({
                    error: "Bad request",
                    message: "Start time must be earlier than end time"
                });
            }

            const newReservation = await prisma.reservation.create({
                data: {
                    parkingSpotId,
                    startTime: start,
                    endTime: end,
                },
            });

            return reply.status(201).send(newReservation);
        }
    )

    app.post(
        "/reservations/:id/cancel",
        {
            schema: {
                tags: ["Reservations"],
                summary: "Cancel existing reservation",
                params: Type.Object({
                    id: Type.Integer({minimum: 1}),
                }),
            }
        },
        async (request, reply) => {
            const { id } = request.params as { id: number };
            const reservation = prisma.reservation.findUnique({ where: { id } });

            if (!reservation) {
                return reply.status(404).send({
                    error: "Not found",
                    message: "No request found with this ID"
                });
            }

            const cancelled = await prisma.reservation.update({
                where: { id },
                data: { status: "CANCELLED" }
            });

            return reply.send({
                message: "Reservation was cancelled successfully",
                cancelled
            });
        }
    )
}