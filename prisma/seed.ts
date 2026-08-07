import { prisma, pool } from "../src/plugins/prisma.js";

const spots = [
    { code: "P-01", type: "STANDARD" },
    { code: "P-02", type: "STANDARD" },
    { code: "P-03", type: "STANDARD" },
    { code: "E-01", type: "ELECTRIC" },
    { code: "E-02", type: "ELECTRIC" },
] as const;

async function main() {
    for (const spot of spots) {
        await prisma.parkingSpot.upsert({
            where: { code: spot.code },
            update: {},
            create: { code: spot.code, type: spot.type }
        });
    }
    console.log(`Seed done: ${spots.length} parking spots created`);

    if ((await prisma.reservation.count()) === 0) {
    const p01 = await prisma.parkingSpot.findUniqueOrThrow({ where: { code: "P-01" } });
    await prisma.reservation.createMany({
        data: [
            { parkingSpotId: p01.id, startTime: new Date("2999-01-01T08:00:00Z"), endTime: new Date("2999-01-01T10:00:00Z") },
            { parkingSpotId: p01.id, startTime: new Date("2999-01-01T10:00:00Z"), endTime: new Date("2999-01-01T12:00:00Z") },
        ],
    });
}
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    })