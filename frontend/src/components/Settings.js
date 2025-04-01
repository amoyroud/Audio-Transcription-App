import React, { useState } from 'react';

function Settings({ isOpen, onClose, apiKey, onSave }) {
  const [key, setKey] = useState(apiKey);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(key);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Settings</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="apiKey">Mistral API Key:</label>
            <input
              type="password"
              id="apiKey"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your Mistral API key"
            />
          </div>
          <div className="button-group">
            <button type="submit" className="save-button">
              Save
            </button>
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Settings; 