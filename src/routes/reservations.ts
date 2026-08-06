import { type FastifyPluginAsync } from "fastify";
import { Type } from "typebox"
import { prisma } from "../plugins/prisma.js";
import { validateReservationInput } from "../services/reservation.service.js";

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
            const body = request.body as {
                parkingSpotId: number;
                startTime: string;
                endTime: string;
            }

            try {
                validateReservationInput(body);
            } catch (err: any) {
                return reply.status(400).send({
                    error: "Bad Request",
                    message: err.message,
                });
            }

            const newReservation = await prisma.reservation.create({
                data: {
                    parkingSpotId: body.parkingSpotId,
                    startTime: new Date(body.startTime),
                    endTime: new Date(body.endTime),
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
            const reservation = await prisma.reservation.findUnique({ where: { id } });

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