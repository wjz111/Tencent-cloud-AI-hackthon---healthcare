import React from 'react';

export default function GoalCard({ goal }) {
  const categoryIcon = goal.category === 'diet' ? '🍽️' : '🏃';
  const categoryColor = goal.category === 'diet' ? 'diet' : 'exercise';

  return (
    <div className={`goal-card ${categoryColor}`}>
      <div className="goal-icon">{categoryIcon}</div>
      <div className="goal-info">
        <div className="goal-metric">{formatMetric(goal.metric)}</div>
        <div className="goal-target">{goal.target} {goal.unit}</div>
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
  return map[metric] || metric.charAt(0).toUpperCase() + metric.slice(1);
}
