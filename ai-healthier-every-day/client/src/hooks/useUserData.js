import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export function useUserData(userId) {
  const [userData, setUserData] = useState(null);
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/user/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
      }
    } catch (e) {
      console.error('[UserData] Fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refreshProgress = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/user/${userId}/progress`);
      if (res.ok) {
        const data = await res.json();
        setProgress(data);
      }
    } catch (e) {
      console.error('[UserData] Progress fetch failed:', e);
    }
  }, [userId]);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/user/${userId}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error('[UserData] History fetch failed:', e);
    }
  }, [userId]);

  const updateProfile = useCallback(async (profile) => {
    try {
      const res = await fetch(`${API_BASE}/user/${userId}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        await fetchUserData();
        return true;
      }
    } catch (e) {
      console.error('[UserData] Profile update failed:', e);
    }
    return false;
  }, [userId, fetchUserData]);

  const setGoals = useCallback(async (goals) => {
    try {
      const res = await fetch(`${API_BASE}/user/${userId}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals }),
      });
      if (res.ok) {
        await fetchUserData();
        return true;
      }
    } catch (e) {
      console.error('[UserData] Goals update failed:', e);
    }
    return false;
  }, [userId, fetchUserData]);

  useEffect(() => {
    fetchUserData();
    refreshProgress();
    refreshHistory();
  }, [fetchUserData, refreshProgress, refreshHistory]);

  // Refresh progress every 30 seconds
  useEffect(() => {
    const interval = setInterval(refreshProgress, 30000);
    return () => clearInterval(interval);
  }, [refreshProgress]);

  return {
    userData,
    progress,
    history,
    loading,
    updateProfile,
    setGoals,
    refreshProgress,
    refreshHistory,
    fetchUserData,
  };
}
