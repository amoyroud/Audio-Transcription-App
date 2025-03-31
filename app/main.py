from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import os
import tempfile
from transformers import pipeline
import torch
from openai import OpenAI
from dotenv import load_dotenv
import logging
import httpx
import subprocess
import json
import time
import math

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
CORS(app)

logger.info("Starting server initialization...")

def init_whisper():
    """Initialize the Whisper model"""
    try:
        logger.info("Initializing Whisper model...")
        # Use a pipeline as a high-level helper
        pipe = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-tiny",
            device="cpu"
        )
        logger.info("Whisper model initialized successfully")
        return pipe
    except Exception as e:
        logger.error(f"Error initializing Whisper model: {str(e)}")
        raise

# Initialize the transcription pipeline
pipe = init_whisper()

# Initialize Mistral client
logger.info("Initializing Mistral client...")
try:
    http_client = httpx.Client(
        base_url="https://api.mistral.ai/v1",
        headers={"Authorization": f"Bearer {os.getenv('MISTRAL_API_KEY')}"}
    )
    client = OpenAI(
        api_key=os.getenv("MISTRAL_API_KEY"),
        base_url="https://api.mistral.ai/v1",
        http_client=http_client
    )
    logger.info("Mistral client initialized successfully")
except Exception as e:
    logger.error(f"Error initializing Mistral client: {str(e)}")
    raise

@app.route('/upload', methods=['POST'])
def upload_file():
    logger.info("Received file upload request")
    if 'file' not in request.files:
        logger.error("No file part in request")
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if not file.filename.endswith(('.mp3', '.wav', '.m4a')):
        logger.error(f"Invalid file type: {file.filename}")
        return jsonify({'error': 'Only audio files are allowed'}), 400
    
    try:
        start_time = time.time()
        logger.info(f"Processing file: {file.filename}")
        
        # Create a temporary file to store the uploaded audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
            file.save(temp_file.name)
            temp_file_path = temp_file.name
            logger.info(f"File saved temporarily at: {temp_file_path}")

        # Convert M4A to WAV if necessary
        if file.filename.endswith('.m4a'):
            logger.info("Converting M4A to WAV format...")
            wav_path = temp_file_path.replace('.m4a', '.wav')
            conversion_start = time.time()
            subprocess.run([
                'ffmpeg', '-i', temp_file_path,
                '-acodec', 'pcm_s16le',
                '-ar', '44100',
                '-ac', '2',
                wav_path
            ], check=True)
            conversion_time = time.time() - conversion_start
            logger.info(f"M4A to WAV conversion completed in {conversion_time:.2f} seconds")
            temp_file_path = wav_path

        logger.info("Starting transcription...")
        transcription_start = time.time()
        
        def generate():
            try:
                # Send initial progress update
                yield f"data: {json.dumps({'type': 'progress', 'text': 'Initializing transcription process...', 'phase': 'init'})}\n\n"
                
                # Detailed loading progress updates
                yield f"data: {json.dumps({'type': 'progress', 'text': 'Loading Whisper model into memory...', 'phase': 'loading', 'step': 'model'})}\n\n"
                
                # Get audio duration using ffprobe
                duration_cmd = f"ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 {temp_file_path}"
                audio_duration = float(subprocess.check_output(duration_cmd.split()).decode().strip())
                
                # Calculate estimated processing time
                chunk_size_seconds = 15  # chunk length in seconds
                batch_size = 16
                total_chunks = math.ceil(audio_duration / chunk_size_seconds)
                total_batches = math.ceil(total_chunks / batch_size)
                
                # Based on performance metrics, each batch takes ~20 seconds to process
                seconds_per_batch = 20
                estimated_seconds = total_batches * seconds_per_batch
                
                # Add a small buffer for initialization and summary generation
                estimated_seconds += 10
                
                # Log audio preparation with duration info
                yield f"data: {json.dumps({
                    'type': 'progress', 
                    'text': f'Preparing audio for processing (duration: {formatTime(audio_duration)})...', 
                    'phase': 'loading', 
                    'step': 'audio',
                    'audioDuration': audio_duration
                })}\n\n"
                
                # Log model configuration with time estimate
                yield f"data: {json.dumps({
                    'type': 'progress', 
                    'text': f'Configuring model parameters (chunk size: {chunk_size_seconds}s, batch size: {batch_size}, total chunks: {total_chunks}, batches: {total_batches}, estimated time: {formatTime(estimated_seconds)})...', 
                    'phase': 'loading', 
                    'step': 'config',
                    'estimatedSeconds': estimated_seconds,
                    'batchProcessingTime': seconds_per_batch  # Time per batch of audio
                })}\n\n"
                
                logger.info(f"Starting Whisper pipeline processing (estimated time: {formatTime(estimated_seconds)})")
                outputs = pipe(
                    temp_file_path,
                    chunk_length_s=chunk_size_seconds,
                    batch_size=batch_size,
                    return_timestamps=True,
                )
                
                # Log completion of loading phase
                yield f"data: {json.dumps({'type': 'progress', 'text': 'Model and audio preparation complete. Starting transcription...', 'phase': 'loading', 'step': 'complete'})}\n\n"
                
                logger.info("Whisper pipeline processing completed")
                
                # Process the chunks and send updates
                total_chunks = len(outputs["chunks"])
                logger.info(f"Processing {total_chunks} chunks...")
                chunk_start_time = time.time()
                accumulated_text = ""
                
                for i, chunk in enumerate(outputs["chunks"], 1):
                    progress = (i / total_chunks) * 100
                    current_time = time.time() - chunk_start_time
                    avg_time_per_chunk = current_time / i
                    estimated_remaining = avg_time_per_chunk * (total_chunks - i)
                    
                    # Only accumulate text for non-empty chunks
                    if chunk["text"].strip():
                        accumulated_text += chunk["text"] + " "
                    
                    words_processed = len(accumulated_text.split())
                    
                    status_text = (
                        f"Transcribing audio... \n"
                        f"Words processed: {words_processed}\n"
                        f"Current segment: {chunk['text'].strip() or '(silence)'}"
                    )
                    
                    logger.info(f"Processing chunk {i}/{total_chunks} ({progress:.1f}%) - {status_text}")
                    yield f"data: {json.dumps({
                        'type': 'progress',
                        'text': status_text,
                        'progress': progress,
                        'currentChunk': i,
                        'totalChunks': total_chunks,
                        'processingTime': current_time,
                        'estimatedTimeRemaining': estimated_remaining,
                        'wordsProcessed': words_processed,
                        'phase': 'transcribing'
                    })}\n\n"
                
                transcription_time = time.time() - transcription_start
                logger.info(f"Transcription completed in {transcription_time:.2f} seconds")
                
                # Clean up the temporary files
                os.unlink(temp_file_path)
                if file.filename.endswith('.m4a'):
                    os.unlink(temp_file_path.replace('.wav', '.m4a'))
                logger.info("Temporary files cleaned up")

                # Prepare the transcription result
                transcription = {
                    "text": outputs["text"],
                    "chunks": outputs["chunks"]
                }

                logger.info("Starting summary generation...")
                summary_start = time.time()
                # Send progress update for summary generation
                yield f"data: {json.dumps({
                    'type': 'progress', 
                    'text': 'Analyzing transcription and generating summary...',
                    'phase': 'summarizing'
                })}\n\n"
                
                # Generate summary using Mistral
                summary = client.chat.completions.create(
                    model="mistral-large-latest",
                    messages=[
                        {"role": "system", "content": "You are a professional assistant that creates concise meeting notes and summaries from transcriptions. Focus on key points, action items, and important decisions."},
                        {"role": "user", "content": f"Please summarize this transcription:\n\n{transcription['text']}"}
                    ],
                    temperature=0.7,
                    max_tokens=500
                )
                summary_time = time.time() - summary_start
                logger.info(f"Summary generated in {summary_time:.2f} seconds")

                total_time = time.time() - start_time
                logger.info(f"Total processing time: {total_time:.2f} seconds")

                # Send final result with timing information
                yield f"data: {json.dumps({
                    'type': 'result', 
                    'transcription': transcription['text'], 
                    'summary': summary.choices[0].message.content,
                    'stats': {
                        'transcriptionTime': transcription_time,
                        'summaryTime': summary_time,
                        'totalTime': total_time,
                        'totalWords': len(transcription['text'].split())
                    }
                })}\n\n"
                
            except Exception as e:
                logger.error(f"Error in generate function: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                raise

        return Response(generate(), mimetype='text/event-stream')

    except Exception as e:
        logger.error(f"Error processing file: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health_check():
    logger.info("Health check requested")
    return jsonify({'status': 'healthy'})

def formatTime(seconds):
    """Format seconds into a human-readable string."""
    if seconds < 60:
        return f"{seconds:.1f} seconds"
    minutes = int(seconds // 60)
    remaining_seconds = seconds % 60
    if minutes < 60:
        return f"{minutes} min {remaining_seconds:.1f} sec"
    hours = int(minutes // 60)
    remaining_minutes = minutes % 60
    return f"{hours} hr {remaining_minutes} min {remaining_seconds:.1f} sec"

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(port=8000, debug=True) 