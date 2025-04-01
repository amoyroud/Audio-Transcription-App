import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import './App.css';
import Settings from './components/Settings';

function App() {
  const { isAuthenticated, loginWithRedirect, logout, user, isLoading: isAuthLoading, error } = useAuth0();
  const [file, setFile] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [summary, setSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [phase, setPhase] = useState('');
  const [loadingStep, setLoadingStep] = useState('');
  const [stats, setStats] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mistralApiKey, setMistralApiKey] = useState(localStorage.getItem('mistralApiKey') || '');

  // Timer effect
  useEffect(() => {
    let timer;
    if (isLoading) {
      timer = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (error) {
      console.error('Auth0 Error:', error);
      setStatus('Authentication Error: ' + error.message);
    }
  }, [error]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    
    // Get audio duration
    if (selectedFile) {
      const audio = new Audio(URL.createObjectURL(selectedFile));
      audio.addEventListener('loadedmetadata', () => {
        setAudioDuration(audio.duration);
        // Estimate processing time (rough estimate: 2x audio duration)
        setEstimatedSeconds(audio.duration * 2);
      });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) return;

    setIsLoading(true);
    setProgress(0);
    setTranscription('');
    setSummary('');
    setStatus('');
    setPhase('');
    setLoadingStep('');
    setStats(null);
    setElapsedSeconds(0);
    setEstimatedSeconds(audioDuration * 2);

    try {
      setIsLoading(true);
      setTranscription(null);
      setSummary(null);
      setPhase('Uploading');
      setLoadingStep('Preparing file...');

      // Log all environment variables
      console.log('All env variables:', process.env);
      console.log('API URL from env:', process.env.REACT_APP_API_URL);
      
      // Force the correct API URL
      const apiUrl = 'https://api.audio.antoinemoyroud.com/upload';
      console.log('Final API URL:', apiUrl);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('mistralApiKey', mistralApiKey);

      const requestOptions = {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'X-Mistral-Api-Key': mistralApiKey,
          'Accept': 'application/json'
        }
      };
      console.log('Request options:', requestOptions);

      setPhase('Processing');
      setLoadingStep('Transcribing audio...');
      setProgress(30);

      const response = await fetch(apiUrl, requestOptions);
      console.log('Response status:', response.status);
      console.log('Response type:', response.type);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      setLoadingStep('Generating summary...');
      setProgress(70);

      const data = await response.json();
      console.log('Response data:', data);
      setTranscription(data.transcription);
      setSummary(data.summary);
      setStats(data.stats);
      setProgress(100);
      setPhase('Complete');
      setLoadingStep('Done!');
    } catch (error) {
      console.error('Error:', error);
      setStatus('Error: ' + error.message);
      setPhase('Error');
      setLoadingStep('Failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear any stored data
    localStorage.removeItem('mistralApiKey');
    setMistralApiKey('');
    setFile(null);
    setTranscription('');
    setSummary('');
    setStats(null);
    // Call Auth0 logout
    logout({ 
      logoutParams: {
        returnTo: process.env.NODE_ENV === 'production'
          ? 'https://audio.antoinemoyroud.com'
          : 'http://localhost:3001'
      }
    });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Audio Transcription App</h1>
        {isAuthLoading ? (
          <div className="loading-container">
            <p>Loading...</p>
          </div>
        ) : isAuthenticated ? (
          <>
            <div className="user-info">
              <img src={user.picture} alt={user.name} className="avatar" />
              <span>Welcome, {user.name}</span>
              <button onClick={handleLogout} className="auth-button">
                Log Out
              </button>
            </div>
            <div className="settings-container">
              <button onClick={() => setIsSettingsOpen(true)} className="settings-button">
                {mistralApiKey ? 'Update API Key' : 'Set API Key'}
              </button>
            </div>
            {!mistralApiKey ? (
              <div className="api-key-warning">
                <p>Please set your Mistral API key in Settings before uploading files.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="upload-form">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept="audio/*"
                  className="file-input"
                />
                <button type="submit" disabled={!file || isLoading} className="submit-button">
                  {isLoading ? 'Processing...' : 'Upload & Transcribe'}
                </button>
              </form>
            )}
            {isLoading && (
              <div className="loading-container">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="timer-container">
                  <p>Elapsed Time: {formatTime(elapsedSeconds)}</p>
                  <p>Estimated Time Remaining: {formatTime(Math.max(0, estimatedSeconds - elapsedSeconds))}</p>
                </div>
                <p className="status-text">{status}</p>
                <p className="phase-text">{phase}</p>
                <p className="step-text">{loadingStep}</p>
              </div>
            )}
            {transcription && (
              <div className="results-container">
                <div className="transcription-container">
                  <h2>Transcription</h2>
                  <p>{transcription}</p>
                </div>
                {summary && (
                  <div className="summary-container">
                    <h2>Summary</h2>
                    <p>{summary}</p>
                  </div>
                )}
                {stats && (
                  <div className="stats-container">
                    <h3>Statistics</h3>
                    <p>Processing Time: {stats.processing_time.toFixed(2)} seconds</p>
                    <p>Audio Duration: {stats.audio_duration.toFixed(2)} seconds</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="login-container">
            <p>Please log in to use the application</p>
            <button 
              onClick={() => loginWithRedirect({
                appState: { returnTo: window.location.pathname }
              })} 
              className="auth-button"
            >
              Log In
            </button>
          </div>
        )}
      </header>
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={mistralApiKey}
        onSave={(key) => {
          setMistralApiKey(key);
          localStorage.setItem('mistralApiKey', key);
          setIsSettingsOpen(false);
        }}
      />
    </div>
  );
}

export default App; 