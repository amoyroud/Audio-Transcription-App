import React, { useState, useEffect } from 'react';

export const Settings = ({ isOpen, onClose, onSave }) => {
  const [mistralKey, setMistralKey] = useState('');

  useEffect(() => {
    // Load saved key when modal opens
    if (isOpen) {
      const savedKey = localStorage.getItem('mistralApiKey');
      if (savedKey) {
        setMistralKey(savedKey);
      }
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem('mistralApiKey', mistralKey);
    onSave(mistralKey);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <h2>Settings</h2>
        <div className="settings-content">
          <div className="settings-field">
            <label htmlFor="mistral-key">Mistral API Key</label>
            <input
              id="mistral-key"
              type="password"
              value={mistralKey}
              onChange={(e) => setMistralKey(e.target.value)}
              placeholder="Enter your Mistral API key"
            />
            <p className="settings-help">
              Get your API key from{' '}
              <a href="https://console.mistral.ai/api-keys/" target="_blank" rel="noopener noreferrer">
                Mistral AI Console
              </a>
            </p>
          </div>
        </div>
        <div className="settings-actions">
          <button onClick={onClose} className="cancel-button">Cancel</button>
          <button onClick={handleSave} className="save-button" disabled={!mistralKey}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}; 