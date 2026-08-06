import { buildApp } from "./app.js";

const app = buildApp();

const shutdown = async () => { 
    await app.close();
    process.exit(0)
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: "0.0.0.0", port: 3000 });