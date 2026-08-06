import { type TypeBoxTypeProvider } from "@fastify/type-provider-typebox"
import Fastify, { type FastifyError } from "fastify"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { parkingSpotRoutes } from "./routes/parking-spots.js"
import { reservationRoutes } from "./routes/reservations.js"

const app = Fastify({logger: true}).withTypeProvider<TypeBoxTypeProvider>();

await app.register(swagger, {
    openapi: { info: { title: "Parking API", version: "1.0.0" } },
});
await app.register(swaggerUi, { routePrefix: "/docs" });


app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.validation) {
        return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: `Validation error: ${err.message}`
        })
    }

    const errCode = (err as any).code;
    const isOverlapError = errCode === "P2039" || err.message?.includes("23P01") || err.message?.includes('no_overlapping_active_reservations');
    
    if (isOverlapError) {
        return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "The parking slot is already reserved for that time range"
        });
    }

    req.log.error(err);
    return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Server error occured",
    });
});

await app.register(parkingSpotRoutes);
await app.register(reservationRoutes);

const shutdown = async () => { 
    await app.close();
    process.exit(0)
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: "0.0.0.0", port: 3000 });