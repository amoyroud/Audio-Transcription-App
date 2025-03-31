import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from './hooks/useAuth';
import { Settings } from './components/Settings';
import './App.css';

function App() {
  const { isAuthenticated, isLoading: authLoading, user, login, logout, getToken } = useAuth();
  const [file, setFile] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
  const [wordsProcessed, setWordsProcessed] = useState(0);
  const [phase, setPhase] = useState('');
  const [loadingStep, setLoadingStep] = useState('');
  const [stats, setStats] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mistralApiKey, setMistralApiKey] = useState(localStorage.getItem('mistralApiKey') || '');

  useEffect(() => {
    let timer;
    if (isLoading) {
      timer = setInterval(() => {
        setElapsedSeconds(prev => {
          const newElapsed = prev + 1;
          if (estimatedSeconds > 0) {
            const calculatedProgress = Math.min((newElapsed / estimatedSeconds) * 100, 100);
            if (calculatedProgress > progress) {
              setProgress(calculatedProgress);
            }
          }
          return newElapsed;
        });
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isLoading, estimatedSeconds, progress]);

  const formatTime = (seconds) => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)} seconds`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(1);
    return `${minutes} min ${remainingSeconds} sec`;
  };

  const formatTimeWithMillis = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 100);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const getPhaseEmoji = (phase) => {
    switch (phase) {
      case 'init': return '🚀';
      case 'loading': return '⚙️';
      case 'transcribing': return '🎙️';
      case 'summarizing': return '📝';
      default: return '⏳';
    }
  };

  const getLoadingStepEmoji = (step) => {
    switch (step) {
      case 'model': return '🧠';
      case 'audio': return '🎵';
      case 'config': return '⚡';
      case 'complete': return '✅';
      default: return '⚙️';
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFile(file);
      setTranscription('');
      setSummary('');
      setStatus('');
      setProgress(0);
      setCurrentChunk(0);
      setTotalChunks(0);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file || !isAuthenticated || !mistralApiKey) {
      if (!mistralApiKey) {
        setIsSettingsOpen(true);
      }
      return;
    }

    setIsLoading(true);
    setTranscription('');
    setSummary('');
    setProgress(0);
    setCurrentChunk(0);
    setTotalChunks(0);
    setProcessingTime(0);
    setEstimatedTimeRemaining(0);
    setWordsProcessed(0);
    setPhase('');
    setLoadingStep('');
    setStats(null);
    setAudioDuration(0);
    setEstimatedSeconds(0);
    setElapsedSeconds(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = await getToken();
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Mistral-Api-Key': mistralApiKey
        }
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lastProgressUpdate = Date.now();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setStatus(data.text);
                setPhase(data.phase || '');
                if (data.step !== undefined) {
                  setLoadingStep(data.step);
                }
                if (data.audioDuration !== undefined) {
                  setAudioDuration(data.audioDuration);
                }
                if (data.estimatedSeconds !== undefined) {
                  setEstimatedSeconds(data.estimatedSeconds);
                }
                if (data.progress !== undefined) {
                  const now = Date.now();
                  if (now - lastProgressUpdate > 1000 || Math.abs(data.progress - progress) > 2) {
                    setProgress(data.progress);
                    lastProgressUpdate = now;
                  }
                }
                if (data.currentChunk !== undefined) {
                  setCurrentChunk(data.currentChunk);
                }
                if (data.totalChunks !== undefined) {
                  setTotalChunks(data.totalChunks);
                }
                if (data.processingTime !== undefined) {
                  setProcessingTime(data.processingTime);
                }
                if (data.estimatedTimeRemaining !== undefined) {
                  setEstimatedTimeRemaining(data.estimatedTimeRemaining);
                }
                if (data.wordsProcessed !== undefined) {
                  setWordsProcessed(data.wordsProcessed);
                }
              } else if (data.type === 'result') {
                setTranscription(data.transcription || '');
                setSummary(data.summary || '');
                setStats(data.stats || null);
                setStatus('Processing complete!');
                setIsLoading(false);
              } else if (data.type === 'error') {
                setError(data.error);
                setStatus(`Error: ${data.error}`);
                setIsLoading(false);
              }
            } catch (error) {
              console.error('Error parsing server response:', error);
              setStatus('Error processing server response');
              setIsLoading(false);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setStatus(`Error: ${error.message}`);
      setIsLoading(false);
    }
  };

  const handleSettingsSave = (apiKey) => {
    setMistralApiKey(apiKey);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Audio Transcription & Summarization</h1>
        <p>Transform your audio into text and insights in minutes</p>
        
        {authLoading ? (
          <div className="auth-loading">Loading...</div>
        ) : isAuthenticated && (
          <div className="user-info">
            {user?.picture && <img src={user.picture} alt={user.name} className="avatar" />}
            <span>Welcome, {user?.name}</span>
            <button onClick={() => setIsSettingsOpen(true)} className="settings-button">
              ⚙️ Settings
            </button>
            <button onClick={logout} className="auth-button">Logout</button>
          </div>
        )}
      </header>

      <main className="content">
        {isAuthenticated ? (
          <>
            {!mistralApiKey && (
              <div className="api-key-prompt">
                <p>Please set up your Mistral API key to use the transcription service</p>
                <button onClick={() => setIsSettingsOpen(true)} className="auth-button">
                  Configure API Key
                </button>
              </div>
            )}
            
            <div className="upload-section">
              <input
                type="file"
                onChange={handleFileChange}
                accept="audio/*"
                className="file-input"
                id="file-input"
                style={{ display: 'none' }}
              />
              <label htmlFor="file-input" className="choose-file-button">
                {file ? '✓ ' + file.name : '📁 Choose Audio File'}
              </label>
              <button 
                onClick={handleSubmit}
                disabled={!file || isLoading || !mistralApiKey}
                className="upload-button"
              >
                {isLoading ? 'Processing...' : 'Upload & Process'}
              </button>
            </div>

            {isLoading && (
              <div className="progress-section">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="status">
                  {getPhaseEmoji(phase)} {status}
                  {loadingStep && ` ${getLoadingStepEmoji(loadingStep)}`}
                </div>
                {estimatedSeconds > 0 && (
                  <div className="time-estimate">
                    Elapsed: {formatTime(elapsedSeconds)} / Estimated: {formatTime(estimatedSeconds)}
                  </div>
                )}
              </div>
            )}

            {(transcription || summary) && (
              <div className="results-section">
                {transcription && (
                  <div className="transcription">
                    <h2>Transcription</h2>
                    <div className="text-content">
                      <ReactMarkdown>{transcription}</ReactMarkdown>
                    </div>
                  </div>
                )}
                
                {summary && (
                  <div className="summary">
                    <h2>Summary</h2>
                    <div className="text-content">
                      <ReactMarkdown>{summary}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {stats && (
                  <div className="stats">
                    <h3>Processing Stats</h3>
                    <ul>
                      <li>Audio Duration: {formatTimeWithMillis(audioDuration)}</li>
                      <li>Words Processed: {wordsProcessed}</li>
                      <li>Processing Time: {formatTime(elapsedSeconds)}</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        ) : !authLoading && (
          <div className="login-prompt">
            <p>Please login to use the transcription service</p>
            <button onClick={login} className="auth-button">Login to Start</button>
          </div>
        )}
      </main>

      <Settings 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSettingsSave}
      />
    </div>
  );
}

export default App; 