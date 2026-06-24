/**
 * Extracts and cleans JSON candidates from a raw text response,
 * and attempts to parse them.
 */
export function extractAndParseJSON(str: string): any {
  // === VVS FIX 3 START ===
  const rawString = str;
  // Step 1 — Strip opening fence
  const openFencePattern = /^```(?:json)?\s*/;
  const withoutOpenFence = rawString.trim().replace(openFencePattern, '');

  // Step 2 — Strip closing fence using LAST occurrence, not first
  const lastFenceIndex = withoutOpenFence.lastIndexOf('```');
  const cleaned = lastFenceIndex !== -1
    ? withoutOpenFence.slice(0, lastFenceIndex).trim()
    : withoutOpenFence.trim();

  // Step 3 — Check if the result is valid JSON by attempting JSON.parse
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    // Step 4 — Attempt to auto-close the JSON if it is incomplete
    if (err instanceof SyntaxError) {
      let inString = false;
      let openBraces = 0;
      let closeBraces = 0;
      let openBrackets = 0;
      let closeBrackets = 0;

      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (inString) {
          if (char === '\\') {
            i++; // skip escaped char
          } else if (char === '"') {
            inString = false;
          }
        } else {
          if (char === '"') {
            inString = true;
          } else if (char === '{') {
            openBraces++;
          } else if (char === '}') {
            closeBraces++;
          } else if (char === '[') {
            openBrackets++;
          } else if (char === ']') {
            closeBrackets++;
          }
        }
      }

      let toAppend = '';
      let targetText = cleaned;
      if (inString) {
        if (targetText.endsWith('\\')) {
          targetText = targetText.slice(0, -1);
        }
        toAppend += '"';
      }

      if (!inString) {
        targetText = targetText.trim();
        if (targetText.endsWith(',')) {
          targetText = targetText.slice(0, -1).trim();
        }
      }

      const unclosedBraces = Math.max(0, openBraces - closeBraces);
      const unclosedArrays = Math.max(0, openBrackets - closeBrackets);
      toAppend += '}'.repeat(unclosedBraces) + ']'.repeat(unclosedArrays);

      if (toAppend.length > 0) {
        const autoClosed = targetText + toAppend;
        try {
          const parsed = JSON.parse(autoClosed);
          console.warn("json-extractor: auto-closed truncated JSON response");
          return parsed;
        } catch (innerErr) {
          // fall through
        }
      }
    }
  }

  // Fallback: use candidate extraction on the cleaned string
  const candidates = extractJsonCandidates(cleaned);
  if (candidates.length === 0) {
    throw new Error('No JSON structure (object or array) found in the input.');
  }

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const cleanedCand = cleanJsonString(candidate);
      return JSON.parse(cleanedCand);
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(`Failed to parse extracted JSON candidates. Last error: ${lastError?.message}`);
  // === VVS FIX 3 END ===
}

/**
 * Scans the string to find all balanced JSON objects ({...}) or arrays ([...]).
 * Ignores brackets/braces inside string values by tracking string state.
 */
function extractJsonCandidates(str: string): string[] {
  const candidates: string[] = [];
  
  for (let i = 0; i < str.length; i++) {
    const startChar = str[i];
    if (startChar === '{' || startChar === '[') {
      const endChar = startChar === '{' ? '}' : ']';
      let depth = 1;
      let inString = false;
      let stringChar = '';
      let j = i + 1;
      
      for (; j < str.length; j++) {
        const char = str[j];
        if (inString) {
          if (char === '\\') {
            j++; // skip escaped char
          } else if (char === stringChar) {
            inString = false;
            stringChar = '';
          }
        } else {
          if (char === '"' || char === '\'') {
            inString = true;
            stringChar = char;
          } else if (char === startChar) {
            depth++;
          } else if (char === endChar) {
            depth--;
            if (depth === 0) {
              candidates.push(str.substring(i, j + 1));
              break;
            }
          }
        }
      }
    }
  }
  
  // Sort candidates by length descending, so we check the most complete JSON structure first.
  return candidates.sort((a, b) => b.length - a.length);
}

/**
 * Cleans a raw JSON candidate string:
 * - normalizes single quotes to double quotes (escaping inner double quotes, unescaping single quotes)
 * - escapes literal newlines inside string values
 * - removes trailing commas inside objects/arrays
 */
export function cleanJsonString(jsonStr: string): string {
  let output = '';
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (inString) {
      if (char === '\\') {
        const nextChar = jsonStr[i + 1];
        if (nextChar !== undefined) {
          if (stringChar === '\'' && nextChar === '\'') {
            output += '\'';
          } else if (stringChar === '"' && nextChar === '"') {
            output += '\\"';
          } else if (nextChar === '\'') {
            output += '\'';
          } else if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'].includes(nextChar)) {
            output += '\\' + nextChar;
          } else {
            output += nextChar;
          }
          i++;
        } else {
          output += '\\';
        }
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
        output += '"';
      } else if (char === '"' && stringChar === '\'') {
        output += '\\"';
      } else if (char === '\n') {
        output += '\\n';
      } else if (char === '\r') {
        if (jsonStr[i + 1] === '\n') {
          output += '\\n';
          i++;
        } else {
          output += '\\r';
        }
      } else {
        output += char;
      }
    } else {
      if (char === '"' || char === '\'') {
        inString = true;
        stringChar = char;
        output += '"';
      } else {
        output += char;
      }
    }
  }
  
  // Clean trailing commas before closing braces/brackets
  let cleaned = output;
  let prevCleaned = '';
  while (cleaned !== prevCleaned) {
    prevCleaned = cleaned;
    cleaned = cleaned.replace(/,\s*(?=[\]}])/g, '');
  }
  
  return cleaned;
}
