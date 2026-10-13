import React, { useEffect, useState } from 'react';

/**
 * Plus Character - the AI health companion.
 * Uses CSS animations to simulate GIF movements.
 * Manga-style character with different animation states.
 */
export default function PlusCharacter({ isStreaming = false }) {
  const [mood, setMood] = useState('idle');

  useEffect(() => {
    if (isStreaming) {
      setMood('talking');
    } else {
      // Cycle through idle animations
      const moods = ['idle', 'happy', 'blink', 'idle'];
      let idx = 0;
      const interval = setInterval(() => {
        setMood(moods[idx % moods.length]);
        idx++;
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isStreaming]);

  return (
    <div className={`plus-character ${mood}`}>
      <svg
        width="200"
        height="240"
        viewBox="0 0 200 240"
        xmlns="http://www.w3.org/2000/svg"
        className="plus-svg"
      >
        {/* Body - rounded shape */}
        <ellipse cx="100" cy="150" rx="65" ry="60" className="plus-body" />

        {/* Head */}
        <circle cx="100" cy="90" r="55" className="plus-head" />

        {/* Cheeks - blush marks */}
        <ellipse cx="68" cy="105" rx="12" ry="8" className="plus-cheek" />
        <ellipse cx="132" cy="105" rx="12" ry="8" className="plus-cheek" />

        {/* Eyes */}
        {mood === 'blink' ? (
          <>
            <line x1="75" y1="85" x2="88" y2="85" className="plus-eye-line" />
            <line x1="112" y1="85" x2="125" y2="85" className="plus-eye-line" />
          </>
        ) : mood === 'talking' ? (
          <>
            <circle cx="82" cy="85" r="8" className="plus-eye" />
            <circle cx="118" cy="85" r="8" className="plus-eye" />
            <circle cx="84" cy="83" r="3" className="plus-eye-shine" />
            <circle cx="120" cy="83" r="3" className="plus-eye-shine" />
          </>
        ) : (
          <>
            <circle cx="82" cy="85" r="9" className="plus-eye" />
            <circle cx="118" cy="85" r="9" className="plus-eye" />
            <circle cx="84" cy="83" r="3.5" className="plus-eye-shine" />
            <circle cx="120" cy="83" r="3.5" className="plus-eye-shine" />
          </>
        )}

        {/* Mouth */}
        {mood === 'talking' ? (
          <ellipse cx="100" cy="112" rx="10" ry="7" className="plus-mouth" />
        ) : mood === 'happy' ? (
          <path d="M 85 108 Q 100 125 115 108" className="plus-mouth-happy" />
        ) : (
          <path d="M 88 110 Q 100 120 112 110" className="plus-mouth-smile" />
        )}

        {/* Antenna / Leaf on top */}
        <line x1="100" y1="40" x2="100" y2="25" className="plus-antenna" />
        <circle cx="100" cy="22" r="8" className="plus-leaf" />

        {/* Arms */}
        <ellipse cx="35" cy="140" rx="12" ry="20" className="plus-arm" transform="rotate(-20 35 140)" />
        <ellipse cx="165" cy="140" rx="12" ry="20" className="plus-arm" transform="rotate(20 165 140)" />

        {/* Feet */}
        <ellipse cx="75" cy="210" rx="18" ry="12" className="plus-foot" />
        <ellipse cx="125" cy="210" rx="18" ry="12" className="plus-foot" />

        {/* Heart badge */}
        <text x="100" y="165" textAnchor="middle" className="plus-heart">💚</text>
      </svg>
    </div>
  );
}
