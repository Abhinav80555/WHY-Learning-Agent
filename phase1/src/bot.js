import { Bot, InlineKeyboard, session } from "grammy";
import { db } from "./firebase.js";
import { generateRecommendation } from "./ai.js";
import { scheduleDaily } from "./scheduler.js";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// ─── Session ─────────────────────────────────────────────────────────────────
bot.use(session({
  initial: () => ({
    step: null,
    draft: { name: null, email: null, role: null, goal: null, time: null },
  }),
}));

// ─── Maps ─────────────────────────────────────────────────────────────────────
const roleMap = {
  role_junior:     { label: "Junior Designer",   emoji: "🌱" },
  role_mid:        { label: "Mid-Level Designer", emoji: "💼" },
  role_senior:     { label: "Senior Designer",    emoji: "🏆" },
  role_freelancer: { label: "Freelancer",         emoji: "🚀" },
};

const goalMap = {
  goal_ui:        { label: "Get better at UI",   emoji: "🎨" },
  goal_job:       { label: "Land a design job",  emoji: "💼" },
  goal_ux:        { label: "Move into UX",       emoji: "🔄" },
  goal_portfolio: { label: "Build my portfolio", emoji: "📁" },
  goal_ai:        { label: "Master AI tools",    emoji: "🤖" },
};

const timeMap = {
  time_5:  { label: "5 min / day",  emoji: "⚡", val: 5  },
  time_10: { label: "10 min / day", emoji: "🎯", val: 10 },
  time_20: { label: "20 min / day", emoji: "🔥", val: 20 },
};

const WELCOME_STICKER = "CAACAgUAAxkBAAM1ajrevwe-8QdLcSh-evZL_gTDx5gAAuIdAAJSxdhVPR2-fSRy-Fg8BA";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function progressBar(current, total = 5) {
  const filled = "●".repeat(current);
  const empty  = "○".repeat(total - current);
  return `${filled}${empty}`;
}

function buildSummary(draft) {
  const name  = draft.name  ? `👤  ${draft.name}`                                             : `👤  —`;
  const email = draft.email ? `✉️   ${draft.email}`                                            : `✉️   —`;
  const role  = draft.role  ? `🎨  ${roleMap[draft.role].emoji} ${roleMap[draft.role].label}`  : `🎨  —`;
  const goal  = draft.goal  ? `🎯  ${goalMap[draft.goal].emoji} ${goalMap[draft.goal].label}`  : `🎯  —`;
  const time  = draft.time  ? `⏱  ${timeMap[draft.time].emoji} ${timeMap[draft.time].label}`  : `⏱  —`;

  return (
    `*Your profile*\n\n` +
    `${name}\n` +
    `${email}\n` +
    `${role}\n` +
    `${goal}\n` +
    `${time}`
  );
}

async function silentDelete(ctx, msgId) {
  try { await ctx.api.deleteMessage(ctx.chat.id, msgId); } catch (_) {}
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  ctx.session.step = null;
  ctx.session.draft = { name: null, email: null, role: null, goal: null, time: null };

  try {
    await ctx.replyWithSticker(WELCOME_STICKER);
  } catch (_) {}

  await ctx.reply(
    `🧠  *WHY Learning Agent*\n\n` +
    `One lesson\\. Every day\\. Built for you\\.\n\n` +
    `No rabbit holes\\. No overwhelm\\.\n` +
    `Just show up — I handle the rest\\.`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard()
        .text("Get started →", "begin_onboarding"),
    }
  );
});

// ─── Begin Onboarding ─────────────────────────────────────────────────────────
bot.callbackQuery("begin_onboarding", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "name";

  await ctx.reply(
    `${progressBar(1)}  *1 of 5*\n\n` +
    `👤  *What's your name?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("Skip", "skip_name"),
    }
  );
});

bot.on("message:sticker", ctx => console.log(ctx.message.sticker.file_id));


// ─── Text router ──────────────────────────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  const step = ctx.session.step;
  const text = ctx.message.text.trim();
  await silentDelete(ctx, ctx.message.message_id);

  if (step === "name") {
    ctx.session.draft.name = text;
    await ctx.reply(
      `${progressBar(1)}  *1 of 5*\n\n👤  *Name*  →  ${text}  ✓`,
      { parse_mode: "Markdown" }
    );
    await askEmail(ctx);

  } else if (step === "email") {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
    if (!isValid) {
      return ctx.reply(
        `⚠️  Not a valid email — try again or tap *Skip*`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("Skip", "skip_email") }
      );
    }
    ctx.session.draft.email = text;
    await ctx.reply(
      `${progressBar(2)}  *2 of 5*\n\n✉️  *Email*  →  ${text}  ✓`,
      { parse_mode: "Markdown" }
    );
    await askRole(ctx);

  } else if (step === "edit_name_input") {
    ctx.session.draft.name = text;
    ctx.session.step = "review";
    await ctx.reply(`✓  Name updated to *${text}*`, { parse_mode: "Markdown" });
    await showConfirmation(ctx);

  } else if (step === "edit_email_input") {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
    if (!isValid) return ctx.reply(`⚠️  Invalid email — try again:`);
    ctx.session.draft.email = text;
    ctx.session.step = "review";
    await ctx.reply(`✓  Email updated`, { parse_mode: "Markdown" });
    await showConfirmation(ctx);
  }
});

// ─── Step: Email ──────────────────────────────────────────────────────────────
async function askEmail(ctx) {
  ctx.session.step = "email";
  await ctx.reply(
    `${progressBar(2)}  *2 of 5*\n\n` +
    `✉️  *Your email?*\n` +
    `_For your weekly progress digest_`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("Skip", "skip_email"),
    }
  );
}

bot.callbackQuery("skip_name", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `${progressBar(1)}  *1 of 5*\n\n👤  *Name*  →  _skipped_`,
    { parse_mode: "Markdown" }
  );
  await askEmail(ctx);
});

bot.callbackQuery("skip_email", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `${progressBar(2)}  *2 of 5*\n\n✉️  *Email*  →  _skipped_`,
    { parse_mode: "Markdown" }
  );
  await askRole(ctx);
});

// ─── Step: Role ───────────────────────────────────────────────────────────────
async function askRole(ctx) {
  ctx.session.step = "role";
  await ctx.reply(
    `${progressBar(3)}  *3 of 5*\n\n` +
    `🎨  *Your current role?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🌱  Junior Designer",   "role_junior").row()
        .text("💼  Mid-Level Designer", "role_mid").row()
        .text("🏆  Senior Designer",    "role_senior").row()
        .text("🚀  Freelancer",         "role_freelancer"),
    }
  );
}

// ─── Role handler — chains to goal during onboarding, returns to review when editing ───
bot.callbackQuery(Object.keys(roleMap), async (ctx) => {
  await ctx.answerCallbackQuery();
  const key = ctx.callbackQuery.data;
  const wasEditing = ctx.session.step === "role" && ctx.session.draft.goal !== null;
  ctx.session.draft.role = key;

  await ctx.editMessageText(
    `${wasEditing ? "🎨" : `${progressBar(3)}  *3 of 5*`}\n\n🎨  *Role*  →  ${roleMap[key].emoji} ${roleMap[key].label}  ✓`,
    { parse_mode: "Markdown" }
  );

  if (wasEditing) {
    ctx.session.step = "review";
    await showConfirmation(ctx);
  } else {
    await askGoal(ctx);
  }
});

// ─── Step: Goal ───────────────────────────────────────────────────────────────
async function askGoal(ctx) {
  ctx.session.step = "goal";
  await ctx.reply(
    `${progressBar(4)}  *4 of 5*\n\n` +
    `🎯  *Your main goal right now?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🎨  Get better at UI",   "goal_ui").row()
        .text("💼  Land a design job",  "goal_job").row()
        .text("🔄  Move into UX",       "goal_ux").row()
        .text("📁  Build my portfolio", "goal_portfolio").row()
        .text("🤖  Master AI tools",    "goal_ai"),
    }
  );
}

// ─── Goal handler — chains to time during onboarding, returns to review when editing ───
bot.callbackQuery(Object.keys(goalMap), async (ctx) => {
  await ctx.answerCallbackQuery();
  const key = ctx.callbackQuery.data;
  const wasEditing = ctx.session.step === "goal" && ctx.session.draft.time !== null;
  ctx.session.draft.goal = key;

  await ctx.editMessageText(
    `${wasEditing ? "🎯" : `${progressBar(4)}  *4 of 5*`}\n\n🎯  *Goal*  →  ${goalMap[key].emoji} ${goalMap[key].label}  ✓`,
    { parse_mode: "Markdown" }
  );

  if (wasEditing) {
    ctx.session.step = "review";
    await showConfirmation(ctx);
  } else {
    await askTime(ctx);
  }
});

// ─── Step: Time ───────────────────────────────────────────────────────────────
async function askTime(ctx) {
  ctx.session.step = "time";
  await ctx.reply(
    `${progressBar(5)}  *5 of 5*\n\n` +
    `⏱  *Daily time commitment?*\n` +
    `_Consistency beats intensity_`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("⚡ 5 min",  "time_5")
        .text("🎯 10 min", "time_10")
        .text("🔥 20 min", "time_20"),
    }
  );
}

// ─── Time handler — always goes to review (it's the last step) ───────────────
bot.callbackQuery(Object.keys(timeMap), async (ctx) => {
  await ctx.answerCallbackQuery();
  const key = ctx.callbackQuery.data;
  ctx.session.draft.time = key;
  ctx.session.step = "review";

  await ctx.editMessageText(
    `${progressBar(5)}  *5 of 5*\n\n⏱  *Time*  →  ${timeMap[key].emoji} ${timeMap[key].label}  ✓`,
    { parse_mode: "Markdown" }
  );
  await showConfirmation(ctx);
});

// ─── Confirmation screen ──────────────────────────────────────────────────────
async function showConfirmation(ctx) {
  const draft = ctx.session.draft;
  await ctx.reply(
    buildSummary(draft) + `\n\n_Does this look right?_`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✏️  Edit",           "edit_menu").row()
        .text("✅  Yes, let's go!", "confirm_profile"),
    }
  );
}

// ─── Confirm profile ──────────────────────────────────────────────────────────
bot.callbackQuery("confirm_profile", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId  = ctx.from.id.toString();
  const draft   = ctx.session.draft;

  const userData = {
    name:            draft.name  || null,
    email:           draft.email || null,
    role:            roleMap[draft.role]?.label  || null,
    goal:            goalMap[draft.goal]?.label  || null,
    dailyTime:       timeMap[draft.time]?.val    || 10,
    streak:          0,
    xp:              0,
    completedTopics: [],
    onboarded:       true,
    joinedAt:        new Date().toISOString(),
  };

  await db.collection("users").doc(userId).set(userData, { merge: true });

  await ctx.editMessageText(
    buildSummary(draft) + `\n\n_Saved ✓_`,
    { parse_mode: "Markdown" }
  );

  const firstName = draft.name ? ` ${draft.name.split(" ")[0]}` : "";
  await ctx.reply(
    `🎉  *All set${firstName}!*\n\nGenerating your first lesson...\n_Takes a few seconds_`,
    { parse_mode: "Markdown" }
  );

  await sendDailyRecommendation(ctx.chat.id, userId, userData, bot);
});

// ─── Edit menu ────────────────────────────────────────────────────────────────
bot.callbackQuery("edit_menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `✏️  *What would you like to change?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("👤 Name",  "edit_name").text("✉️ Email", "edit_email").row()
        .text("🎨 Role",  "edit_role").row()
        .text("🎯 Goal",  "edit_goal").row()
        .text("⏱ Time",  "edit_time").row()
        .text("← Back",  "back_to_summary"),
    }
  );
});

bot.callbackQuery("back_to_summary", async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = ctx.session.draft;
  await ctx.editMessageText(
    buildSummary(draft) + `\n\n_Does this look right?_`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✏️  Edit",           "edit_menu").row()
        .text("✅  Yes, let's go!", "confirm_profile"),
    }
  );
});

bot.callbackQuery("edit_name", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "edit_name_input";
  await ctx.editMessageText(`👤  Type your new name:`);
});

bot.callbackQuery("edit_email", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "edit_email_input";
  await ctx.editMessageText(`✉️  Type your new email:`);
});

// ─── Edit role/goal/time — set step so the shared handler knows it's an edit ─
bot.callbackQuery("edit_role", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "role";
  await ctx.editMessageText(
    `🎨  *Pick your role:*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🌱  Junior Designer",   "role_junior").row()
        .text("💼  Mid-Level Designer", "role_mid").row()
        .text("🏆  Senior Designer",    "role_senior").row()
        .text("🚀  Freelancer",         "role_freelancer"),
    }
  );
});

bot.callbackQuery("edit_goal", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "goal";
  await ctx.editMessageText(
    `🎯  *Pick your goal:*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🎨  Get better at UI",   "goal_ui").row()
        .text("💼  Land a design job",  "goal_job").row()
        .text("🔄  Move into UX",       "goal_ux").row()
        .text("📁  Build my portfolio", "goal_portfolio").row()
        .text("🤖  Master AI tools",    "goal_ai"),
    }
  );
});

bot.callbackQuery("edit_time", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "time";
  await ctx.editMessageText(
    `⏱  *Pick your daily time:*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("⚡ 5 min",  "time_5")
        .text("🎯 10 min", "time_10")
        .text("🔥 20 min", "time_20"),
    }
  );
});

// ─── /profile ─────────────────────────────────────────────────────────────────
bot.command("profile", async (ctx) => {
  const userId = ctx.from.id.toString();
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists || !doc.data().onboarded) {
    return ctx.reply("Set up your profile first with /start");
  }
  const u = doc.data();

  const fakeDraft = {
    name:  u.name,
    email: u.email,
    role:  Object.keys(roleMap).find(k => roleMap[k].label === u.role) || null,
    goal:  Object.keys(goalMap).find(k => goalMap[k].label === u.goal) || null,
    time:  Object.keys(timeMap).find(k => timeMap[k].val   === u.dailyTime) || null,
  };

  await ctx.reply(
    buildSummary(fakeDraft) +
    `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
    `🔥  Streak  →  ${u.streak || 0} days\n` +
    `⚡  XP       →  ${u.xp || 0} pts`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("✏️ Edit Profile", "edit_menu"),
    }
  );
});

// ─── /today ───────────────────────────────────────────────────────────────────
bot.command("today", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists || !userDoc.data().onboarded) {
    return ctx.reply("Set up your profile first with /start");
  }
  await ctx.reply("⏳  Generating your WHY lesson...");
  await sendDailyRecommendation(ctx.chat.id, userId, userDoc.data(), bot);
});

// ─── /streak ──────────────────────────────────────────────────────────────────
bot.command("streak", async (ctx) => {
  const userId = ctx.from.id.toString();
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) return ctx.reply("Start with /start first!");
  const { streak = 0, xp = 0 } = doc.data();
  const bar = "█".repeat(Math.min(streak, 7)) + "░".repeat(Math.max(0, 7 - streak));

  await ctx.reply(
    `🔥  *Your Streak*\n\n` +
    `${bar}  ${streak} / 7\n\n` +
    `${streak} day${streak !== 1 ? "s" : ""} in a row\n` +
    `${xp} XP earned\n\n` +
    `${streak >= 7 ? "🏆  7-day badge unlocked!" : `${7 - streak} more day${7 - streak !== 1 ? "s" : ""} to unlock your badge`}`,
    { parse_mode: "Markdown" }
  );
});

// ─── /skip ────────────────────────────────────────────────────────────────────
bot.command("skip", async (ctx) => {
  await ctx.reply(
    `⚠️  *Skip today?*\n\nThis will reset your streak to zero.`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("Yes, skip", "confirm_skip")
        .text("No, I'll learn →", "cancel_skip"),
    }
  );
});

bot.callbackQuery("confirm_skip", async (ctx) => {
  const userId = ctx.from.id.toString();
  await db.collection("users").doc(userId).set({ streak: 0 }, { merge: true });
  await ctx.editMessageText("Streak reset. Fresh start tomorrow 💪");
});

bot.callbackQuery("cancel_skip", async (ctx) => {
  await ctx.editMessageText("Good call. Use /today to get your lesson 🔥");
});

// ─── Mark Done ────────────────────────────────────────────────────────────────
bot.callbackQuery("mark_done", async (ctx) => {
  const userId = ctx.from.id.toString();
  const doc = await db.collection("users").doc(userId).get();
  const data = doc.data() || {};
  const newStreak = (data.streak || 0) + 1;
  const newXP     = (data.xp || 0) + 10;

  await db.collection("users").doc(userId).set({ streak: newStreak, xp: newXP }, { merge: true });

  const milestones = { 3: "\n🎖  3-day streak!", 7: "\n🏆  7-day badge unlocked!", 14: "\n🔥  14-day legend!", 30: "\n👑  30-day champion!" };
  const milestone  = milestones[newStreak] || "";

  await ctx.editMessageText(
    `✅  *Done! +10 XP*\n\n` +
    `🔥  ${newStreak} day streak\n` +
    `⚡  ${newXP} XP total` +
    `${milestone}\n\n` +
    `*How was today's lesson?*`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🔥 Loved it",   "rate_4")
        .text("👍 Good",       "rate_3")
        .text("😐 Meh",        "rate_2")
        .text("👎 Not for me", "rate_1"),
    }
  );
});

// ─── Rating ───────────────────────────────────────────────────────────────────
bot.callbackQuery(/^rate_(\d)$/, async (ctx) => {
  const rating   = parseInt(ctx.match[1]);
  const userId   = ctx.from.id.toString();
  const doc      = await db.collection("users").doc(userId).get();
  const ratings  = doc.data()?.ratings || [];
  ratings.push(rating);
  await db.collection("users").doc(userId).set({ ratings }, { merge: true });

  const msgs = {
    4: "Awesome — more like this coming 🔥",
    3: "Noted — I'll keep it up 👍",
    2: "Got it — mixing things up tomorrow 🔄",
    1: "Understood — different direction tomorrow 🎯",
  };

  await ctx.editMessageText(`${msgs[rating]}\n\nSee you tomorrow!`);
});

// ─── Daily Recommendation Sender ──────────────────────────────────────────────
export async function sendDailyRecommendation(chatId, userId, user, botInstance) {
  const b = botInstance || bot;
  try {
    const rec       = await generateRecommendation(user);
    const firstName = user.name ? ` ${user.name.split(" ")[0]}` : "";

    const msg =
      `✦  *Today's WHY Lesson*${firstName ? `  ·  ${firstName}` : ""}\n\n` +
      `▸ *${rec.topic}*\n\n` +
      `*WHY THIS*\n${rec.whyThis}\n\n` +
      `*WHY NOW*\n${rec.whyNow}\n\n` +
      `*WHY YOU*\n${rec.whyYou}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯  *Task*  _(${user.dailyTime} min)_\n${rec.task}`;

    await b.api.sendMessage(chatId, msg, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .url("▶️  Start Learning", rec.resourceUrl).row()
        .text("✅  Mark as Done", "mark_done")
        .text("⏭  Skip Today",   "confirm_skip"),
      disable_web_page_preview: true,
    });

    await db.collection("recommendations").add({
      userId,
      topic:  rec.topic,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to send recommendation:", err);
    await b.api.sendMessage(chatId, "⚠️  Couldn't generate today's lesson. Try /today again.");
  }
}

export { bot };