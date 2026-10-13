import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChatPage from './components/ChatPage.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import OnboardingPage from './components/OnboardingPage.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useUserData } from './hooks/useUserData.js';

const STORAGE_KEY = 'aihed_user_id';

export default function App() {
  const [userId, setUserId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || generateUserId();
  });
  const [currentPage, setCurrentPage] = useState('chat');
  const [hasProfile, setHasProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Save userId to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, userId);
  }, [userId]);

  // WebSocket connection
  const ws = useWebSocket(userId);

  // User data management
  const { userData, updateProfile, setGoals, refreshProgress, refreshHistory } = useUserData(userId);

  // Check if user has a profile set up
  useEffect(() => {
    if (userData && userData.profile && userData.profile.age) {
      setHasProfile(true);
    } else {
      setHasProfile(false);
      setShowOnboarding(true);
    }
  }, [userData]);

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  const handleProfileComplete = async (profile, goals) => {
    await updateProfile(profile);
    if (goals && goals.length > 0) {
      await setGoals(goals);
    }
    setHasProfile(true);
    setShowOnboarding(false);
    setCurrentPage('chat');
  };

  if (showOnboarding && !hasProfile) {
    return <OnboardingPage onComplete={handleProfileComplete} userId={userId} />;
  }

  return (
    <div className="app-container">
      <nav className="app-nav">
        <div className="nav-brand">
          <span className="nav-logo">💚</span>
          <span className="nav-title">Healthier Every Day</span>
        </div>
        <div className="nav-links">
          <button
            className={`nav-link ${currentPage === 'chat' ? 'active' : ''}`}
            onClick={() => handleNavigate('chat')}
          >
            Chat
          </button>
          <button
            className={`nav-link ${currentPage === 'profile' ? 'active' : ''}`}
            onClick={() => handleNavigate('profile')}
          >
            Profile
          </button>
        </div>
      </nav>

      <main className="app-main">
        {currentPage === 'chat' && (
          <ChatPage
            ws={ws}
            userId={userId}
            userData={userData}
            onNavigate={handleNavigate}
          />
        )}
        {currentPage === 'profile' && (
          <ProfilePage
            userId={userId}
            userData={userData}
            onNavigate={handleNavigate}
            onProfileUpdate={async (profile, goals) => {
              await updateProfile(profile);
              if (goals) await setGoals(goals);
              refreshProgress();
            }}
            refreshProgress={refreshProgress}
          />
        )}
      </main>
    </div>
  );
}

function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}
