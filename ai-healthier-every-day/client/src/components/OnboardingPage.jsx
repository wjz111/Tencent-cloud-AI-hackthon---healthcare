import React, { useState } from 'react';
import PlusCharacter from './PlusCharacter.jsx';

export default function OnboardingPage({ onComplete, userId }) {
  const [step, setStep] = useState(0); // 0: welcome, 1: basic info, 2: health conditions, 3: goals preview
  const [profile, setProfile] = useState({
    age: '',
    height: '',
    weight: '',
    gender: '',
    conditions: '',
  });
  const [goals, setGoals] = useState([]);

  const handleNext = () => {
    if (step === 1 && profile.age && profile.height && profile.weight && profile.gender) {
      setStep(2);
    } else if (step === 2) {
      // Generate goals
      const bmi = profile.weight / Math.pow(profile.height / 100, 2);
      setGoals(generateDefaultGoals(profile, bmi));
      setStep(3);
    } else if (step === 3) {
      onComplete(profile, goals);
    } else {
      setStep(step + 1);
    }
  };

  const canProceed = () => {
    if (step === 1) return profile.age && profile.height && profile.weight && profile.gender;
    return true;
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        {/* Character at top */}
        <div className="onboarding-character">
          <PlusCharacter isStreaming={step === 0} />
        </div>

        {/* Progress dots */}
        <div className="onboarding-progress">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`progress-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
          ))}
        </div>

        {/* Step content */}
        <div className="onboarding-content">
          {step === 0 && (
            <div className="onboarding-step welcome">
              <h1>Hi, I'm Plus! 💚</h1>
              <p className="welcome-text">
                I'm your personal health buddy! I'll help you track your daily habits,
                give you friendly nudges, and keep you on track with your health goals.
              </p>
              <p className="welcome-subtext">
                Let's set up your profile first — it only takes 2 minutes!
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-step">
              <h2>Tell me about yourself</h2>
              <p className="step-hint">This helps me personalize your health targets</p>
              <div className="onboarding-form">
                <div className="form-row">
                  <div className="form-field">
                    <label>Age</label>
                    <input
                      type="number"
                      value={profile.age}
                      onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                      placeholder="e.g., 28"
                    />
                  </div>
                  <div className="form-field">
                    <label>Gender</label>
                    <select
                      value={profile.gender}
                      onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>Height (cm)</label>
                    <input
                      type="number"
                      value={profile.height}
                      onChange={(e) => setProfile({ ...profile, height: e.target.value })}
                      placeholder="e.g., 170"
                    />
                  </div>
                  <div className="form-field">
                    <label>Weight (kg)</label>
                    <input
                      type="number"
                      value={profile.weight}
                      onChange={(e) => setProfile({ ...profile, weight: e.target.value })}
                      placeholder="e.g., 65"
                    />
                  </div>
                </div>
              </div>
              {profile.height && profile.weight && (
                <div className="bmi-preview">
                  BMI: {(profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)} — {getBMICategory(profile.weight / Math.pow(profile.height / 100, 2))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-step">
              <h2>Any health conditions? (Optional)</h2>
              <p className="step-hint">
                Tell me about any health conditions or goals you have.
                I'll create personalized targets based on this!
              </p>
              <textarea
                className="conditions-input"
                value={profile.conditions}
                onChange={(e) => setProfile({ ...profile, conditions: e.target.value })}
                placeholder="e.g., 'I want to control my cholesterol level' or 'I'm prediabetic and need to watch my sugar'"
                rows={4}
              />
              <p className="step-note">
                Don't have a health report? No worries! Just type your goals in plain English.
                I'll figure out the right targets for you. 😊
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-step">
              <h2>Your Health Targets 🎯</h2>
              <p className="step-hint">
                Based on your profile, here are your personalized daily targets.
                You can always change these later by chatting with me!
              </p>
              <div className="goals-preview">
                {goals.map((goal, idx) => (
                  <div key={idx} className={`goal-preview-card ${goal.category}`}>
                    <span className="goal-preview-icon">
                      {goal.category === 'diet' ? '🍽️' : '🏃'}
                    </span>
                    <span className="goal-preview-text">
                      {formatMetric(goal.metric)}: {goal.target} {goal.unit}
                    </span>
                  </div>
                ))}
              </div>
              <p className="step-note">
                These are estimates based on standard health guidelines. Chat with me anytime to adjust!
              </p>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="onboarding-nav">
          {step > 0 && (
            <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleNext}
            disabled={!canProceed()}
          >
            {step === 0 ? "Let's Go! 🚀" : step === 3 ? 'Start Chatting! 💚' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function generateDefaultGoals(profile, bmi) {
  const age = parseInt(profile.age) || 30;
  const weight = parseFloat(profile.weight) || 65;
  const height = parseFloat(profile.height) || 170;
  const gender = profile.gender || 'Male';

  let bmr;
  if (gender === 'Male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  const dailyCalories = Math.round(bmr * 1.55 / 10) * 10;

  const goals = [
    { metric: 'calories', target: dailyCalories, unit: 'kcal/day', category: 'diet' },
    { metric: 'sugar', target: 50, unit: 'g/day', category: 'diet' },
    { metric: 'fat', target: Math.round(dailyCalories * 0.3 / 9), unit: 'g/day', category: 'diet' },
    { metric: 'protein', target: Math.round(weight * 0.8), unit: 'g/day', category: 'diet' },
    { metric: 'water', target: 2000, unit: 'ml/day', category: 'diet' },
    { metric: 'steps', target: 8000, unit: 'steps/day', category: 'exercise' },
  ];

  if (profile.conditions) {
    const cond = profile.conditions.toLowerCase();
    if (cond.includes('cholesterol')) {
      goals[2] = { metric: 'fat', target: 50, unit: 'g/day', category: 'diet' };
      goals.push({ metric: 'saturated_fat', target: 15, unit: 'g/day', category: 'diet' });
    }
    if (cond.includes('sugar') || cond.includes('diabet')) {
      goals[1] = { metric: 'sugar', target: 25, unit: 'g/day', category: 'diet' };
    }
    if (cond.includes('weight') || (bmi && bmi > 25)) {
      goals[0] = { metric: 'calories', target: Math.round(dailyCalories * 0.8 / 10) * 10, unit: 'kcal/day', category: 'diet' };
      goals.push({ metric: 'exercise', target: 45, unit: 'min/day', category: 'exercise' });
    }
  }

  return goals;
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy Range';
  if (bmi < 30) return 'Overweight';
  return 'Obese Range';
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
