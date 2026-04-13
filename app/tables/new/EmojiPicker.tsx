'use client';

import { useState } from 'react';

export function EmojiPicker() {
  const [selectedEmoji, setSelectedEmoji] = useState('📊');

  const emojis = ['📊', '📁', '📝', '🗂️', '📋', '🏢', '👥', '💼', '🛒', '📦', '🎯', '✅', '🎨', '🔧', '💡', '🚀'];

  return (
    <div>
      <label htmlFor="icon" className="block text-sm font-medium text-gray-700 mb-2">
        Icon (Emoji)
      </label>
      <div className="flex items-center space-x-4">
        <input
          type="text"
          id="icon"
          name="icon"
          value={selectedEmoji}
          onChange={(e) => setSelectedEmoji(e.target.value)}
          maxLength={2}
          className="w-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-3xl text-center"
        />
        <div className="flex-1">
          <p className="text-sm text-gray-600">Choose an emoji to represent your table</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setSelectedEmoji(emoji)}
                className="text-2xl hover:bg-gray-100 rounded p-2 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}