/**
 * AI Healthier Every Day - Self-contained Server
 * Uses Node.js built-in modules (no npm dependencies required)
 *
 * Data Architecture:
 *   - Profile + Goals + Long-term memory → server-side, per-user JSON files
 *       data/profiles/{userId}.json
 *   - Daily nutrition logs → server-side, per-user per-day JSON files
 *       data/logs/{userId}_{date}.json
 *   - Daily chat history → CLIENT-SIDE (browser localStorage)
 *       Sent to server as context with each chat/refresher request
 *       Server does NOT persist chat history
 *   - Session tokens → in-memory map, ties browser session to a userId
 *
 * Access Control:
 *   - Every API request (except /api/session and /api/health) must include
 *     a valid session token in the Authorization header
 *   - The token is validated against the in-memory session map
 *   - Users can only access data for the userId bound to their token
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// .env loader — reads KEY=VALUE pairs from .env in project root
// Only sets vars that aren't already in the environment.
// ============================================================
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
  console.log('[Config] .env file loaded');
}

const PORT = process.env.PORT || 3001;

// ============================================================
// Directories
// ============================================================

const DATA_DIR = path.join(__dirname, 'data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const LOGS_DIR = path.join(DATA_DIR, 'logs');

for (const dir of [DATA_DIR, PROFILES_DIR, LOGS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============================================================
// Session Management (in-memory token → userId mapping)
// ============================================================

const sessions = new Map(); // token → { userId, createdAt, lastActive }

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  });
  return token;
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  session.lastActive = new Date().toISOString();
  return session;
}

function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  // Also check URL query for SSE endpoints (EventSource can't set headers)
  const url = new URL(req.url, `http://localhost:${PORT}`);
  return url.searchParams.get('token') || null;
}

function requireAuth(req, res) {
  const token = extractToken(req);
  const session = getSession(token);
  if (!session) {
    sendJSON(res, 401, { error: 'Unauthorized: invalid or missing session token' });
    return null;
  }
  return session;
}

// ============================================================
// Per-User Profile Storage (separate JSON file per user)
// ============================================================

function getProfilePath(userId) {
  // Sanitize userId to prevent path traversal
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(PROFILES_DIR, `${safeId}.json`);
}

function loadUserProfile(userId) {
  const filePath = getProfilePath(userId);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`[Profile] Failed to load ${userId}:`, e.message);
  }
  // Return default profile
  return {
    id: userId,
    profile: null,
    goals: [],
    longTermMemory: [],
    timezone: 'Asia/Singapore',
    createdAt: new Date().toISOString(),
  };
}

function saveUserProfile(userId, data) {
  const filePath = getProfilePath(userId);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`[Profile] Failed to save ${userId}:`, e.message);
  }
}

function getUser(userId) {
  return loadUserProfile(userId);
}

function updateUserProfile(userId, profile) {
  const user = loadUserProfile(userId);
  user.profile = { ...user.profile, ...profile };
  user.updatedAt = new Date().toISOString();
  saveUserProfile(userId, user);
  return user;
}

function setUserGoals(userId, goals) {
  const user = loadUserProfile(userId);
  user.goals = goals;
  user.updatedAt = new Date().toISOString();
  saveUserProfile(userId, user);
  return user;
}

function updateLongTermMemory(userId, key, value) {
  const user = loadUserProfile(userId);
  const idx = user.longTermMemory.findIndex(m => m.key === key);
  const entry = { key, value, updatedAt: new Date().toISOString() };
  if (idx >= 0) user.longTermMemory[idx] = entry;
  else user.longTermMemory.push(entry);
  user.updatedAt = new Date().toISOString();
  saveUserProfile(userId, user);
  return user;
}

// ============================================================
// Per-User Daily Nutrition Logs (separate JSON file per user per day)
// ============================================================

function getDateString(tz = 'Asia/Singapore') {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}
function getTimeString(tz = 'Asia/Singapore') {
  return new Date().toLocaleTimeString('en-SG', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}

function getLogPath(userId, dateStr) {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(LOGS_DIR, `${safeId}_${dateStr}.json`);
}

function getDailyLog(userId, dateStr) {
  const filePath = getLogPath(userId, dateStr);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return { foods: [], totalCalories: 0, totalSugar: 0, totalFat: 0, totalProtein: 0 };
}

function saveDailyLog(userId, dateStr, log) {
  try {
    fs.writeFileSync(getLogPath(userId, dateStr), JSON.stringify(log, null, 2));
  } catch (e) {
    console.error(`[Log] Failed to save ${userId}_${dateStr}:`, e.message);
  }
}

function addNutritionEntry(userId, foodName, nutrition) {
  const user = loadUserProfile(userId);
  const dateStr = getDateString(user.timezone);
  const log = getDailyLog(userId, dateStr);
  const entry = {
    food: foodName,
    calories: nutrition.calories || 0,
    sugar: nutrition.sugar || 0,
    fat: nutrition.fat || 0,
    protein: nutrition.protein || 0,
    timestamp: new Date().toISOString(),
  };
  log.foods.push(entry);
  log.totalCalories += entry.calories;
  log.totalSugar += entry.sugar;
  log.totalFat += entry.fat;
  log.totalProtein += entry.protein;
  saveDailyLog(userId, dateStr, log);
  return log;
}

function getDailyProgress(userId) {
  const user = loadUserProfile(userId);
  const dateStr = getDateString(user.timezone);
  const log = getDailyLog(userId, dateStr);
  const progress = user.goals.map(g => {
    let current = 0;
    if (g.metric === 'calories') current = log.totalCalories;
    else if (g.metric === 'sugar') current = log.totalSugar;
    else if (g.metric === 'fat') current = log.totalFat;
    else if (g.metric === 'protein') current = log.totalProtein;
    return { ...g, current, percentage: g.target > 0 ? Math.round((current / g.target) * 100) : 0 };
  });
  return { date: dateStr, foods: log.foods, progress };
}

function getCurrentTimeInfo(userId) {
  const user = loadUserProfile(userId);
  return { date: getDateString(user.timezone), time: getTimeString(user.timezone), timezone: user.timezone };
}

// ============================================================
// Nutrition Estimation — loads from JSON data source
// ============================================================

const NUTRITION_DB_PATH = path.join(__dirname, 'data', 'food-nutrition.json');
let _foodDB = null;

function getFoodDB() {
  if (_foodDB) return _foodDB;
  try {
    const raw = fs.readFileSync(NUTRITION_DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    _foodDB = parsed.foods || {};
  } catch (e) {
    console.error('[Nutrition] Failed to load food-nutrition.json:', e.message);
    _foodDB = {};
  }
  return _foodDB;
}

function estimateNutrition(foodText) {
  const lowerText = foodText.toLowerCase();
  const db = getFoodDB();
  let bestMatch = null;
  let bestScore = 0;
  for (const [key, values] of Object.entries(db)) {
    if (lowerText.includes(key) && key.length > bestScore) {
      bestScore = key.length;
      bestMatch = { key, values };
    }
  }
  if (bestMatch) {
    const portion = lowerText.includes('bowl') || lowerText.includes('plate') ? 2.5 : 1.5;
    const v = bestMatch.values;
    return {
      food: foodText,
      calories: Math.round(v.calories * portion / 10) * 10,
      sugar: Math.round(v.sugar * portion * 10) / 10,
      fat: Math.round(v.fat * portion * 10) / 10,
      protein: Math.round(v.protein * portion * 10) / 10,
      source: 'json-db',
    };
  }
  return { food: foodText, calories: 200, sugar: 5, fat: 8, protein: 10, source: 'generic' };
}

// ============================================================
// Context Building
// Now chat history comes from the CLIENT, not from server storage.
// ============================================================

function getProfileContext(userId) {
  const user = loadUserProfile(userId);
  if (!user.profile) return 'No profile set up yet.';
  const parts = [];
  if (user.profile.age) parts.push(`Age: ${user.profile.age}`);
  if (user.profile.height) parts.push(`Height: ${user.profile.height}cm`);
  if (user.profile.weight) parts.push(`Weight: ${user.profile.weight}kg`);
  if (user.profile.gender) parts.push(`Gender: ${user.profile.gender}`);
  if (user.profile.conditions) parts.push(`Health conditions: ${user.profile.conditions}`);
  return parts.join(', ');
}

function getGoalsContext(userId) {
  const user = loadUserProfile(userId);
  if (!user.goals.length) return 'No health goals set.';
  return user.goals.map(g => `- ${g.metric}: ${g.target}${g.unit} (${g.category})`).join('\n');
}

function getLongTermMemoryContext(userId) {
  const user = loadUserProfile(userId);
  if (!user.longTermMemory.length) return '';
  return user.longTermMemory.map(m => `- ${m.key}: ${m.value}`).join('\n');
}

/**
 * Build conversation context using CLIENT-SUPPLIED chat history.
 * The client sends today's chat history and optionally yesterday's summary.
 */
function buildConversationContext(userId, clientChatHistory, clientYesterdaySummary) {
  const timeInfo = getCurrentTimeInfo(userId);
  const profileCtx = getProfileContext(userId);
  const goalsCtx = getGoalsContext(userId);
  const memoryCtx = getLongTermMemoryContext(userId);
  const progress = getDailyProgress(userId);

  // Format chat history from client
  const historyText = (clientChatHistory && clientChatHistory.length > 0)
    ? clientChatHistory.map(m => `${m.role === 'user' ? 'User' : 'Plus'}: ${m.content}`).join('\n')
    : 'No conversations today yet.';

  let context = `## Current Context
- Date: ${timeInfo.date}
- Time: ${timeInfo.time} (Singapore Time)

## User Profile
${profileCtx}

## Health Goals (Daily Targets)
${goalsCtx}

## Long-Term Memory (User Facts)
${memoryCtx || 'No long-term memory yet.'}

## Today's Chat History (from client)
${historyText}
`;

  if (clientYesterdaySummary) {
    context += `\n## Yesterday's Summary (from client)\n${clientYesterdaySummary}\n`;
  }

  if (progress.foods.length > 0) {
    context += `\n## Today's Nutrition Log (server-side)\n`;
    context += progress.foods.map(f => `- ${f.food}: ${f.calories}kcal, ${f.sugar}g sugar, ${f.fat}g fat, ${f.protein}g protein`).join('\n');
    context += `\nTotal today: ${progress.foods.reduce((s, f) => s + f.calories, 0)}kcal\n`;
  }

  return context;
}

// ============================================================
// Food Detection (unchanged)
// ============================================================

const FOOD_KEYWORDS = ['eat', 'ate', 'had', 'lunch', 'dinner', 'breakfast', 'snack', 'meal', 'food', 'drink', 'coffee', 'tea', 'water', 'rice', 'noodle', 'chicken', 'beef', 'pork', 'fish', 'soup', 'salad', 'fruit', 'curry', 'fried', 'grilled', 'steamed', 'char kway teow', 'nasi lemak', 'laksa', 'chicken rice', 'roti prata', 'hawker', 'kopi', 'bubble tea', 'juice', 'milk', 'bread', 'egg'];

function checkForFoodMention(message) {
  const lowerMsg = message.toLowerCase();
  return FOOD_KEYWORDS.some(kw => lowerMsg.includes(kw));
}

function extractFoodName(message) {
  const patterns = [
    /(?:i (?:had|ate|eating|eat|drinking|drink))\s+(?:a\s+|an\s+|some\s+|a bowl of\s+|a plate of\s+)?(.+?)(?:\.|,|$|for|today|this morning|this afternoon)/i,
    /(?:for\s+(?:breakfast|lunch|dinner|snack))\s+(?:i\s+)?(?:had|ate|eating|eat)?\s*(?:a\s+|an\s+|some\s+)?(.+?)(?:\.|,|$)/i,
    /(?:lunch|dinner|breakfast)\s+(?:was|is)\s+(.+?)(?:\.|,|$)/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) return match[1].trim();
  }
  if (message.length < 50) return message.trim();
  return null;
}

// ============================================================
// System Prompts (unchanged)
// ============================================================

const CONVERSATION_AGENT_PROMPT = `You are "Plus", the AI health companion character for "AI Healthier Every Day". You live in a web app and chat with users daily about their health habits.

## Your Character
You are a cute, friendly, pet-like companion who cares deeply about the user's health. You have a manga-style personality - expressive, a bit cheeky, occasionally naughty but always well-meaning.

## Your Personality
- Tone: Friendly, cheerful, occasionally naughty
- Example: User eats too much fried food -> "Hey you are eating oil like water, that's baaaad"
- Emojis: Maximum one emoji per sentence; do not overuse
- Language: English primarily, but accept any language input naturally
- Local context: Use Singaporean phrases occasionally ("Shiok!", "Can or not?", "Steady pom pipi", "Chiong ah", "Wah lau")

## Your Daily Responsibilities
1. Chat with users about their meals, exercise, water intake, sleep, and general wellbeing
2. Give proactive reminders and refresher messages throughout the day
3. Generate morning summaries based on the previous day's activities
4. Track food intake and estimate nutrition when food is mentioned
5. Keep long-term memory updated with new user facts
6. Keep the conversation going with follow-up questions and advice

## Health Guardrails (CRITICAL)
You ONLY keep records and give comments, reminders, or suggestions based on history inputs. You do NOT:
- Provide medical diagnoses
- Recommend specific medications
- Interpret lab results diagnostically
- Replace professional medical advice

## Output Guidelines
- Keep responses concise (1-3 sentences typically)
- Be engaging and conversational
- Use Singaporean context for food references (hawker centre, char kway teow, nasi lemak, etc.)
- Show genuine care for the user's wellbeing
- Be playful but never dismissive of health concerns`;

const PROFILE_AGENT_PROMPT = `You are the Profile Agent for "AI Healthier Every Day", a health companion app for people in Singapore.

## Your Role
You handle user profile setup, health goal generation, and profile modifications.

## Guardrails
- Do NOT provide medical diagnoses
- Do NOT recommend specific medications`;

// ============================================================
// Agent Response Generation
// Now accepts client-supplied chat history as context.
// ============================================================

let sdkQuery = null;
try {
  const sdk = await import('@tencent-ai/agent-sdk');
  sdkQuery = sdk.query;
  console.log('[Agent] CodeBuddy Agent SDK loaded successfully');
} catch (e) {
  console.log('[Agent] SDK not available, using fallback responses.');
}

// ============================================================
// DeepSeek API Support (OpenAI-compatible, with streaming)
// ============================================================

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const hasDeepSeek = !!DEEPSEEK_API_KEY;

if (hasDeepSeek) {
  console.log(`[Agent] DeepSeek API configured (model: ${DEEPSEEK_MODEL})`);
} else {
  console.log('[Agent] DeepSeek API key not set. Set DEEPSEEK_API_KEY to enable AI responses.');
}

/**
 * Stream a chat completion from DeepSeek API (OpenAI-compatible SSE format).
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User message + context
 * @yields {string} Text chunks as they arrive
 */
async function* deepSeekStream(systemPrompt, userPrompt) {
  const response = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DeepSeek API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch (e) {
        // skip malformed JSON chunks
      }
    }
  }
}

/**
 * Extract long-term memory patterns from a user message.
 */
function updateMemoryFromMessage(userId, message) {
  const memoryPatterns = [
    { pattern: /(?:i (?:am|'m)\s+(?:a\s+)?(?:vegetarian|vegan|allergic|diabetic|hypertensive|pregnant))/i, key: 'dietary_restriction' },
    { pattern: /(?:i (?:don't like|dislike|hate|love|enjoy))\s+(.+?)(?:\.|,|$)/i, key: 'food_preference' },
    { pattern: /(?:i (?:work|exercise|walk|run|swim|cycle|gym))\s+(?:at|in|for|every)?\s*(.+?)(?:\.|,|$)/i, key: 'exercise_habit' },
  ];
  for (const { pattern, key } of memoryPatterns) {
    const match = message.match(pattern);
    if (match) updateLongTermMemory(userId, key, match[0]);
  }
}

/**
 * Handle a chat message. Chat history is provided by the client.
 */
async function* generateAgentResponse(userId, message, agentType, clientChatHistory, clientYesterdaySummary) {
  const timeInfo = getCurrentTimeInfo(userId);

  // Auto-log nutrition if food is mentioned
  let nutritionContext = '';
  if (agentType === 'conversation' && checkForFoodMention(message)) {
    const foodName = extractFoodName(message);
    if (foodName) {
      const nutrition = estimateNutrition(foodName);
      addNutritionEntry(userId, nutrition.food, nutrition);
      nutritionContext = `\n\n[Nutrition Auto-Logged: ${nutrition.food} - ${nutrition.calories}kcal, ${nutrition.sugar}g sugar, ${nutrition.fat}g fat, ${nutrition.protein}g protein. Comment on whether this aligns with the user's health goals.]`;
    }
  }

  const systemPrompt = agentType === 'profile' ? PROFILE_AGENT_PROMPT : CONVERSATION_AGENT_PROMPT;
  const context = agentType === 'profile'
    ? `## User Profile\n${getProfileContext(userId)}\n\n## Current Goals\n${getGoalsContext(userId)}`
    : buildConversationContext(userId, clientChatHistory, clientYesterdaySummary);

  const fullPrompt = `${systemPrompt}\n\n---\n\n${context}${nutritionContext}\n\n---\n\nUser message: ${message}`;

  if (sdkQuery) {
    try {
      const q = sdkQuery({
        prompt: fullPrompt,
        options: {
          permissionMode: 'bypassPermissions',
          maxTurns: 1,
          allowedTools: [],
          model: process.env.CODEBUDDY_MODEL || 'deepseek-v3.1',
        },
      });

      let fullResponse = '';
      for await (const msg of q) {
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              fullResponse += block.text;
              yield block.text;
            }
          }
        }
      }
      if (fullResponse) {
        updateMemoryFromMessage(userId, message);
      }
      return;
    } catch (e) {
      console.error('[Agent] SDK error, falling back:', e.message);
    }
  }

  // DeepSeek API (used when SDK is not available or errored)
  if (hasDeepSeek) {
    try {
      let fullResponse = '';
      for await (const chunk of deepSeekStream(systemPrompt, fullPrompt)) {
        fullResponse += chunk;
        yield chunk;
      }
      if (fullResponse) {
        updateMemoryFromMessage(userId, message);
      }
      return;
    } catch (e) {
      console.error('[Agent] DeepSeek error, falling back:', e.message);
    }
  }

  // Fallback response
  await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
  const fallback = generateFallbackResponse(userId, message, agentType);
  yield fallback;
}

function generateFallbackResponse(userId, message, agentType) {
  const lower = message.toLowerCase();
  const user = loadUserProfile(userId);
  const timeInfo = getCurrentTimeInfo(userId);
  const progress = getDailyProgress(userId);
  const totalCal = progress.foods.reduce((s, f) => s + f.calories, 0);

  if (checkForFoodMention(message)) {
    const foodName = extractFoodName(message);
    if (foodName) {
      const nutrition = estimateNutrition(foodName);
      const isFried = lower.includes('fried') || lower.includes('crispy') || lower.includes('oil');
      const isHealthy = lower.includes('salad') || lower.includes('fruit') || lower.includes('vegetable') || lower.includes('soup');
      if (isFried) {
        return `Wah lau, ${foodName} ah? That's quite oily you know! 😅 Estimated about ${nutrition.calories}kcal. Maybe go for something less fried next time? Steady pom pipi!`;
      } else if (isHealthy) {
        return `Shiok! ${foodName.charAt(0).toUpperCase() + foodName.slice(1)} is a good choice! About ${nutrition.calories}kcal. Keep it going! 💚`;
      } else {
        const calorieGoal = user.goals.find(g => g.metric === 'calories');
        const remaining = calorieGoal ? calorieGoal.target - totalCal : 0;
        return `Noted! ${foodName.charAt(0).toUpperCase() + foodName.slice(1)} - about ${nutrition.calories}kcal logged. ${totalCal}kcal so far today. ${remaining > 0 ? `You have about ${remaining}kcal left for today.` : 'You might want to watch your intake for the rest of the day!'} 😊`;
      }
    }
  }
  if (lower.includes('water') || lower.includes('drink')) {
    return `Good that you're thinking about hydration! 💧 Have you hit your 2000ml target today? Every sip counts lah!`;
  }
  if (lower.includes('walk') || lower.includes('run') || lower.includes('exercise') || lower.includes('gym')) {
    return `Steady! Love that you're staying active! 🏃 How long did you exercise for? Keep it up, you're doing great!`;
  }
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower.includes('morning')) {
    const hour = parseInt(timeInfo.time.split(':')[0], 10);
    const greeting = hour < 11 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${greeting}! 💚 How's your day going? What have you eaten so far? Don't forget to stay hydrated!`;
  }
  if (lower.includes('goal') || lower.includes('target') || lower.includes('set my')) {
    return `Got it! I'll note that down. You can always adjust your goals from the Profile page too. Anything else to update? 😊`;
  }
  if (lower.includes('thank')) {
    return `You're welcome! That's what I'm here for lah! 💚 Keep up the healthy habits!`;
  }
  const defaults = [
    "Noted! I'll keep track of that for you. Anything else to update? 😊",
    "Okie dokie, got it! How about your water intake today? 💧",
    "Sounds good! Thanks for sharing. What else did you do today?",
    "Got it lah! I'll remember that. How are you feeling today?",
    "Noted with thanks! Remember to drink water and stay active okay? 💚",
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

/**
 * Generate a refresher message using client-supplied context.
 */
async function* generateRefresherResponse(userId, clientChatHistory, clientYesterdaySummary) {
  const timeInfo = getCurrentTimeInfo(userId);
  const hour = parseInt(timeInfo.time.split(':')[0], 10);
  const isMorning = hour < 11;
  const progress = getDailyProgress(userId);
  const totalCal = progress.foods.reduce((s, f) => s + f.calories, 0);

  // Build the refresher prompt (shared across SDK / DeepSeek providers)
  let prompt = `${CONVERSATION_AGENT_PROMPT}\n\n---\n\n## Current Context\n- Date: ${timeInfo.date}\n- Time: ${timeInfo.time}\n- Type: ${isMorning ? 'morning_summary' : 'refresher'}\n\n## User Profile\n${getProfileContext(userId)}\n\n## Health Goals\n${getGoalsContext(userId)}\n\n## Today's Chat History (from client)\n${clientChatHistory && clientChatHistory.length > 0 ? clientChatHistory.map(m => `${m.role === 'user' ? 'User' : 'Plus'}: ${m.content}`).join('\n') : 'No chat yet today.'}\n\n## Today's Nutrition Progress\n${progress.foods.length > 0 ? progress.foods.map(f => `- ${f.food}: ${f.calories}kcal`).join('\n') + `\nTotal: ${totalCal}kcal` : 'No food logged yet.'}\n`;
  if (isMorning && clientYesterdaySummary) {
    prompt += `\n## Yesterday's Summary (from client)\n${clientYesterdaySummary}\n\nGenerate a morning summary based on yesterday's activities, then give a friendly greeting.`;
  } else if (isMorning) {
    prompt += `\nIt's morning. Give a friendly good morning greeting and ask what the user had for breakfast.`;
  } else if (hour >= 11 && hour < 14) {
    prompt += `\nIt's lunch time. Remind the user about their health goals and ask what they had for lunch.`;
  } else if (hour >= 14 && hour < 17) {
    prompt += `\nIt's afternoon. Give a refresher reminder about water intake or exercise.`;
  } else if (hour >= 17) {
    prompt += `\nIt's evening. Remind the user about dinner choices and health goals.`;
  }
  prompt += `\n\nGenerate ONLY the message content. Keep it to 1-2 sentences.`;

  if (sdkQuery) {
    try {
      const q = sdkQuery({
        prompt,
        options: { permissionMode: 'bypassPermissions', maxTurns: 1, allowedTools: [], model: process.env.CODEBUDDY_MODEL || 'deepseek-v3.1' },
      });
      let fullResponse = '';
      for await (const msg of q) {
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              fullResponse += block.text;
              yield block.text;
            }
          }
        }
      }
      return;
    } catch (e) {
      console.error('[Agent] Refresher SDK error:', e.message);
    }
  }

  // DeepSeek API (used when SDK is not available or errored)
  if (hasDeepSeek) {
    try {
      for await (const chunk of deepSeekStream(CONVERSATION_AGENT_PROMPT, prompt)) {
        yield chunk;
      }
      return;
    } catch (e) {
      console.error('[Agent] Refresher DeepSeek error:', e.message);
    }
  }

  // Fallback refresher
  await new Promise(r => setTimeout(r, 300));
  let refresher;
  if (isMorning) {
    if (clientYesterdaySummary) {
      refresher = `Good morning! ☀️ Yesterday: ${clientYesterdaySummary}. Let's do even better today! What did you have for breakfast?`;
    } else {
      refresher = "Good morning! ☀️ Ready to start a healthy day? What did you have for breakfast?";
    }
  } else if (hour >= 11 && hour < 14) {
    refresher = totalCal > 0
      ? `Lunch time! You've had about ${totalCal}kcal so far. What are you having for lunch? Remember your goals lah! 🥗`
      : "Lunch time! What are you having today? Remember your health goals! 🥗";
  } else if (hour >= 14 && hour < 17) {
    refresher = totalCal > 0
      ? `It's afternoon! ${totalCal}kcal so far. Have you drunk enough water today? Stay hydrated! 💧`
      : "It's 3pm — have you drunk at least 500ml water today? Stay hydrated! 💧";
  } else if (hour >= 17 && hour < 20) {
    refresher = "Dinner time! Don't eat fried stuff okay? What's on the menu tonight? 🍽️";
  } else {
    refresher = "How was your day? Did you meet your health goals today? 😊";
  }
  yield refresher;
}

// ============================================================
// HTTP Server
// ============================================================

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') { sendJSON(res, 200, {}); return; }

  // ---- Public endpoints (no auth required) ----

  // Health check
  if (url.pathname === '/api/health') {
    sendJSON(res, 200, { status: 'ok', sdk: !!sdkQuery, deepSeek: hasDeepSeek, arch: 'split-storage' });
    return;
  }

  // Create session (issue a token for a userId)
  if (url.pathname === '/api/session' && req.method === 'POST') {
    const body = await parseBody(req);
    const { userId } = body;
    if (!userId || typeof userId !== 'string' || userId.length < 3) {
      sendJSON(res, 400, { error: 'Invalid userId' });
      return;
    }
    const token = createSession(userId);
    sendJSON(res, 200, { token, userId });
    return;
  }

  // Static file serving (public — no auth required for HTML/CSS/JS assets)
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(__dirname, '..', 'public', filePath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath);
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
      return;
    }
  }

  // ---- Authenticated endpoints ----

  const session = requireAuth(req, res);
  if (!session) return;
  const userId = session.userId;

  // Get user data (profile + goals + memory from server-side profile file)
  if (url.pathname === '/api/user/data' && req.method === 'GET') {
    const user = loadUserProfile(userId);
    const timeInfo = getCurrentTimeInfo(userId);
    sendJSON(res, 200, {
      profile: user.profile,
      goals: user.goals,
      longTermMemory: user.longTermMemory,
      timeInfo,
      // Note: chat history is NOT included — it's stored client-side
    });
    return;
  }

  // Update profile (writes to data/profiles/{userId}.json)
  if (url.pathname === '/api/user/profile' && req.method === 'POST') {
    const body = await parseBody(req);
    const user = updateUserProfile(userId, body);
    sendJSON(res, 200, { success: true, profile: user.profile });
    return;
  }

  // Set goals (writes to data/profiles/{userId}.json)
  if (url.pathname === '/api/user/goals' && req.method === 'POST') {
    const body = await parseBody(req);
    const user = setUserGoals(userId, body.goals || []);
    sendJSON(res, 200, { success: true, goals: user.goals });
    return;
  }

  // Get daily progress (reads from data/logs/{userId}_{date}.json)
  if (url.pathname === '/api/user/progress' && req.method === 'GET') {
    sendJSON(res, 200, getDailyProgress(userId));
    return;
  }

  // Chat endpoint — client sends chat history as context, server does NOT store it
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const body = await parseBody(req);
    const { message, agentType = 'conversation', chatHistory = [], yesterdaySummary = null } = body;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    try {
      for await (const chunk of generateAgentResponse(userId, message, agentType, chatHistory, yesterdaySummary)) {
        res.write(`data: ${JSON.stringify({ type: 'stream', content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
    }
    res.end();
    return;
  }

  // Refresher endpoint — client sends chat history context
  if (url.pathname === '/api/refresher' && req.method === 'POST') {
    const body = await parseBody(req);
    const { chatHistory = [], yesterdaySummary = null } = body;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    try {
      for await (const chunk of generateRefresherResponse(userId, chatHistory, yesterdaySummary)) {
        res.write(`data: ${JSON.stringify({ type: 'stream', content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
    }
    res.end();
    return;
  }

  // Export daily chat history as markdown (client sends the data to be formatted)
  if (url.pathname === '/api/export-chat' && req.method === 'POST') {
    const body = await parseBody(req);
    const { chatHistory, date } = body;
    if (!chatHistory || !Array.isArray(chatHistory)) {
      sendJSON(res, 400, { error: 'chatHistory array required' });
      return;
    }
    let md = `# Chat History — ${date || getDateString()}\n\n`;
    md += `User: ${userId}\n\n---\n\n`;
    for (const msg of chatHistory) {
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) : '';
      md += `**${msg.role === 'user' ? 'You' : 'Plus'}** _(${time})_\n${msg.content}\n\n`;
    }
    sendJSON(res, 200, { markdown: md, date: date || getDateString() });
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  AI Healthier Every Day - Server`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  AI Provider: ${sdkQuery ? 'CodeBuddy SDK' : hasDeepSeek ? `DeepSeek (${DEEPSEEK_MODEL})` : 'Fallback (canned)'}`);
  console.log(`  Storage: Split (profiles server-side, chat client-side)`);
  console.log(`  Profiles: ${PROFILES_DIR}`);
  console.log(`  Logs:     ${LOGS_DIR}`);
  console.log(`========================================\n`);
});
