import { Ai } from '@cloudflare/ai';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// Initialize AI binding in the request context
app.use('/*', async (c, next) => {
  c.ai = new Ai(c.env.AI);
  await next();
});

// CORS configuration
app.use('/*', cors({
  origin: ['https://audio.antoinemoyroud.com', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Mistral-Api-Key', 'Origin', 'Accept'],
  exposeHeaders: ['Content-Type', 'Access-Control-Allow-Origin'],
  maxAge: 86400,
  credentials: true
}));

// Request logging middleware
app.use('/*', async (c, next) => {
  console.log('Incoming request:', {
    method: c.req.method,
    url: c.req.url,
    headers: Object.fromEntries(c.req.headers.entries()),
    origin: c.req.header('Origin')
  });
  await next();
});

// Handle OPTIONS requests explicitly
app.options('/*', async (c) => {
  console.log('Handling OPTIONS request');
  return c.json({ success: true });
});

// Health check endpoint
app.get('/', (c) => c.json({ status: 'ok' }));

// Helper function to split audio into chunks
const splitAudioIntoChunks = (audioData, chunkSize = 30, overlap = 1) => {
  const sampleRate = 16000; // 16kHz
  const samplesPerChunk = chunkSize * sampleRate;
  const overlapSamples = overlap * sampleRate;
  const chunks = [];
  
  for (let i = 0; i < audioData.length; i += samplesPerChunk - overlapSamples) {
    chunks.push(audioData.slice(i, i + samplesPerChunk));
  }
  
  return chunks;
};

// Helper function to process a single chunk
const processChunk = async (ai, chunk, chunkIndex) => {
  try {
    const result = await ai.run('@cf/openai/whisper', {
      audio: Array.from(chunk)
    });
    return {
      index: chunkIndex,
      text: result.text,
      success: true
    };
  } catch (error) {
    console.error(`Error processing chunk ${chunkIndex}:`, error);
    return {
      index: chunkIndex,
      error: error.message,
      success: false
    };
  }
};

// Upload endpoint
app.post('/upload', async (c) => {
  try {
    console.log('Received upload request');
    const formData = await c.req.formData();
    const file = formData.get('file');
    const mistralApiKey = formData.get('mistralApiKey');

    if (!file) {
      console.error('No file provided');
      return c.json({ error: 'No file provided' }, 400);
    }

    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    console.log('ArrayBuffer size:', arrayBuffer.byteLength);

    // Convert ArrayBuffer to array of integers
    const audioData = new Uint8Array(arrayBuffer);
    console.log('Audio data length:', audioData.length);

    // Split audio into chunks
    const chunks = splitAudioIntoChunks(audioData);
    console.log('Split audio into chunks:', chunks.length);

    // Process chunks in parallel with a limit of 3 concurrent chunks
    const chunkResults = [];
    const maxConcurrent = 3;
    
    for (let i = 0; i < chunks.length; i += maxConcurrent) {
      const chunkBatch = chunks.slice(i, i + maxConcurrent);
      const batchPromises = chunkBatch.map((chunk, index) => 
        processChunk(c.ai, chunk, i + index)
      );
      
      const batchResults = await Promise.all(batchPromises);
      chunkResults.push(...batchResults);
      
      // Log progress
      console.log(`Processed ${chunkResults.length} of ${chunks.length} chunks`);
    }

    // Combine results in order
    const transcription = chunkResults
      .sort((a, b) => a.index - b.index)
      .map(result => result.success ? result.text : '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Generate summary using Mistral
    console.log('Starting summary generation');
    let summary;
    try {
      summary = await c.ai.run('@cf/mistral/mistral-7b-instruct-v0.1', {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes audio transcriptions. Keep the summary concise and focused on the main points.'
          },
          {
            role: 'user',
            content: `Please summarize this transcription: ${transcription}`
          }
        ],
        stream: false,
        max_tokens: 500,
        temperature: 0.7,
        top_p: 0.95
      });
      console.log('Summary generation successful');
    } catch (mistralError) {
      console.error('Mistral API error:', mistralError);
      return c.json({ 
        transcription,
        error: `Mistral API error: ${mistralError.message}` 
      }, 200);
    }

    console.log('Processing complete');
    return c.json({
      transcription,
      summary: summary.response,
      stats: {
        processing_time: 0,
        audio_duration: audioData.length / 16000 // Approximate duration in seconds
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return c.json({ 
      error: `Unexpected error: ${error.message}` 
    }, 500);
  }
});

export default app; 