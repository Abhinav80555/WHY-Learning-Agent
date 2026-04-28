import "dotenv/config";
import { bot } from "./src/bot.js";
import { scheduleDaily } from "./src/scheduler.js";

// Validate required env vars
const required = ["TELEGRAM_BOT_TOKEN", "GEMINI_API_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required env vars: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in your keys.");
  process.exit(1);
}

// Start scheduler
scheduleDaily(bot);

// Start bot (long polling)
bot.start({
  onStart: (info) => {
    console.log(`✦ WHY Learning Agent is live as @${info.username}`);
    console.log("Waiting for users...");
  },
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());