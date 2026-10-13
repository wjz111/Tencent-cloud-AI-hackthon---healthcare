/**
 * Nutrition estimation using a local JSON food database.
 * No external API calls — all data comes from server/data/food-nutrition.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

/**
 * Estimate nutrition for a food item using the local JSON database.
 * @param {string} foodText - Natural language food description
 * @returns {{food: string, calories: number, sugar: number, fat: number, protein: number, source: string}}
 */
export function estimateNutrition(foodText) {
  const lowerText = foodText.toLowerCase();
  const db = getFoodDB();

  let bestMatch = null;
  let bestScore = 0;

  for (const [key, values] of Object.entries(db)) {
    if (lowerText.includes(key)) {
      const score = key.length; // Longer match = better
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { key, values };
      }
    }
  }

  if (bestMatch) {
    const portionMultiplier = lowerText.includes('bowl') || lowerText.includes('plate') ? 2.5 : 1.5;
    const v = bestMatch.values;
    return {
      food: foodText,
      calories: Math.round(v.calories * portionMultiplier / 10) * 10,
      sugar: Math.round(v.sugar * portionMultiplier * 10) / 10,
      fat: Math.round(v.fat * portionMultiplier * 10) / 10,
      protein: Math.round(v.protein * portionMultiplier * 10) / 10,
      source: 'json-db',
    };
  }

  // No match found - return generic estimate
  return {
    food: foodText,
    calories: 200,
    sugar: 5,
    fat: 8,
    protein: 10,
    source: 'generic',
  };
}
