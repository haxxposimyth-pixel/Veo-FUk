import { GeminiService } from '../services/gemini.service';
import fs from 'fs';
import path from 'path';

async function checkKeys() {
  console.log('=== PROBING API KEYS FROM 5ApiKeys ===\n');

  const filePath = path.resolve(__dirname, '../../../5ApiKeys');
  if (!fs.existsSync(filePath)) {
    console.error('5ApiKeys file not found at:', filePath);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  // Match both AQ. keys and AIzaSy keys
  const keyMatches = content.match(/(AQ\.[A-Za-z0-9_-]+|AIzaSy[A-Za-z0-9_-]+)/g) || [];
  const uniqueKeys = Array.from(new Set(keyMatches));

  console.log(`Found ${uniqueKeys.length} unique keys in 5ApiKeys file.`);

  const workingKeys: string[] = [];
  const rateLimitedKeys: string[] = [];
  const invalidKeys: string[] = [];

  // Let's test a subset of them (e.g. first 15 or so) to find a working one quickly
  const keysToTest = uniqueKeys.slice(0, 30);
  console.log(`Testing first ${keysToTest.length} keys...`);

  for (let i = 0; i < keysToTest.length; i++) {
    const key = keysToTest[i];
    console.log(`[${i+1}/${keysToTest.length}] Probing key: ${key.substring(0, 15)}...`);
    try {
      const service = new GeminiService(key);
      // We test on gemini-2.5-flash since it's faster and cheaper, but let's also test if we can do JSON on gemini-2.5-pro
      // Let's just do a tiny text call to verify the key works.
      
      const result = await Promise.race([
        service.generateJSON(
          'gemini-2.5-flash',
          'respond with JSON: {"ok": true}',
          require('zod').object({ ok: require('zod').boolean() }),
          { temperature: 0.1 },
          1 // maxRetries = 1
        ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout after 5s')), 5000))
      ]);

      if (result && result.data && (result.data as any).ok === true) {
        console.log(`  -> SUCCESS! Key works.`);
        workingKeys.push(key);
      } else {
        console.log(`  -> FAILED: invalid response layout.`);
        invalidKeys.push(key);
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      console.log(`  -> FAILED: ${msg.substring(0, 120)}`);
      if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exhausted')) {
        rateLimitedKeys.push(key);
      } else {
        invalidKeys.push(key);
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Working Keys (${workingKeys.length}):`);
  workingKeys.forEach(k => console.log(`  ${k}`));
  console.log(`\nRate Limited Keys (${rateLimitedKeys.length}):`);
  rateLimitedKeys.forEach(k => console.log(`  ${k.substring(0, 15)}...`));
  console.log(`\nInvalid/Error Keys (${invalidKeys.length}):`);
}

checkKeys().catch(console.error);
