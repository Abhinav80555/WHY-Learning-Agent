import cron from "node-cron";
import { db } from "./firebase.js";
import { sendDailyRecommendation } from "./bot.js";

/**
 * Schedules the daily 9 AM UTC push to all onboarded users.
 * Uses node-cron (free, runs in-process).
 * 100ms throttle between messages to avoid Telegram rate limits.
 */
export function scheduleDaily(bot) {
  // Runs every day at 9:00 AM UTC
  cron.schedule("0 9 * * *", async () => {
    console.log(`[${new Date().toISOString()}] Running daily recommendation job...`);

    try {
      const snapshot = await db.collection("users").get();
      const users = snapshot.docs.filter((doc) => doc.data().onboarded);

      console.log(`Sending to ${users.length} users...`);

      for (const doc of users) {
        const userId = doc.id;
        const user = doc.data();

        // Telegram chat IDs match user IDs for private chats
        await sendDailyRecommendation(userId, userId, user, bot);

        // 100ms throttle — Telegram allows ~30 messages/sec to different users
        await new Promise((r) => setTimeout(r, 100));
      }

      console.log("Daily job complete.");
    } catch (err) {
      console.error("Daily job error:", err);
    }
  });

  console.log("📅 Daily scheduler running — fires at 9:00 AM UTC");
}