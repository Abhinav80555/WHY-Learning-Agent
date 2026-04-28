import fetch from "node-fetch";

/**
 * Generate a personalized WHY Learning recommendation.
 * Uses Groq (free: 14,400 req/day, llama-3.3-70b)
 */
export async function generateRecommendation(user) {
  const avgRating = user.ratings?.length
    ? (user.ratings.reduce((a, b) => a + b, 0) / user.ratings.length).toFixed(1)
    : "no ratings yet";

  const completedStr = user.completedTopics?.length > 0
    ? user.completedTopics.slice(-5).join(", ")
    : "none yet";

  const prompt = `You are WHY Learning Agent — an AI that gives designers exactly ONE personalized daily learning recommendation.

USER PROFILE:
- Role: ${user.role || "Designer"}
- Goal: ${user.goal || "Get better at UI"}
- Daily time: ${user.dailyTime || 10} minutes
- Streak: ${user.streak || 0} days
- Avg rating: ${avgRating}
- Recently completed topics: ${completedStr}

TASK:
Generate a single learning recommendation tailored to this user.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "topic": "Short topic name (5-8 words max)",
  "whyThis": "1-2 sentences: why this topic matters in the design industry right now",
  "whyNow": "1-2 sentences: why this is the RIGHT MOMENT for this user to learn this",
  "whyYou": "1-2 sentences: personalized to their role (${user.role}) and goal (${user.goal}) — must reference these directly",
  "task": "One specific, doable task for ${user.dailyTime || 10} minutes — concrete and actionable",
  "searchQuery": "YouTube search query to find the best 5-15 min video on this topic"
}

Rules:
- whyYou MUST directly reference the user's role and goal
- task must be completable in ${user.dailyTime || 10} minutes
- Be specific, not generic`;

  let rec;
  let attempts = 0;

  while (attempts < 3) {
    attempts++;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) throw new Error("Empty response from Groq");

    try {
      rec = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json|```/g, "").trim();
      rec = JSON.parse(cleaned);
    }

    // Validate WHY YOU references user data
    if (
      rec.whyYou.toLowerCase().includes(user.role?.toLowerCase().split(" ")[0] || "") ||
      rec.whyYou.toLowerCase().includes(user.goal?.toLowerCase().split(" ")[0] || "")
    ) {
      break;
    }

    console.log(`WHY YOU validation failed, retrying (attempt ${attempts})...`);
  }

  rec.resourceUrl = await fetchYouTubeLink(rec.searchQuery || rec.topic);
  return rec;
}

async function fetchYouTubeLink(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query + " design tutorial")}&type=video&videoDuration=medium&publishedAfter=${ninetyDaysAgo.toISOString()}&maxResults=5&key=${apiKey}&relevanceLanguage=en`;

  try {
    const res = await fetch(searchUrl);
    const data = await res.json();
    if (!data.items?.length) {
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }
    return `https://www.youtube.com/watch?v=${data.items[0].id.videoId}`;
  } catch (err) {
    console.error("YouTube API error:", err);
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }
}