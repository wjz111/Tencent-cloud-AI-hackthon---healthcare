/**
 * Agent wrapper for the CodeBuddy Agent SDK.
 * Implements the two-agent architecture from the PRD:
 * - Agent 01: Profile Agent (profile setup, goal generation, health report evaluation)
 * - Agent 02: Conversation Agent (daily chat, reminders, nutrition tracking)
 *
 * Architecture: Browser (React) <-- WebSocket --> Express Server <-- SDK query()
 */

import { query } from '@tencent-ai/agent-sdk';
import { CONVERSATION_AGENT_PROMPT, PROFILE_AGENT_PROMPT } from './prompts.js';
import {
  getUser,
  getProfileContext,
  getGoalsContext,
  getLongTermMemoryContext,
  getChatHistoryContext,
  getYesterdaySummary,
  getCurrentTimeInfo,
  addChatMessage,
  updateLongTermMemory,
  addNutritionEntry,
  getDailyProgress,
} from './store.js';
import { estimateNutrition } from './nutrition.js';

/**
 * Build context string for the conversation agent.
 */
function buildConversationContext(userId) {
  const timeInfo = getCurrentTimeInfo(userId);
  const profileCtx = getProfileContext(userId);
  const goalsCtx = getGoalsContext(userId);
  const memoryCtx = getLongTermMemoryContext(userId);
  const historyCtx = getChatHistoryContext(userId);
  const yesterdaySummary = getYesterdaySummary(userId);
  const progress = getDailyProgress(userId);

  let context = `## Current Context
- Date: ${timeInfo.date}
- Time: ${timeInfo.time} (Singapore Time)
- Timezone: ${timeInfo.timezone}

## User Profile
${profileCtx}

## Health Goals (Daily Targets)
${goalsCtx}

## Long-Term Memory (User Facts)
${memoryCtx || 'No long-term memory yet.'}

## Today's Chat History
${historyCtx}
`;

  if (yesterdaySummary) {
    context += `\n## Yesterday's Summary\n${yesterdaySummary}\n`;
  }

  if (progress.foods.length > 0) {
    context += `\n## Today's Nutrition Log\n`;
    context += progress.foods.map(f => `- ${f.food}: ${f.calories}kcal, ${f.sugar}g sugar, ${f.fat}g fat, ${f.protein}g protein`).join('\n');
    context += `\nTotal today: ${progress.foods.reduce((s, f) => s + f.calories, 0)}kcal\n`;
  }

  return context;
}

/**
 * Check if the user's message mentions food items.
 */
function checkForFoodMention(message) {
  const foodKeywords = [
    'eat', 'ate', 'had', 'lunch', 'dinner', 'breakfast', 'snack',
    'meal', 'food', 'drink', 'coffee', 'tea', 'water', 'rice', 'noodle',
    'chicken', 'beef', 'pork', 'fish', 'soup', 'salad', 'fruit',
    'curry', 'fried', 'grilled', 'steamed', 'roasted',
    'char kway teow', 'nasi lemak', 'laksa', 'chicken rice', 'roti prata',
    'hawker', 'kopi', 'bubble tea', 'juice', 'milk', 'bread', 'egg',
  ];
  const lowerMsg = message.toLowerCase();
  return foodKeywords.some(kw => lowerMsg.includes(kw));
}

/**
 * Extract food name from user message (simple heuristic).
 */
function extractFoodName(message) {
  // Look for patterns like "I had X", "I ate X", "for lunch I had X"
  const patterns = [
    /(?:i (?:had|ate|eating|eat|drinking|drink))\s+(?:a\s+|an\s+|some\s+|a bowl of\s+|a plate of\s+)?(.+?)(?:\.|,|$|for|today|this morning|this afternoon)/i,
    /(?:for\s+(?:breakfast|lunch|dinner|snack))\s+(?:i\s+)?(?:had|ate|eating|eat)?\s*(?:a\s+|an\s+|some\s+)?(.+?)(?:\.|,|$)/i,
    /(?:lunch|dinner|breakfast)\s+(?:was|is)\s+(.+?)(?:\.|,|$)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // If no pattern matches, use the whole message if it's short enough
  if (message.length < 50) {
    return message.trim();
  }

  return null;
}

/**
 * Handle a chat message from the user.
 * Routes to the appropriate agent and streams the response.
 *
 * @param {string} userId - Unique user identifier
 * @param {string} message - User's message
 * @param {string} agentType - 'conversation' or 'profile'
 * @param {function} onMessage - Callback for streaming messages
 */
export async function handleChatMessage(userId, message, agentType, onMessage) {
  const user = getUser(userId);

  // Store user message in history
  const timeInfo = getCurrentTimeInfo(userId);
  addChatMessage(userId, 'user', message, timeInfo.date);

  // Check for food mentions and log nutrition
  let nutritionContext = '';
  if (agentType === 'conversation' && checkForFoodMention(message)) {
    const foodName = extractFoodName(message);
    if (foodName) {
      try {
        const nutrition = await estimateNutrition(foodName);
        addNutritionEntry(userId, nutrition.food, nutrition);
        nutritionContext = `\n\n## Nutrition Auto-Logged\nFood: ${nutrition.food}\nCalories: ${nutrition.calories}kcal, Sugar: ${nutrition.sugar}g, Fat: ${nutrition.fat}g, Protein: ${nutrition.protein}g\nSource: ${nutrition.source}\nThis has been automatically logged. Comment on whether this aligns with the user's health goals.`;
      } catch (e) {
        console.log('[Agent] Nutrition estimation failed:', e.message);
      }
    }
  }

  // Build the full prompt
  const systemPrompt = agentType === 'profile' ? PROFILE_AGENT_PROMPT : CONVERSATION_AGENT_PROMPT;
  const context = agentType === 'profile'
    ? `## User Profile\n${getProfileContext(userId)}\n\n## Current Goals\n${getGoalsContext(userId)}`
    : buildConversationContext(userId);

  const fullPrompt = `${systemPrompt}\n\n---\n\n${context}${nutritionContext}\n\n---\n\nUser message: ${message}`;

  try {
    const q = query({
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
            onMessage({
              type: 'stream',
              content: block.text,
            });
          }
        }
      } else if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          onMessage({
            type: 'done',
            duration: msg.duration_ms,
          });
        } else {
          onMessage({
            type: 'error',
            error: 'Agent execution failed',
          });
        }
      }
    }

    // Store agent response in history
    if (fullResponse) {
      addChatMessage(userId, 'assistant', fullResponse, timeInfo.date);

      // Try to extract and store long-term memory updates
      // The agent naturally identifies facts during conversation
      // In production, this would use a dedicated tool call
      const memoryPatterns = [
        { pattern: /(?:i (?:am|'m)\s+(?:a\s+)?(?:vegetarian|vegan|allergic|diabetic|hypertensive|pregnant))/i, key: 'dietary_restriction' },
        { pattern: /(?:i (?:don't like|dislike|hate|love|enjoy))\s+(.+?)(?:\.|,|$)/i, key: 'food_preference' },
        { pattern: /(?:i (?:work|exercise|walk|run|swim|cycle|gym))\s+(?:at|in|for|every)?\s*(.+?)(?:\.|,|$)/i, key: 'exercise_habit' },
      ];

      for (const { pattern, key } of memoryPatterns) {
        const match = message.match(pattern);
        if (match) {
          updateLongTermMemory(userId, key, match[0]);
        }
      }
    }
  } catch (error) {
    console.error('[Agent] Error:', error.message);
    // Fallback response if SDK is not available
    const fallbackResponse = getFallbackResponse(message, agentType);
    onMessage({
      type: 'stream',
      content: fallbackResponse,
    });
    onMessage({
      type: 'done',
      duration: 0,
      fallback: true,
    });

    if (fallbackResponse) {
      addChatMessage(userId, 'assistant', fallbackResponse, timeInfo.date);
    }
  }
}

/**
 * Generate a refresher message when the user opens the page or hourly.
 */
export async function generateRefresherMessage(userId, onMessage) {
  const user = getUser(userId);
  const timeInfo = getCurrentTimeInfo(userId);
  const hour = parseInt(timeInfo.time.split(':')[0], 10);

  const profileCtx = getProfileContext(userId);
  const goalsCtx = getGoalsContext(userId);
  const memoryCtx = getLongTermMemoryContext(userId);
  const historyCtx = getChatHistoryContext(userId);
  const progress = getDailyProgress(userId);
  const yesterdaySummary = getYesterdaySummary(userId);

  // Determine if it's morning (before 11 AM)
  const isMorning = hour < 11;

  const refresherType = isMorning ? 'morning_summary' : 'refresher';

  let prompt = `## Current Context
- Date: ${timeInfo.date}
- Time: ${timeInfo.time} (Singapore Time)
- Type: ${refresherType}

## User Profile
${profileCtx}

## Health Goals
${goalsCtx}

## Long-Term Memory
${memoryCtx || 'No memory yet.'}

## Today's Chat History
${historyCtx}

## Today's Nutrition Progress
${progress.foods.length > 0
  ? progress.foods.map(f => `- ${f.food}: ${f.calories}kcal`).join('\n') + `\nTotal: ${progress.foods.reduce((s, f) => s + f.calories, 0)}kcal`
  : 'No food logged yet.'}
`;

  if (isMorning && yesterdaySummary) {
    prompt += `\n## Yesterday's Summary\n${yesterdaySummary}\n`;
    prompt += `\nGenerate a morning summary as "Today's key points" based on yesterday's activities, then give a friendly greeting and prompt the user to start their day healthily. Keep it short and engaging.`;
  } else if (isMorning) {
    prompt += `\nIt's morning. Give a friendly good morning greeting and ask the user what they had for breakfast or plan to do today. Keep it to 1-2 sentences.`;
  } else if (hour >= 11 && hour < 14) {
    prompt += `\nIt's lunch time. Remind the user about their health goals and ask what they had for lunch. If they already mentioned lunch, comment on it. Keep it to 1-2 sentences.`;
  } else if (hour >= 14 && hour < 17) {
    prompt += `\nIt's afternoon. Give a refresher reminder about water intake, snacks, or exercise. If the user hasn't been active today, nudge them. Keep it to 1-2 sentences.`;
  } else if (hour >= 17 && hour < 20) {
    prompt += `\nIt's evening/dinner time. Remind the user about their dinner choices and health goals. If they mentioned fried food earlier, call it out. Keep it to 1-2 sentences.`;
  } else {
    prompt += `\nIt's night time. Ask about the user's day and how they feel about their health habits today. Keep it to 1-2 sentences.`;
  }

  const fullPrompt = `${CONVERSATION_AGENT_PROMPT}\n\n---\n\n${prompt}\n\nGenerate ONLY the message content. No explanations.`;

  try {
    const q = query({
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
            onMessage({
              type: 'stream',
              content: block.text,
            });
          }
        }
      } else if (msg.type === 'result') {
        onMessage({
          type: 'done',
          duration: msg.duration_ms,
        });
      }
    }

    if (fullResponse) {
      addChatMessage(userId, 'assistant', fullResponse, timeInfo.date);
    }
  } catch (error) {
    console.error('[Agent] Refresher error:', error.message);
    const fallback = getFallbackRefresher(hour, isMorning, progress);
    onMessage({ type: 'stream', content: fallback });
    onMessage({ type: 'done', duration: 0, fallback: true });
    addChatMessage(userId, 'assistant', fallback, timeInfo.date);
  }
}

/**
 * Fallback responses when SDK is not available.
 */
function getFallbackResponse(message, agentType) {
  const responses = {
    conversation: [
      "Noted! I'll keep track of that for you. Anything else to update? 😊",
      "Okie dokie, got it! Keep it going, you're doing great!",
      "Sounds good! Thanks for sharing. What else did you do today?",
      "Got it lah! I'll remember that. How about your water intake today?",
    ],
    profile: [
      "Got your info! Let me set that up for you. Anything else to add?",
      "Noted! I'll update your profile with that information.",
      "Steady! Your goals are set. Let's keep track together!",
    ],
  };
  const list = responses[agentType] || responses.conversation;
  return list[Math.floor(Math.random() * list.length)];
}

function getFallbackRefresher(hour, isMorning, progress) {
  if (isMorning) {
    return "Good morning! ☀️ Ready to start a healthy day? What did you have for breakfast?";
  }
  if (hour >= 11 && hour < 14) {
    return `Lunch time! What are you having today? Remember your goals lah! 🥗`;
  }
  if (hour >= 14 && hour < 17) {
    const totalCal = progress.foods.reduce((s, f) => s + f.calories, 0);
    if (totalCal > 0) {
      return `It's afternoon! You've had about ${totalCal}kcal so far today. Have you drunk enough water? 💧`;
    }
    return "It's 3pm — have you drunk at least 500ml water today? Stay hydrated! 💧";
  }
  if (hour >= 17 && hour < 20) {
    return "Dinner time! Don't eat fried stuff okay? What's on the menu tonight? 🍽️";
  }
  return "How was your day? Did you meet your health goals today? 😊";
}
