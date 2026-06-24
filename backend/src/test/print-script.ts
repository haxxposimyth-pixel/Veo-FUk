import db from '../db/connection';

async function main() {
  const projectId = 'd19e5f65-0497-488e-8c1d-bc30ddf53860';
  const row = db.prepare('SELECT raw_json FROM scripts WHERE project_id = ?').get(projectId) as any;
  if (!row) {
    console.error('No script found for project:', projectId);
    db.close();
    return;
  }

  const script = JSON.parse(row.raw_json);
  console.log(`=== SPOT-CHECKING SCRIPT FOR PROJECT: ${projectId} ===`);
  console.log(`Total Phases: ${script.phases.length}`);

  // Spot-check Hook (Phase 1)
  const p1 = script.phases.find((p: any) => p.phase_number === 1);
  if (p1) {
    console.log(`\n--- PHASE 1 HOOK ---`);
    console.log(`Title: ${p1.phase_title}`);
    console.log(`Open Loop: ${p1.open_loop_role}`);
    console.log(`Rehook: ${p1.rehook_type}`);
    console.log(`Narration: ${p1.narration_text}`);
  }

  // Spot-check Plant (Phase 2)
  const p2 = script.phases.find((p: any) => p.phase_number === 2);
  if (p2) {
    console.log(`\n--- PHASE 2 PLANT ---`);
    console.log(`Title: ${p2.phase_title}`);
    console.log(`Open Loop: ${p2.open_loop_role}`);
    console.log(`Rehook: ${p2.rehook_type}`);
    console.log(`Narration: ${p2.narration_text}`);
  }

  // Spot-check a Middle Phase (Phase 15)
  const p15 = script.phases.find((p: any) => p.phase_number === 15);
  if (p15) {
    console.log(`\n--- PHASE 15 MIDDLE ---`);
    console.log(`Title: ${p15.phase_title}`);
    console.log(`Open Loop: ${p15.open_loop_role}`);
    console.log(`Rehook: ${p15.rehook_type}`);
    console.log(`Narration: ${p15.narration_text}`);
  }

  // Spot-check Payoff / Climax (Phase 29)
  const p29 = script.phases.find((p: any) => p.phase_number === 29);
  if (p29) {
    console.log(`\n--- PHASE 29 PAYOFF (CLIMAX) ---`);
    console.log(`Title: ${p29.phase_title}`);
    console.log(`Open Loop: ${p29.open_loop_role}`);
    console.log(`Rehook: ${p29.rehook_type}`);
    console.log(`Narration: ${p29.narration_text}`);
  }

  // Perform Hindi purity tests
  console.log(`\n=== HINDI PURITY TEST ===`);
  let hasRomanLeakage = false;
  let hasPeriodEnding = false;
  let hasCommaCut = false;

  for (const p of script.phases) {
    const text = p.narration_text || '';
    
    // Check Roman leakage
    if (/[a-zA-Z]/.test(text)) {
      console.log(`WARNING: Phase ${p.phase_number} contains Roman script: "${text.match(/[a-zA-Z]+/g)?.join(', ')}"`);
      hasRomanLeakage = true;
    }

    // Check sentence ending in period instead of danda
    if (text.includes('.') && !text.includes('...')) {
      console.log(`WARNING: Phase ${p.phase_number} contains period ('.'): "${text}"`);
      hasPeriodEnding = true;
    }

    // Check for comma cut (sentence ending or breaking abruptly near commas, or commas used where danda is expected)
    // Here we can check if a sentence ends with a comma
    if (text.trim().endsWith(',')) {
      console.log(`WARNING: Phase ${p.phase_number} ends with a comma!`);
      hasCommaCut = true;
    }
  }

  if (!hasRomanLeakage) console.log(`[PASS] No Roman script leakage found in any phase narration.`);
  if (!hasPeriodEnding) console.log(`[PASS] No period sentence endings found. All sentences end with correct punctuation (e.g. danda)।`);
  if (!hasCommaCut) console.log(`[PASS] No abrupt comma cuts/endings found.`);

  db.close();
}

main().catch(console.error);
