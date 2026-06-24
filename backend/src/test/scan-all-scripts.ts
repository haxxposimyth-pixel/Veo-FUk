import db from '../db/connection';

async function main() {
  const rows = db.prepare('SELECT raw_json FROM scripts').all() as any[];
  
  for (const row of rows) {
    const script = JSON.parse(row.raw_json);
    console.log(`\n========================================`);
    console.log(`PRESET: ${script.phases.length} PHASES`);
    console.log(`========================================`);
    
    for (const p of script.phases) {
      const text = p.narration_text || '';
      
      // Check Roman script
      const romanMatches = text.match(/[a-zA-Z]+/g);
      if (romanMatches) {
        console.log(`Phase ${p.phase_number} has Roman leakage: [${romanMatches.join(', ')}]`);
        console.log(`  Text: "${text}"`);
      }
      
      // Check periods (excluding decimals or ellipses)
      // A simple check: a period followed by a space, end of string, or not adjacent to digits
      const periodMatches = text.match(/(?<!\d)\.(?!\d)/g);
      if (periodMatches) {
        console.log(`Phase ${p.phase_number} has period sentence-ending:`);
        console.log(`  Text: "${text}"`);
      }
    }
  }
  
  db.close();
}

main().catch(console.error);
