/**
 * Gemini API client utility using Node's native fetch.
 * Sets up generation options and enforces structured JSON outputs.
 */

interface GeminiOptions {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export async function generateJSON<T>(
  prompt: string,
  schema: object,
  options: GeminiOptions
): Promise<T> {
  const { apiKey, model, temperature = 0.7, maxTokens = 8192 } = options;

  if (!apiKey) {
    throw new Error('Gemini API key is required. Please set it in Settings.');
  }

  // Resolve model name. Gemini API expects format like "models/gemini-2.5-pro" or just "gemini-2.5-pro"
  const cleanModel = model.startsWith('models/') ? model : `models/${model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // Not JSON
      }
      const errorMessage = errorJson?.error?.message || errorText || `HTTP error ${response.status}`;
      throw new Error(`Gemini API Error: ${errorMessage}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error('Gemini API returned an empty response.');
    }

    // Parse candidate text as JSON
    const parsedData = JSON.parse(candidateText) as T;
    return parsedData;
  } catch (error: any) {
    console.error('Gemini API Request Failed:', error);
    throw error;
  }
}
