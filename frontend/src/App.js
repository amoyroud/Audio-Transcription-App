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
  const [totalChunks, setTotalChunks] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);

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

  const calculateWhisperChunks = (durationInSeconds) => {
    // Whisper processes 30-second chunks with 1-second overlap
    const chunkSize = 30;
    const overlap = 1;
    const effectiveChunkSize = chunkSize - overlap;
    return Math.ceil(durationInSeconds / effectiveChunkSize);
  };

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    
    // Get audio duration and calculate chunks
    if (selectedFile) {
      const audio = new Audio(URL.createObjectURL(selectedFile));
      audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration;
        setAudioDuration(duration);
        const chunks = calculateWhisperChunks(duration);
        setTotalChunks(chunks);
        // Estimate processing time (approximately 2 seconds per chunk plus overhead)
        setEstimatedSeconds(chunks * 2 + 10);
      });
    }
  };

  const preprocessAudio = async (file) => {
    return new Promise((resolve, reject) => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const audioBuffer = await audioContext.decodeAudioData(e.target.result);
          
          // Create offline context for processing
          const offlineContext = new OfflineAudioContext(
            1, // mono
            audioBuffer.duration * 16000, // 16kHz sample rate
            16000
          );

          // Create source and connect to offline context
          const source = offlineContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(offlineContext.destination);

          // Process audio
          const renderedBuffer = await offlineContext.startRendering();
          
          // Convert to WAV
          const wavBlob = await audioBufferToWav(renderedBuffer);
          resolve(wavBlob);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const audioBufferToWav = (buffer) => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const wav = new ArrayBuffer(44 + buffer.length * bytesPerSample);
    const view = new DataView(wav);

    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * bytesPerSample, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * bytesPerSample, true);

    // Write audio data
    const data = new Float32Array(buffer.length);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }

    return new Blob([wav], { type: 'audio/wav' });
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
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
    setCurrentChunk(0);

    try {
      setPhase('Preprocessing');
      setLoadingStep('Optimizing audio format...');
      setProgress(5);

      // Preprocess audio before upload
      const optimizedAudio = await preprocessAudio(file);
      console.log('Audio preprocessing complete');
      console.log('Optimized audio size:', optimizedAudio.size, 'bytes');

      setPhase('Uploading');
      setLoadingStep('Preparing file...');
      setProgress(10);

      const apiUrl = 'https://api.audio.antoinemoyroud.com/upload';
      const formData = new FormData();
      formData.append('file', optimizedAudio, 'optimized.wav');
      formData.append('mistralApiKey', mistralApiKey);

      // Log form data size
      console.log('Form data entries:');
      for (let pair of formData.entries()) {
        console.log(pair[0], pair[1] instanceof File ? pair[1].size + ' bytes' : pair[1]);
      }

      const requestOptions = {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'X-Mistral-Api-Key': mistralApiKey,
          'Accept': 'application/json'
        },
        // Add timeout and keep-alive settings
        signal: AbortSignal.timeout(300000), // 5 minute timeout
        keepalive: true,
        // Add additional options for better HTTP/2 handling
        duplex: 'half',
        cache: 'no-store'
      };
      console.log('Request options:', requestOptions);

      setPhase('Processing');
      setLoadingStep('Transcribing audio...');
      
      // Calculate progress based on estimated chunk processing
      const updateProgress = () => {
        if (currentChunk < totalChunks) {
          const chunkProgress = (currentChunk / totalChunks) * 70; // 70% of progress bar for transcription
          setProgress(Math.min(10 + chunkProgress, 75)); // Start at 10%, max at 75%
          setCurrentChunk(prev => prev + 1);
        }
      };

      // Start progress updates
      const progressInterval = setInterval(updateProgress, (estimatedSeconds * 1000) / totalChunks);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

        const response = await fetch(apiUrl, {
          ...requestOptions,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        clearInterval(progressInterval);

        console.log('Response status:', response.status);
        console.log('Response type:', response.type);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        setLoadingStep('Generating summary...');
        setProgress(85);

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
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Add more specific error handling
        if (error.name === 'AbortError') {
          setStatus('Error: Upload timed out after 5 minutes. Please try again with a smaller file.');
        } else if (error.message.includes('ERR_HTTP2_PROTOCOL_ERROR')) {
          setStatus('Error: Connection issue detected. Please try again or contact support if the issue persists.');
        } else {
          setStatus('Error: ' + error.message);
        }
        
        setPhase('Error');
        setLoadingStep('Failed');
      } finally {
        setIsLoading(false);
      }
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
                  <p>Elapsed: {formatTime(elapsedSeconds)}</p>
                  <p>Estimated: {formatTime(estimatedSeconds)}</p>
                </div>
                <p className="status-text">{status}</p>
                <p className="phase-text">{phase}</p>
                <p className="step-text">{loadingStep}</p>
                {totalChunks > 0 && (
                  <p className="chunk-text">Processing chunk {currentChunk} of {totalChunks}</p>
                )}
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