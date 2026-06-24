import { extractAndParseJSON } from './json-extractor';
import assert from 'assert';

console.log('Running JSON Extractor Unit Tests...');

// Case 1: Markdown code fences
try {
  const input = '```json\n{\n  "name": "Gemini",\n  "type": "AI"\n}\n```';
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, { name: 'Gemini', type: 'AI' });
  console.log('  ✓ Case 1 passed (Markdown code fences)');
} catch (err: any) {
  console.error('  ✗ Case 1 failed:', err.message);
  process.exit(1);
}

// Case 2: Preamble and postamble prose
try {
  const input = 'Here is the response you requested: {"score": 9.5} hope this helps!';
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, { score: 9.5 });
  console.log('  ✓ Case 2 passed (Preamble and postamble prose)');
} catch (err: any) {
  console.error('  ✗ Case 2 failed:', err.message);
  process.exit(1);
}

// Case 3: Single quotes instead of double quotes
try {
  const input = "{'message': 'success', 'code': 200}";
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, { message: 'success', code: 200 });
  console.log('  ✓ Case 3 passed (Single quotes)');
} catch (err: any) {
  console.error('  ✗ Case 3 failed:', err.message);
  process.exit(1);
}

// Case 4: Escaped single quotes and unescaped double quotes inside single-quoted strings
try {
  const input = "{'quote': 'O\\'Connor said \"hello\"', 'valid': true}";
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, { quote: 'O\'Connor said "hello"', valid: true });
  console.log('  ✓ Case 4 passed (Single quote conversions and escapes)');
} catch (err: any) {
  console.error('  ✗ Case 4 failed:', err.message);
  process.exit(1);
}

// Case 5: Trailing commas in objects and arrays
try {
  const input = '{"list": [1, 2, 3,], "user": {"id": 1,},}';
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, { list: [1, 2, 3], user: { id: 1 } });
  console.log('  ✓ Case 5 passed (Trailing commas)');
} catch (err: any) {
  console.error('  ✗ Case 5 failed:', err.message);
  process.exit(1);
}

// Case 6: Unescaped newlines in string values
try {
  const input = '{\n  "description": "This is line 1\nand this is line 2."\n}';
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, { description: 'This is line 1\nand this is line 2.' });
  console.log('  ✓ Case 6 passed (Unescaped newlines in string values)');
} catch (err: any) {
  console.error('  ✗ Case 6 failed:', err.message);
  process.exit(1);
}

// Case 7: Braces/brackets inside string values and in preamble
try {
  const input = 'The user query was {some query}. Here is JSON: {"description": "Matches {pattern} and [brackets]" }';
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, { description: 'Matches {pattern} and [brackets]' });
  console.log('  ✓ Case 7 passed (Braces/brackets inside strings/preamble)');
} catch (err: any) {
  console.error('  ✗ Case 7 failed:', err.message);
  process.exit(1);
}

// Case 8: Complex combinations of multiple malformations
try {
  const input = `
Some text before the block
\`\`\`
[
  {
    'name': 'Weimar Germany',
    'details': 'Banknotes used for\nburning in stove.',
    'values': [
      100000000000,
      200000000000,
    ],
  },
]
\`\`\`
Some trailing text
`;
  const result = extractAndParseJSON(input);
  assert.deepStrictEqual(result, [
    {
      name: 'Weimar Germany',
      details: 'Banknotes used for\nburning in stove.',
      values: [100000000000, 200000000000]
    }
  ]);
  console.log('  ✓ Case 8 passed (Complex combined malformations)');
} catch (err: any) {
  console.error('  ✗ Case 8 failed:', err.message);
  process.exit(1);
}

// Case 9: Invalid JSON (should throw error)
try {
  const input = '{"incomplete": "object"';
  assert.throws(() => {
    extractAndParseJSON(input);
  });
  console.log('  ✓ Case 9 passed (Throws on invalid JSON)');
} catch (err: any) {
  console.error('  ✗ Case 9 failed:', err.message);
  process.exit(1);
}

console.log('All JSON Extractor Unit Tests passed successfully!');
process.exit(0);
