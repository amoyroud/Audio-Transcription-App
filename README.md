# Audio Transcription & Summarization UI

A modern web application that allows you to transcribe audio files and generate summaries using AI.

## Features

- Drag and drop audio file upload
- Real-time transcription using Whisper
- AI-powered conversation summarization
- Modern, responsive UI
- Support for multiple audio formats (MP3, WAV, M4A)

## Prerequisites

- Python 3.8+
- Node.js 16+
- OpenAI API key

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
```

4. Create a `.env` file in the root directory with your OpenAI API key:
```
OPENAI_API_KEY=your_api_key_here
```

## Running the Application

1. Start the backend server:
```bash
uvicorn app.main:app --reload
```

2. In a new terminal, start the frontend development server:
```bash
cd frontend
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Drag and drop an audio file onto the upload area or click to select a file
2. Wait for the transcription and summarization to complete
3. View the full transcription and AI-generated summary in the tabs below

## Technical Details

- Backend: FastAPI with Whisper for transcription and OpenAI for summarization
- Frontend: React with TypeScript, Chakra UI for components
- File handling: Temporary file storage for processing
- API: RESTful endpoints for file upload and processing

## License

MIT License
