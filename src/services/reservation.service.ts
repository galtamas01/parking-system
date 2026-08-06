export interface ReservationInput {
    parkingSpotId: number;
    startTime: string;
    endTime: string;
}

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