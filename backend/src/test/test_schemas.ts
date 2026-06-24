import { sceneAgentOutputSchema, extendedSceneAgentOutputSchema } from 'shared';
import { generateScenesSchema } from '../routes/scenes.routes';
import { generatePromptSchema } from '../routes/veoprompts.routes';
import assert from 'assert';

async function run() {
  console.log("=== Testing Phase 11+ and 30 Validation ===");

  const testPhases = [11, 12, 30];

  for (const pNum of testPhases) {
    console.log(`\nValidating phaseNumber = ${pNum}...`);

    // A. generateScenesSchema
    const sceneResult = generateScenesSchema.safeParse({ phaseNumber: pNum });
    console.log(`  generateScenesSchema: ${sceneResult.success ? 'PASSED' : 'FAILED'}`);
    if (!sceneResult.success) {
      console.error(sceneResult.error);
    }
    assert(sceneResult.success, `generateScenesSchema failed for phase ${pNum}`);

    // B. generatePromptSchema
    const promptResult = generatePromptSchema.safeParse({ phaseNumber: pNum });
    console.log(`  generatePromptSchema: ${promptResult.success ? 'PASSED' : 'FAILED'}`);
    if (!promptResult.success) {
      console.error(promptResult.error);
    }
    assert(promptResult.success, `generatePromptSchema failed for phase ${pNum}`);

    // C. sceneAgentOutputSchema
    const agentResult = sceneAgentOutputSchema.safeParse({ phase_number: pNum, phaseNumber: pNum });
    console.log(`  sceneAgentOutputSchema: ${agentResult.success ? 'PASSED' : 'FAILED'}`);
    if (!agentResult.success) {
      console.error(agentResult.error);
    }
    assert(agentResult.success, `sceneAgentOutputSchema failed for phase ${pNum}`);

    // D. extendedSceneAgentOutputSchema
    const extAgentResult = extendedSceneAgentOutputSchema.safeParse({ phase_number: pNum, phaseNumber: pNum });
    console.log(`  extendedSceneAgentOutputSchema: ${extAgentResult.success ? 'PASSED' : 'FAILED'}`);
    if (!extAgentResult.success) {
      console.error(extAgentResult.error);
    }
    assert(extAgentResult.success, `extendedSceneAgentOutputSchema failed for phase ${pNum}`);
  }

  // E. Test out-of-bounds (e.g. 31 should fail)
  console.log("\nValidating phaseNumber = 31 (should fail)...");
  const failResult = generateScenesSchema.safeParse({ phaseNumber: 31 });
  console.log(`  generateScenesSchema (31): ${failResult.success ? 'PASSED (Unexpected!)' : 'FAILED (Expected)'}`);
  assert(!failResult.success, "generateScenesSchema should have failed for phase 31");

  console.log("\n=== All Schema Validation Tests Passed! ===");
}

run().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
