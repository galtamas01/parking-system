import { prisma } from "../plugins/prisma.js";

export interface ReservationInput {
    parkingSpotId: number;
    startTime: string;
    endTime: string;
}

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

export function validateReservationInput(input: ReservationInput, now: Date = new Date()): void {
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid date format");
    }

    if (start < now) {
        throw new Error("Can't make reservation to past date");
    }

    if (start >= end) {
        throw new Error("Start time must be earlier than end time");
    }
}

export async function createReservation(input: ReservationInput) {
    try {
        validateReservationInput(input);
    } catch (err: any) {
        throw new ValidationError(err.message);
    }

    const spot = await prisma.parkingSpot.findUnique({
        where: { id: input.parkingSpotId }
    });

    if (!spot) {
        throw new NotFoundError("Parking spot does not exist");
    }

    if (spot.type === "ELECTRIC") {
        const start = new Date(input.startTime).getTime();
        const end = new Date(input.endTime).getTime();

        const durationHours = (end - start) / (1000 * 60 * 60);
        if (durationHours > 3) {
            throw new ValidationError("Electric parking spot is for charging and can be reserved up to 3 hours");
        }
    }

    const newReservation = await prisma.reservation.create({
        data: {
            parkingSpotId: input.parkingSpotId,
            startTime: new Date(input.startTime),
            endTime: new Date(input.endTime),
        },
    });

    return newReservation;
}