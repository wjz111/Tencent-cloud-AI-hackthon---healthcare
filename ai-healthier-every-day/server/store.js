/**
 * In-memory data store for user profiles, long-term memory, and chat history.
 * In production, this would use TencentDB (MySQL) + Redis + Vector DB.
 * For the hackathon demo, we use in-memory storage with JSON file persistence.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, 'store.json');

// In-memory store
let store = {
  users: {},
  chatHistory: {},
  dailyLogs: {},
};

// Load persisted data
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    store = JSON.parse(raw);
  }
} catch (e) {
  console.log('[Store] Starting with fresh store');
}

// Persist to disk
function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('[Store] Failed to persist:', e.message);
  }
}

// Get current date string (YYYY-MM-DD) in user's local timezone
function getDateString(timezone = 'Asia/Singapore') {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: timezone });
}

// Get current time string
function getTimeString(timezone = 'Asia/Singapore') {
  const now = new Date();
  return now.toLocaleTimeString('en-SG', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
}

/**
 * User Profile Management
 */
export function getUser(userId) {
  if (!store.users[userId]) {
    store.users[userId] = {
      id: userId,
      profile: null, // { age, height, weight, gender }
      goals: [], // [{ metric, target, unit, category }]
      longTermMemory: [], // [{ key, value, updatedAt }]
      timezone: 'Asia/Singapore',
      createdAt: new Date().toISOString(),
    };
  }
  return store.users[userId];
}

export function updateUserProfile(userId, profile) {
  const user = getUser(userId);
  user.profile = { ...user.profile, ...profile };
  persist();
  return user;
}

export function setUserGoals(userId, goals) {
  const user = getUser(userId);
  user.goals = goals;
  persist();
  return user;
}

export function updateLongTermMemory(userId, key, value) {
  const user = getUser(userId);
  const existingIdx = user.longTermMemory.findIndex(m => m.key === key);
  const entry = { key, value, updatedAt: new Date().toISOString() };
  if (existingIdx >= 0) {
    user.longTermMemory[existingIdx] = entry;
  } else {
    user.longTermMemory.push(entry);
  }
  persist();
  return user;
}

export function getLongTermMemoryContext(userId) {
  const user = getUser(userId);
  if (!user.longTermMemory.length) return '';
  return user.longTermMemory
    .map(m => `- ${m.key}: ${m.value}`)
    .join('\n');
}

export function getProfileContext(userId) {
  const user = getUser(userId);
  if (!user.profile) return 'No profile set up yet.';
  const parts = [];
  if (user.profile.age) parts.push(`Age: ${user.profile.age}`);
  if (user.profile.height) parts.push(`Height: ${user.profile.height}cm`);
  if (user.profile.weight) parts.push(`Weight: ${user.profile.weight}kg`);
  if (user.profile.gender) parts.push(`Gender: ${user.profile.gender}`);
  if (user.profile.conditions) parts.push(`Health conditions: ${user.profile.conditions}`);
  return parts.join(', ');
}

export function getGoalsContext(userId) {
  const user = getUser(userId);
  if (!user.goals.length) return 'No health goals set.';
  return user.goals
    .map(g => `- ${g.metric}: ${g.target}${g.unit} (${g.category})`)
    .join('\n');
}

/**
 * Chat History Management
 */
export function getChatHistory(userId, dateStr) {
  const key = `${userId}_${dateStr}`;
  return store.chatHistory[key] || [];
}

export function addChatMessage(userId, role, content, dateStr) {
  const key = `${userId}_${dateStr}`;
  if (!store.chatHistory[key]) {
    store.chatHistory[key] = [];
  }
  const message = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  store.chatHistory[key].push(message);
  persist();
  return message;
}

export function getTodayChatHistory(userId) {
  const user = getUser(userId);
  const dateStr = getDateString(user.timezone);
  return getChatHistory(userId, dateStr);
}

export function getChatHistoryContext(userId) {
  const history = getTodayChatHistory(userId);
  if (!history.length) return 'No conversations today yet.';
  return history
    .map(m => `${m.role === 'user' ? 'User' : 'Plus'}: ${m.content}`)
    .join('\n');
}

export function getYesterdaySummary(userId) {
  const user = getUser(userId);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toLocaleDateString('en-CA', { timeZone: user.timezone });
  const history = getChatHistory(userId, dateStr);
  if (!history.length) return null;

  // Simple summary extraction (in production, this would use LLM summarization + vector DB)
  const userMessages = history.filter(m => m.role === 'user').map(m => m.content);
  if (!userMessages.length) return null;
  return `Yesterday the user mentioned: ${userMessages.join('; ')}`;
}

/**
 * Daily Nutrition Log
 */
export function getDailyLog(userId, dateStr) {
  const key = `${userId}_${dateStr}`;
  if (!store.dailyLogs[key]) {
    store.dailyLogs[key] = { foods: [], totalCalories: 0, totalSugar: 0, totalFat: 0, totalProtein: 0 };
  }
  return store.dailyLogs[key];
}

export function addNutritionEntry(userId, foodName, nutrition) {
  const user = getUser(userId);
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
  persist();
  return log;
}

export function getDailyProgress(userId) {
  const user = getUser(userId);
  const dateStr = getDateString(user.timezone);
  const log = getDailyLog(userId, dateStr);
  const goals = user.goals;

  const progress = goals.map(g => {
    let current = 0;
    if (g.metric === 'calories') current = log.totalCalories;
    else if (g.metric === 'sugar') current = log.totalSugar;
    else if (g.metric === 'fat') current = log.totalFat;
    else if (g.metric === 'protein') current = log.totalProtein;
    return {
      ...g,
      current,
      percentage: g.target > 0 ? Math.round((current / g.target) * 100) : 0,
    };
  });

  return { date: dateStr, foods: log.foods, progress };
}

export function getCurrentTimeInfo(userId) {
  const user = getUser(userId);
  return {
    date: getDateString(user.timezone),
    time: getTimeString(user.timezone),
    timezone: user.timezone,
  };
}
