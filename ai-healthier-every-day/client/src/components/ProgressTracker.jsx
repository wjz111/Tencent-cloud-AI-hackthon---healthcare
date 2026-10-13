import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export default function ProgressTracker({ userId }) {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/user/${userId}/progress`);
      if (res.ok) {
        const data = await res.json();
        setProgress(data);
      }
    } catch (e) {
      console.error('Progress fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProgress();
    const interval = setInterval(fetchProgress, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchProgress]);

  if (loading) {
    return (
      <div className="profile-section">
        <h2>Today's Progress</h2>
        <div className="progress-loading">Loading progress...</div>
      </div>
    );
  }

  if (!progress || !progress.progress || progress.progress.length === 0) {
    return (
      <div className="profile-section">
        <h2>Today's Progress</h2>
        <div className="progress-empty">
          <p>No goals to track yet. Set up your health goals first!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-section">
      <h2>Today's Progress</h2>
      <div className="progress-date">{progress.date}</div>

      {/* Food log for today */}
      {progress.foods && progress.foods.length > 0 && (
        <div className="food-log">
          <h3>Food Log</h3>
          {progress.foods.map((food, idx) => (
            <div key={idx} className="food-item">
              <div className="food-name">{food.food}</div>
              <div className="food-stats">
                <span>{food.calories} kcal</span>
                <span>{food.sugar}g sugar</span>
                <span>{food.fat}g fat</span>
                <span>{food.protein}g protein</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Progress bars */}
      <div className="progress-bars">
        {progress.progress.map((item, idx) => (
          <div key={idx} className="progress-bar-item">
            <div className="progress-bar-header">
              <span className="progress-metric">{formatMetric(item.metric)}</span>
              <span className="progress-values">
                {item.current}{item.unit.split('/')[0]} / {item.target}{item.unit.split('/')[0]}
              </span>
            </div>
            <div className="progress-bar-track">
              <div
                className={`progress-bar-fill ${getProgressColor(item.percentage, item.metric)}`}
                style={{ width: `${Math.min(item.percentage, 100)}%` }}
              />
            </div>
            <div className="progress-percentage">{item.percentage}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMetric(metric) {
  const map = {
    calories: 'Calories',
    sugar: 'Sugar',
    fat: 'Fat',
    protein: 'Protein',
    water: 'Water',
    steps: 'Steps',
    exercise: 'Exercise',
    saturated_fat: 'Saturated Fat',
  };
  return map[metric] || metric;
}

function getProgressColor(percentage, metric) {
  // For calories, sugar, fat — going over is bad
  const limitMetrics = ['calories', 'sugar', 'fat', 'saturated_fat'];
  if (limitMetrics.includes(metric)) {
    if (percentage < 70) return 'good';
    if (percentage < 100) return 'warning';
    return 'over';
  }
  // For protein, water, steps — reaching goal is good
  if (percentage >= 100) return 'good';
  if (percentage >= 50) return 'warning';
  return 'low';
}
