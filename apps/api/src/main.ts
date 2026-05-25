import { createApp } from "./server.js";
import { createLogger } from "./lib/logger.js";

const log = createLogger("main");
const port = Number(process.env.PORT ?? 4000);

const app = createApp();
app.listen(port, () => log.info({ port }, "@voiceplatform/api listening"));
