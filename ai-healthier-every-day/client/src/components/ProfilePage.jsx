import React, { useState, useEffect } from 'react';
import ProgressTracker from './ProgressTracker.jsx';
import GoalCard from './GoalCard.jsx';

export default function ProfilePage({ userId, userData, onNavigate, onProfileUpdate, refreshProgress }) {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({
    age: '',
    height: '',
    weight: '',
    gender: '',
    conditions: '',
  });
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    if (userData) {
      setProfile({
        age: userData.profile?.age || '',
        height: userData.profile?.height || '',
        weight: userData.profile?.weight || '',
        gender: userData.profile?.gender || '',
        conditions: userData.profile?.conditions || '',
      });
      setGoals(userData.goals || []);
    }
  }, [userData]);

  const handleSave = async () => {
    // Auto-generate goals if profile changed significantly
    const bmi = profile.height && profile.weight
      ? (profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)
      : null;

    let generatedGoals = [...goals];

    // If goals are empty or profile is new, generate default goals
    if (generatedGoals.length === 0 || (editing && profile.conditions !== userData.profile?.conditions)) {
      generatedGoals = generateDefaultGoals(profile, bmi);
    }

    await onProfileUpdate(profile, generatedGoals);
    setEditing(false);
    refreshProgress();
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>Your Health Profile</h1>
        <button
          className={`btn ${editing ? 'btn-save' : 'btn-edit'}`}
          onClick={() => editing ? handleSave() : setEditing(true)}
        >
          {editing ? '✓ Save' : '✎ Edit'}
        </button>
      </div>

      {/* Basic Info Section */}
      <div className="profile-section">
        <h2>Basic Information</h2>
        <div className="profile-grid">
          <div className="profile-field">
            <label>Age</label>
            {editing ? (
              <input
                type="number"
                value={profile.age}
                onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                placeholder="e.g., 28"
              />
            ) : (
              <span className="field-value">{profile.age || 'Not set'} {profile.age && 'years'}</span>
            )}
          </div>

          <div className="profile-field">
            <label>Height</label>
            {editing ? (
              <input
                type="number"
                value={profile.height}
                onChange={(e) => setProfile({ ...profile, height: e.target.value })}
                placeholder="e.g., 170 (cm)"
              />
            ) : (
              <span className="field-value">{profile.height ? `${profile.height} cm` : 'Not set'}</span>
            )}
          </div>

          <div className="profile-field">
            <label>Weight</label>
            {editing ? (
              <input
                type="number"
                value={profile.weight}
                onChange={(e) => setProfile({ ...profile, weight: e.target.value })}
                placeholder="e.g., 65 (kg)"
              />
            ) : (
              <span className="field-value">{profile.weight ? `${profile.weight} kg` : 'Not set'}</span>
            )}
          </div>

          <div className="profile-field">
            <label>Gender</label>
            {editing ? (
              <select
                value={profile.gender}
                onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            ) : (
              <span className="field-value">{profile.gender || 'Not set'}</span>
            )}
          </div>
        </div>

        {profile.height && profile.weight && (
          <div className="bmi-display">
            <span className="bmi-label">BMI</span>
            <span className="bmi-value">
              {(profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)}
            </span>
            <span className="bmi-category">
              {getBMICategory(profile.weight / Math.pow(profile.height / 100, 2))}
            </span>
          </div>
        )}
      </div>

      {/* Health Conditions Section */}
      <div className="profile-section">
        <h2>Health Conditions (Optional)</h2>
        <div className="profile-field full-width">
          {editing ? (
            <textarea
              value={profile.conditions}
              onChange={(e) => setProfile({ ...profile, conditions: e.target.value })}
              placeholder="e.g., high cholesterol, prediabetes, or 'I want to control my sugar intake'"
              rows={3}
            />
          ) : (
            <span className="field-value">
              {profile.conditions || 'No health conditions specified. You can add them to get personalized advice.'}
            </span>
          )}
        </div>
      </div>

      {/* Health Goals Section */}
      <div className="profile-section">
        <h2>Health Goals & Daily Targets</h2>
        <div className="goals-grid">
          {goals.length === 0 ? (
            <div className="goals-empty">
              <p>No goals set yet. Save your profile to auto-generate health targets!</p>
            </div>
          ) : (
            goals.map((goal, idx) => (
              <GoalCard key={idx} goal={goal} />
            ))
          )}
        </div>
      </div>

      {/* Daily Progress Section */}
      <ProgressTracker userId={userId} />

      {/* Long-term Memory Section */}
      {userData?.longTermMemory && userData.longTermMemory.length > 0 && (
        <div className="profile-section">
          <h2>What Plus Remembers About You</h2>
          <div className="memory-list">
            {userData.longTermMemory.map((mem, idx) => (
              <div key={idx} className="memory-item">
                <span className="memory-key">{formatKey(mem.key)}</span>
                <span className="memory-value">{mem.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="profile-footer">
        <button className="btn btn-primary" onClick={() => onNavigate('chat')}>
          💬 Back to Chat
        </button>
      </div>
    </div>
  );
}

function generateDefaultGoals(profile, bmi) {
  const age = parseInt(profile.age) || 30;
  const weight = parseFloat(profile.weight) || 65;
  const height = parseFloat(profile.height) || 170;
  const gender = profile.gender || 'Male';

  // Basal Metabolic Rate (BMR) - Mifflin-St Jeor Equation
  let bmr;
  if (gender === 'Male') {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  }

  // Moderate activity factor
  const dailyCalories = Math.round(bmr * 1.55 / 10) * 10;

  const goals = [
    { metric: 'calories', target: dailyCalories, unit: 'kcal/day', category: 'diet' },
    { metric: 'sugar', target: 50, unit: 'g/day', category: 'diet' },
    { metric: 'fat', target: Math.round(dailyCalories * 0.3 / 9), unit: 'g/day', category: 'diet' },
    { metric: 'protein', target: Math.round(weight * 0.8), unit: 'g/day', category: 'diet' },
    { metric: 'water', target: 2000, unit: 'ml/day', category: 'diet' },
    { metric: 'steps', target: 8000, unit: 'steps/day', category: 'exercise' },
  ];

  // Adjust based on conditions
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
  if (bmi < 18.5) return '(Underweight)';
  if (bmi < 25) return '(Healthy)';
  if (bmi < 30) return '(Overweight)';
  return '(Obese)';
}

function formatKey(key) {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
