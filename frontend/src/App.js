import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
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

  useEffect(() => {
    let timer;
    if (isLoading) {
      timer = setInterval(() => {
        setElapsedSeconds(prev => {
          const newElapsed = prev + 1;
          // Calculate progress based on elapsed time if we have estimated time
          if (estimatedSeconds > 0) {
            const calculatedProgress = Math.min((newElapsed / estimatedSeconds) * 100, 100);
            // Only update progress if server hasn't sent a more accurate value
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
    if (!file) return;

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
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
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
                  // Only update progress if it's been more than 1 second since last update
                  // or if the progress is significantly different
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

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo">
          <span className="logo-icon">🎙️</span>
          <span className="logo-text">Whispr</span>
        </div>
      </nav>

      <main className="main-content">
        <div className="hero-section">
          <h1>Audio Transcription & Summarization</h1>
          <p className="subtitle">Transform your audio into text and insights in minutes</p>
          
          <div className="upload-container">
            <form onSubmit={handleSubmit} className="upload-form">
              <div className="file-input-wrapper">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".mp3,.wav,.m4a"
                  id="file-upload"
                  className="file-input"
                />
                <label htmlFor="file-upload" className="file-label">
                  <span className="upload-icon">📁</span>
                  {file ? file.name : 'Choose Audio File'}
                </label>
              </div>
              <button 
                type="submit" 
                className="upload-button"
                disabled={!file || isLoading}
              >
                {isLoading ? 'Processing...' : 'Upload & Process'}
              </button>
            </form>
          </div>

          {isLoading && (
            <div className="processing-container">
              <div className="processing-header">
                <div className="spinner-container">
                  <div className="spinner"></div>
                  <div className="timer">{formatTimeWithMillis(elapsedSeconds)}</div>
                </div>
                
                {estimatedSeconds > 0 && (
                  <div className="estimate-info">
                    <div className="estimate-row">
                      <span className="estimate-label">🎵 Audio Length:</span>
                      <span className="estimate-value">{formatTime(audioDuration)}</span>
                    </div>
                    <div className="estimate-row">
                      <span className="estimate-label">⏳ Est. Time:</span>
                      <span className="estimate-value">{formatTime(estimatedSeconds)}</span>
                    </div>
                    <div className="progress-percentage">
                      {progress.toFixed(1)}% Complete
                    </div>
                  </div>
                )}
              </div>

              <div className="progress-section">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <div className="progress-details">
                  <div className="status-line">
                    {getPhaseEmoji(phase)} {status}
                  </div>
                  {phase === 'loading' && loadingStep && (
                    <div className="loading-steps">
                      {getLoadingStepEmoji(loadingStep)} {loadingStep}
                    </div>
                  )}
                  {totalChunks > 0 && (
                    <div className="chunk-info">
                      <span>Chunk {currentChunk}/{totalChunks}</span>
                      <span>{wordsProcessed} words</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {stats && (
            <div className="results-container">
              <div className="stats-section">
                <h2>Processing Statistics</h2>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-label">Total Time</span>
                    <span className="stat-value">{formatTime(stats.totalTime)}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Transcription</span>
                    <span className="stat-value">{formatTime(stats.transcriptionTime)}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Summary</span>
                    <span className="stat-value">{formatTime(stats.summaryTime)}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Words</span>
                    <span className="stat-value">{stats.totalWords}</span>
                  </div>
                </div>
              </div>

              <div className="output-section">
                <div className="transcription-container">
                  <h2>Transcription</h2>
                  <div className="transcription-content">
                    {transcription}
                  </div>
                </div>

                <div className="summary-container">
                  <h2>Summary</h2>
                  <div className="summary-content">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        .app-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #f5f7fa 0%, #e4e7eb 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .navbar {
          background: white;
          padding: 1rem 2rem;
          display: flex;
          justify-content: flex-start;
          align-items: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.5rem;
          font-weight: 700;
        }

        .logo-icon {
          font-size: 1.8rem;
        }

        .logo-text {
          color: #1a202c;
        }

        .main-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .hero-section {
          text-align: center;
          padding: 3rem 0;
        }

        .hero-section h1 {
          font-size: 2.5rem;
          color: #1a202c;
          margin-bottom: 1rem;
        }

        .subtitle {
          font-size: 1.2rem;
          color: #4a5568;
          margin-bottom: 3rem;
        }

        .upload-container {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          margin-bottom: 2rem;
        }

        .upload-form {
          display: flex;
          gap: 1rem;
          justify-content: center;
          align-items: center;
        }

        .file-input-wrapper {
          position: relative;
          flex: 1;
          max-width: 400px;
        }

        .file-input {
          display: none;
        }

        .file-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: #f7fafc;
          border: 2px dashed #cbd5e0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .file-label:hover {
          border-color: #4CAF50;
          background: #f0fff4;
        }

        .upload-button {
          padding: 0.75rem 1.5rem;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .upload-button:hover {
          background: #45a049;
        }

        .upload-button:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .processing-container {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          margin-top: 2rem;
        }

        .processing-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          gap: 2rem;
        }

        .spinner-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          min-width: 200px;
        }

        .spinner {
          width: 60px;
          height: 60px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #4CAF50;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .timer {
          font-family: 'JetBrains Mono', monospace;
          font-size: 2rem;
          font-weight: 700;
          color: #4CAF50;
          text-align: center;
        }

        .estimate-info {
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 8px;
          flex: 1;
          min-width: 300px;
        }

        .estimate-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.75rem;
          font-size: 1.1rem;
        }

        .estimate-label {
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .estimate-value {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          color: #1e293b;
        }

        .progress-percentage {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.75rem;
          font-weight: 700;
          color: #4CAF50;
          margin-top: 1.25rem;
          text-align: center;
        }

        .progress-section {
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 8px;
        }

        .progress-bar {
          height: 8px;
          background: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 1rem;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50 0%, #8BC34A 100%);
          transition: width 0.3s ease;
        }

        .progress-details {
          color: #4a5568;
        }

        .status-line {
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
        }

        .loading-steps {
          font-size: 0.9rem;
          color: #718096;
          margin-bottom: 0.5rem;
        }

        .chunk-info {
          display: flex;
          justify-content: space-between;
          font-size: 0.9rem;
          color: #718096;
        }

        .results-container {
          margin-top: 2rem;
        }

        .stats-section {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          margin-bottom: 2rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 1.5rem;
        }

        .stat-card {
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .stat-label {
          color: #64748b;
          font-size: 0.9rem;
        }

        .stat-value {
          color: #1e293b;
          font-size: 1.2rem;
          font-weight: 600;
        }

        .output-section {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
        }

        .transcription-container,
        .summary-container {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .transcription-content,
        .summary-content {
          margin-top: 1rem;
          line-height: 1.6;
          color: #4a5568;
          text-align: left;
        }

        .summary-content p {
          margin-bottom: 1rem;
        }

        .summary-content ul, 
        .summary-content ol {
          margin-left: 1.5rem;
          margin-bottom: 1rem;
        }

        .summary-content li {
          margin-bottom: 0.5rem;
        }

        .summary-content h1,
        .summary-content h2,
        .summary-content h3,
        .summary-content h4 {
          margin-top: 1.5rem;
          margin-bottom: 1rem;
          color: #1a202c;
          font-weight: 600;
        }

        .summary-content code {
          background: #f1f5f9;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.9em;
        }

        .summary-content pre {
          background: #f1f5f9;
          padding: 1rem;
          border-radius: 8px;
          overflow-x: auto;
          margin: 1rem 0;
        }

        .summary-content blockquote {
          border-left: 4px solid #4CAF50;
          padding-left: 1rem;
          margin: 1rem 0;
          color: #64748b;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (min-width: 768px) {
          .output-section {
            grid-template-columns: 3fr 2fr;
          }
        }
      `}</style>
    </div>
  );
}

export default App; 