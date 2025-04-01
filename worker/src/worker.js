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
  
  // Validate input
  if (!audioData || audioData.length === 0) {
    console.error('Invalid audio data provided to splitAudioIntoChunks');
    return [];
  }

  // Log chunk size details
  console.log('Chunk configuration:', {
    sampleRate,
    chunkSize,
    overlap,
    samplesPerChunk,
    overlapSamples,
    totalSamples: audioData.length
  });

  // Calculate optimal chunk size based on audio length
  const minChunkSize = 5 * sampleRate; // 5 seconds minimum
  const maxChunks = Math.ceil(audioData.length / (minChunkSize - overlapSamples));
  const adjustedSamplesPerChunk = Math.max(
    minChunkSize,
    Math.ceil(audioData.length / maxChunks) + overlapSamples
  );

  console.log('Adjusted chunk size:', {
    minChunkSize,
    maxChunks,
    adjustedSamplesPerChunk
  });
  
  for (let i = 0; i < audioData.length; i += adjustedSamplesPerChunk - overlapSamples) {
    const chunk = audioData.slice(i, i + adjustedSamplesPerChunk);
    
    // Only add non-empty chunks
    if (chunk.length > 0) {
      chunks.push(chunk);
      console.log(`Created chunk ${chunks.length}: ${chunk.length} samples`);
    }
  }
  
  return chunks;
};

// Helper function to process a single chunk
const processChunk = async (ai, chunk, chunkIndex) => {
  try {
    console.log(`Processing chunk ${chunkIndex}, size: ${chunk.length} bytes`);
    
    // Ensure chunk is valid
    if (!chunk || chunk.length === 0) {
      console.error(`Invalid chunk ${chunkIndex}: empty or null`);
      return {
        index: chunkIndex,
        error: 'Invalid chunk: empty or null',
        success: false
      };
    }

    // Process the chunk
    const result = await ai.run('@cf/openai/whisper', {
      audio: Array.from(chunk),
      language: 'en'  // Explicitly set language
    });

    console.log(`Chunk ${chunkIndex} processed successfully:`, result);

    if (!result || !result.text) {
      console.error(`Invalid result for chunk ${chunkIndex}:`, result);
      return {
        index: chunkIndex,
        error: 'Invalid result from Whisper API',
        success: false
      };
    }

    return {
      index: chunkIndex,
      text: result.text.trim(),
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

    if (audioData.length === 0) {
      console.error('Empty audio data');
      return c.json({ error: 'Empty audio file' }, 400);
    }

    // Split audio into chunks
    const chunks = splitAudioIntoChunks(audioData);
    console.log('Split audio into chunks:', chunks.length);

    if (chunks.length === 0) {
      console.error('No chunks generated');
      return c.json({ error: 'Failed to split audio into chunks' }, 400);
    }

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

    // Check if any chunks were processed successfully
    const successfulChunks = chunkResults.filter(result => result.success);
    if (successfulChunks.length === 0) {
      console.error('No chunks were processed successfully');
      return c.json({ 
        error: 'Failed to process any audio chunks',
        details: chunkResults.map(r => r.error).filter(Boolean)
      }, 500);
    }

    // Combine results in order
    const transcription = chunkResults
      .sort((a, b) => a.index - b.index)
      .map(result => result.success ? result.text : '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!transcription) {
      console.error('Empty transcription after processing');
      return c.json({ error: 'Failed to generate transcription' }, 500);
    }

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