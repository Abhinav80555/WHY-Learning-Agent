import { Bot, InlineKeyboard, session } from "grammy";
import { db } from "./firebase.js";
import { generateRecommendation } from "./ai.js";
import { scheduleDaily } from "./scheduler.js";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// ─── Session ────────────────────────────────────────────────────────────────
bot.use(session({ initial: () => ({ step: null }) }));

// ─── /start ─────────────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  ctx.session.step = "role";
  const kb = new InlineKeyboard()
    .text("🎨 Junior Designer", "role_junior").row()
    .text("💼 Mid-Level Designer", "role_mid").row()
    .text("🏆 Senior Designer", "role_senior").row()
    .text("🚀 Freelancer", "role_freelancer");

  await ctx.reply(
    `✦ *WHY LEARNING AGENT*\n\nYour daily dose of growth. Powered by AI. Driven by WHY.\n\n` +
    `One recommendation. Every day. With a reason built for *you*.\n\n` +
    `Let's build your profile. *What's your current role?*`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
});

// ─── Onboarding: Role ───────────────────────────────────────────────────────
const roleMap = {
  role_junior: "Junior Designer",
  role_mid: "Mid-Level Designer",
  role_senior: "Senior Designer",
  role_freelancer: "Freelancer",
};

bot.callbackQuery(Object.keys(roleMap), async (ctx) => {
  const userId = ctx.from.id.toString();
  const role = roleMap[ctx.callbackQuery.data];
  await db.collection("users").doc(userId).set({ role }, { merge: true });
  ctx.session.step = "goal";

  await ctx.editMessageText(
    `✓ Role saved: *${role}*\n\n*What's your primary learning goal?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🎯 Get better at UI", "goal_ui").row()
        .text("💼 Land a design job", "goal_job").row()
        .text("🔄 Move into UX", "goal_ux").row()
        .text("📁 Build my portfolio", "goal_portfolio").row()
        .text("🤖 Master AI tools", "goal_ai"),
    }
  );
});

// ─── Onboarding: Goal ───────────────────────────────────────────────────────
const goalMap = {
  goal_ui: "Get better at UI",
  goal_job: "Land a design job",
  goal_ux: "Move into UX",
  goal_portfolio: "Build my portfolio",
  goal_ai: "Master AI tools",
};

bot.callbackQuery(Object.keys(goalMap), async (ctx) => {
  const userId = ctx.from.id.toString();
  const goal = goalMap[ctx.callbackQuery.data];
  await db.collection("users").doc(userId).set({ goal }, { merge: true });
  ctx.session.step = "time";

  await ctx.editMessageText(
    `✓ Goal saved: *${goal}*\n\n*How much time can you commit daily?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("⚡ 5 minutes", "time_5")
        .text("✦ 10 minutes", "time_10")
        .text("🔥 20 minutes", "time_20"),
    }
  );
});

// ─── Onboarding: Time ───────────────────────────────────────────────────────
const timeMap = { time_5: 5, time_10: 10, time_20: 20 };

bot.callbackQuery(Object.keys(timeMap), async (ctx) => {
    const userId = ctx.from.id.toString();
    const time = timeMap[ctx.callbackQuery.data];
  
    const userData = {
      dailyTime: time,
      streak: 0,
      xp: 0,
      completedTopics: [],
      onboarded: true,
      joinedAt: new Date().toISOString(),
    };
  
    await db.collection("users").doc(userId).set(userData, { merge: true });
  
    await ctx.editMessageText(
      `✦ *Profile complete!*\n\n⏳ Generating your first WHY lesson now...`,
      { parse_mode: "Markdown" }
    );
  
    // Fetch full user profile (includes role + goal set earlier)
    const userDoc = await db.collection("users").doc(userId).get();
    await sendDailyRecommendation(ctx.chat.id, userId, userDoc.data(), bot);
  });

// ─── /today — Re-fetch today's lesson ───────────────────────────────────────
bot.command("today", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists || !userDoc.data().onboarded) {
    return ctx.reply("Please set up your profile first with /start");
  }

  await ctx.reply("⏳ Generating your WHY lesson...");
  const user = userDoc.data();
  await sendDailyRecommendation(ctx.chat.id, userId, user, bot);
});

// ─── /streak ─────────────────────────────────────────────────────────────────
bot.command("streak", async (ctx) => {
  const userId = ctx.from.id.toString();
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) return ctx.reply("Start with /start first!");
  const { streak = 0, xp = 0 } = doc.data();

  await ctx.reply(
    `🔥 *Your Stats*\n\n` +
    `Streak: ${streak} day${streak !== 1 ? "s" : ""}\n` +
    `XP: ${xp} points\n\n` +
    `${streak >= 7 ? "🏆 7-day streak unlocked!" : `${7 - streak} days to your 7-day streak badge`}`,
    { parse_mode: "Markdown" }
  );
});

// ─── /settings ───────────────────────────────────────────────────────────────
bot.command("settings", async (ctx) => {
  await ctx.reply(
    "To reset your profile and start fresh, use /start\n\nYour streak and XP will be preserved.",
  );
});

// ─── /skip ────────────────────────────────────────────────────────────────────
bot.command("skip", async (ctx) => {
  await ctx.reply(
    "⚠️ *Skipping today will break your streak.*\n\nAre you sure?",
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("Yes, skip today", "confirm_skip")
        .text("No, I'll learn!", "cancel_skip"),
    }
  );
});

bot.callbackQuery("confirm_skip", async (ctx) => {
  const userId = ctx.from.id.toString();
  await db.collection("users").doc(userId).set({ streak: 0 }, { merge: true });
  await ctx.editMessageText("Streak reset. Come back tomorrow — fresh start! 💪");
});

bot.callbackQuery("cancel_skip", async (ctx) => {
  await ctx.editMessageText("Great choice! Use /today to get your lesson.");
});

// ─── Mark Done ────────────────────────────────────────────────────────────────
bot.callbackQuery("mark_done", async (ctx) => {
  const userId = ctx.from.id.toString();
  const doc = await db.collection("users").doc(userId).get();
  const data = doc.data() || {};
  const newStreak = (data.streak || 0) + 1;
  const newXP = (data.xp || 0) + 10;

  await db.collection("users").doc(userId).set(
    { streak: newStreak, xp: newXP },
    { merge: true }
  );

  await ctx.editMessageText(
    `🎉 *Lesson complete!*\n\n` +
    `🔥 Streak: ${newStreak} day${newStreak !== 1 ? "s" : ""}\n` +
    `⚡ XP: ${newXP} points\n\n` +
    `*How useful was today's lesson?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🔥 Very useful", "rate_4")
        .text("👍 Good", "rate_3")
        .text("😐 Just OK", "rate_2")
        .text("👎 Not for me", "rate_1"),
    }
  );
});

// ─── Rating ──────────────────────────────────────────────────────────────────
bot.callbackQuery(/^rate_(\d)$/, async (ctx) => {
  const rating = parseInt(ctx.match[1]);
  const userId = ctx.from.id.toString();
  const doc = await db.collection("users").doc(userId).get();
  const ratings = doc.data()?.ratings || [];
  ratings.push(rating);
  await db.collection("users").doc(userId).set({ ratings }, { merge: true });

  await ctx.editMessageText(
    `✓ Feedback saved — your next lesson will be better!\n\n` +
    `See you tomorrow. Keep the streak going! 🔥`,
  );
});

// ─── Start Learning (opens resource) ─────────────────────────────────────────
bot.callbackQuery("start_learning", async (ctx) => {
  await ctx.answerCallbackQuery("Opening resource... good luck! 🚀");
});

// ─── Daily Recommendation Sender (exported for scheduler) ───────────────────
export async function sendDailyRecommendation(chatId, userId, user, botInstance) {
  const b = botInstance || bot;
  try {
    const rec = await generateRecommendation(user);

    const msg =
      `✦ *Today's WHY Lesson*\n\n` +
      `📚 *Topic:* ${rec.topic}\n\n` +
      `*WHY THIS*\n${rec.whyThis}\n\n` +
      `*WHY NOW*\n${rec.whyNow}\n\n` +
      `*WHY YOU*\n${rec.whyYou}\n\n` +
      `🎯 *Today's Task* (${user.dailyTime} min)\n${rec.task}\n\n` +
      `📺 *Resource:* [Watch/Read here](${rec.resourceUrl})`;

    await b.api.sendMessage(chatId, msg, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .url("📺 Start Learning", rec.resourceUrl).row()
        .text("✅ Mark as Done", "mark_done")
        .text("⏭ Skip Today", "confirm_skip"),
      disable_web_page_preview: false,
    });

    // Log recommendation
    await db.collection("recommendations").add({
      userId,
      topic: rec.topic,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to send recommendation:", err);
    await b.api.sendMessage(chatId, "⚠️ Couldn't generate today's lesson. Try /today again.");
  }
}

export { bot };