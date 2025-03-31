# Audio Transcription App

A modern web application for transcribing audio files with real-time progress tracking and AI-powered summarization.

## Features

- 🎙️ Audio transcription using OpenAI's Whisper model
- 📝 AI-powered summarization using Mistral
- ⚡ Real-time progress updates and time estimation
- 🎯 Support for multiple audio formats (WAV, MP3, M4A, etc.)
- 📊 Detailed processing statistics
- 💅 Modern, responsive UI

## Tech Stack

### Backend
- Python 3.13+
- Flask
- OpenAI Whisper
- Mistral AI
- FFmpeg (for audio conversion)

### Frontend
- React
- Server-Sent Events (SSE) for real-time updates
- Markdown rendering
- Modern CSS with responsive design

## Setup

### Prerequisites
- Python 3.13+
- Node.js 18+
- FFmpeg
- Mistral API key

### Environment Variables
Copy `.env.example` to `.env` and fill in your Mistral API key:
```
MISTRAL_API_KEY=your-api-key-here
```

### Backend Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the backend server
cd app
python main.py
```

### Frontend Setup
```bash
# Install dependencies
cd frontend
npm install

# Start the development server
npm start
```

The app will be available at:
- Frontend: http://localhost:3001
- Backend: http://localhost:8000

## Usage

1. Open the app in your browser
2. Click the upload button or drag & drop an audio file
3. Watch real-time progress as your file is processed:
   - Transcription progress
   - Time remaining
   - Words processed
   - Current segment
4. View the results:
   - Full transcription
   - AI-generated summary
   - Processing statistics

## Development

The application is structured as follows:

```
.
├── app/
│   └── main.py           # Flask backend
├── frontend/
│   ├── public/
│   └── src/
│       ├── App.js        # Main React component
│       └── index.js      # Entry point
├── .env.example          # Environment variables template
├── requirements.txt      # Python dependencies
└── README.md            # This file
```

## License

MIT License - feel free to use this project for your own purposes.
