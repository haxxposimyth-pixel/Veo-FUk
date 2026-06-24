import { splitNarrationIntoFragments, getWordCount, getRequiredClipCount, resolveLanguageRules, checkNarrationPurity } from 'shared';
import assert from 'assert';

console.log('Running Narration Splitter and Pacing Integration Tests...');

try {
  // Test 1: Simple word count
  assert.strictEqual(getWordCount('Hello world!'), 2);
  assert.strictEqual(getWordCount('[WARNING: Narration too short] Hello world!'), 2);
  console.log('  ✓ Test 1: getWordCount passed.');

  // Test 2: Required clip count logic
  assert.strictEqual(getRequiredClipCount(10), 1);
  assert.strictEqual(getRequiredClipCount(15), 2); // 15 / 14.4 = 1.04 -> ceil -> 2
  assert.strictEqual(getRequiredClipCount(30), 3); // 30 / 14.4 = 2.08 -> ceil -> 3
  console.log('  ✓ Test 2: getRequiredClipCount passed.');

  // Test 3: The baby tear sentence (single sentence, no clean clause split)
  // Should NOT split mid-sentence or mid-comma, and return 1 fragment
  const babyTearText = "How did this forgotten baby use a single, glowing tear to melt the town's frozen heart?";
  const babyTearFrags = splitNarrationIntoFragments(babyTearText, 2);
  assert.strictEqual(babyTearFrags.length, 1);
  assert.strictEqual(babyTearFrags[0], babyTearText);
  console.log('  ✓ Test 3: Single sentence baby tear no-split passed.');

  // Test 4: Sentence boundary split (two sentences)
  const dragonSentenceText = "A threat appears that fire cannot burn. Water cannot drown.";
  const dragonSentenceFrags = splitNarrationIntoFragments(dragonSentenceText, 2);
  assert.strictEqual(dragonSentenceFrags.length, 2);
  assert.strictEqual(dragonSentenceFrags[0], "A threat appears that fire cannot burn.");
  assert.strictEqual(dragonSentenceFrags[1], "Water cannot drown.");
  console.log('  ✓ Test 4: Sentence boundary split passed.');

  // Test 5: Clause boundary split (em-dash)
  const emDashText = "A threat appears that fire cannot burn — water cannot drown.";
  const emDashFrags = splitNarrationIntoFragments(emDashText, 2);
  assert.strictEqual(emDashFrags.length, 2);
  assert.strictEqual(emDashFrags[0], "A threat appears that fire cannot burn.");
  assert.strictEqual(emDashFrags[1], "Water cannot drown.");
  console.log('  ✓ Test 5: Em-dash clause boundary split passed.');

  // Test 6: Clause boundary split (semicolon)
  const semicolonText = "When the strongest dragons fly, they command the sky; yet a threat appears that fire cannot burn.";
  const semicolonFrags = splitNarrationIntoFragments(semicolonText, 2);
  assert.strictEqual(semicolonFrags.length, 2);
  assert.strictEqual(semicolonFrags[0], "When the strongest dragons fly, they command the sky.");
  assert.strictEqual(semicolonFrags[1], "Yet a threat appears that fire cannot burn.");
  console.log('  ✓ Test 6: Semicolon clause boundary split passed.');

  // Test 7: Frontend regex check endsCleanly
  const endsCleanlyRegex = /(?:[.!?…]|\.\.\.)["'”’)]*$/;
  
  const validEndings = [
    "A clean sentence.",
    "A sentence ending in exclamation!",
    "Is this a question?",
    "A trailing ellipsis…",
    "Three periods ending...",
    "\"A quote-ended sentence.\"",
    "'Single quote ending.'",
    "A parenthesized sentence.)"
  ];

  const invalidEndings = [
    "A sentence ending in comma,",
    "No ending punctuation",
    "Ends with a space ",
    "Ends on conjunction and",
    "Fragment (Part 1)"
  ];

  for (const text of validEndings) {
    assert.ok(endsCleanlyRegex.test(text), `Expected true for: "${text}"`);
  }

  for (const text of invalidEndings) {
    assert.strictEqual(endsCleanlyRegex.test(text), false, `Expected false for: "${text}"`);
  }
  console.log('  ✓ Test 7: Frontend endsCleanly regex assertions passed.');

  // Test 8: Japanese Character Pacing, Splitting, and Clip Count
  console.log('Running Japanese Tests...');
  const jpText = "昔々、あるところに、おじいさんとおばあさんが住んでいました。おじいさんは山へ芝刈りに、おばあさんは川へ洗濯に行きました。";
  // Word count (character-based)
  const jpWordCount = getWordCount(jpText, 'Japanese');
  assert.ok(jpWordCount > 1, `Expected word count for Japanese to be character-based, got ${jpWordCount}`);
  // Split on 。
  const jpFrags = splitNarrationIntoFragments(jpText, 2, 'Japanese');
  assert.ok(jpFrags.length >= 2, `Expected Japanese to split into at least 2 fragments, got ${jpFrags.length}`);
  // getRequiredClipCount > 1
  const jpClipCount = getRequiredClipCount(jpWordCount, 'Japanese');
  assert.ok(jpClipCount > 1, `Expected Japanese clip count to be > 1, got ${jpClipCount}`);
  console.log('  ✓ Test 8: Japanese character count, split, and clip count passed.');

  // Test 9: Thai fallback spacing/character pacing
  console.log('Running Thai Tests...');
  const thaiText = "กาลครั้งหนึ่งนานมาแล้วมีคุณปู่และคุณย่าอาศัยอยู่ในหมู่บ้านเล็กๆคุณปู่ไปตัดฟืนบนภูเขา";
  // Thai has no spaces and empty terminators in this sample, it should segment using segmentByChars/fallback
  const thaiFrags = splitNarrationIntoFragments(thaiText, 2, 'Thai');
  assert.ok(thaiFrags.length >= 2, `Expected Thai to segment into multiple fragments, got ${thaiFrags.length}`);
  // Try split with space phrase boundaries
  const thaiSpaceText = "กาลครั้งหนึ่งนานมาแล้ว มีคุณปู่และคุณย่า อาศัยอยู่ในหมู่บ้านเล็กๆ";
  const thaiSpaceFrags = splitNarrationIntoFragments(thaiSpaceText, 2, 'Thai');
  assert.ok(thaiSpaceFrags.length >= 2, `Expected Thai with spaces to split into multiple fragments, got ${thaiSpaceFrags.length}`);
  console.log('  ✓ Test 9: Thai character fallback and space-splitting passed.');

  // Test 10: Arabic RTL directionality and split on ؟ and .
  console.log('Running Arabic Tests...');
  const arRules = resolveLanguageRules('Arabic');
  assert.strictEqual(arRules.direction, 'rtl');
  const arText = "كيف حالك اليوم؟ أنا بخير والحمد لله.";
  const arFrags = splitNarrationIntoFragments(arText, 2, 'Arabic');
  assert.strictEqual(arFrags.length, 2, `Expected Arabic to split into 2 fragments, got ${arFrags.length}`);
  assert.ok(arFrags[0].includes('؟') || arFrags[1].includes('؟'), 'Expected Arabic fragments to split on ؟');
  console.log('  ✓ Test 10: Arabic RTL direction and splitting passed.');

  // Test 11: Hindi Regression (Danda splitting, word count, narration purity)
  console.log('Running Hindi Regression Tests...');
  const hiText = "एक राजा था। उसकी तीन रानियाँ थीं।";
  // Danda splitting
  const hiFrags = splitNarrationIntoFragments(hiText, 2, 'Hindi');
  assert.strictEqual(hiFrags.length, 2, `Expected Hindi to split into 2 fragments, got ${hiFrags.length}`);
  assert.ok(hiFrags[0].endsWith('।') || hiFrags[1].endsWith('।') || hiFrags[0].endsWith('.') || hiFrags[1].endsWith('.'), "Expected Hindi fragments to end with '।'");
  // Narration purity
  const hiPureCheck1 = checkNarrationPurity(hiText, 'Hindi');
  assert.ok(hiPureCheck1.ok, 'Expected pure Hindi text to pass purity check');
  const hiImpureText = "एक राजा था status. उसकी रानियाँ थीं।";
  const hiPureCheck2 = checkNarrationPurity(hiImpureText, 'Hindi');
  assert.strictEqual(hiPureCheck2.ok, false, 'Expected English word status to fail purity check in Hindi');
  console.log('  ✓ Test 11: Hindi regression danda split, word count, and purity passed.');

  // Test 12: English Regression
  console.log('Running English Regression Tests...');
  const enRules = resolveLanguageRules('English');
  assert.strictEqual(enRules.narrationHint, '');
  assert.strictEqual(enRules.unitsPerMinute, 150);
  assert.strictEqual(enRules.unitsPerClipDivisor, 14.4);
  console.log('  ✓ Test 12: English regression empty hint and standard pacing passed.');

  console.log('All Narration Splitter Pacing Tests passed successfully!');
  process.exit(0);
} catch (err: any) {
  console.error('Test failed:', err);
  process.exit(1);
}
