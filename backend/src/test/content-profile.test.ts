import assert from 'assert';
import { 
  resolveContentProfile, 
  buildPhasePlan, 
  visualStyleLockSchema,
  isProfileTypeCoherent
} from 'shared';
import { LOCKED_CORE } from '../config/style-catalog';

function runTests() {
  console.log('Running Content Profile Backbone Tests...\n');

  // ==========================================
  // 1. Content Profile Registry Resolution
  // ==========================================
  console.log('--- TEST 1: Profile Registry Resolution ---');
  
  const viral = resolveContentProfile('viral_story');
  assert.strictEqual(viral.arcTemplate, '5-act-viral');
  assert.strictEqual(viral.engagementIntensity, 'high');
  assert.strictEqual(viral.cameraEnergy, 'dynamic');
  assert.match(viral.scoringObjective, /YouTube retention expert/);

  const doc = resolveContentProfile('documentary');
  assert.strictEqual(doc.arcTemplate, '3-act-documentary');
  assert.strictEqual(doc.engagementIntensity, 'low');
  assert.strictEqual(doc.cameraEnergy, 'standard');
  assert.match(doc.scoringObjective, /documentary editor/);

  const tut = resolveContentProfile('tutorial');
  assert.strictEqual(tut.arcTemplate, 'tutorial');
  assert.strictEqual(tut.engagementIntensity, 'low');
  assert.strictEqual(tut.cameraEnergy, 'calm');
  assert.match(tut.scoringObjective, /instructional-design expert/);

  const list = resolveContentProfile('listicle');
  assert.strictEqual(list.arcTemplate, 'listicle');
  assert.strictEqual(list.engagementIntensity, 'medium');
  assert.strictEqual(list.cameraEnergy, 'standard');
  assert.match(list.scoringObjective, /editor scoring for item variety/);

  const narr = resolveContentProfile('narrative_fiction');
  assert.strictEqual(narr.arcTemplate, '5-act-viral');
  assert.strictEqual(narr.engagementIntensity, 'medium');
  assert.strictEqual(narr.cameraEnergy, 'dynamic');
  assert.match(narr.scoringObjective, /story editor scoring for immersion/);

  // Default unknown fallback check
  const unknown = resolveContentProfile('unknown_key');
  assert.strictEqual(unknown.id, 'viral_story');
  assert.strictEqual(unknown.arcTemplate, '5-act-viral');

  console.log('✓ Profile Registry Resolution passed.\n');

  // ==========================================
  // 2. buildPhasePlan Layouts & Rehook Checks
  // ==========================================
  console.log('--- TEST 2: buildPhasePlan Layouts ---');

  // 2.1 Documentary
  const docPlan = buildPhasePlan(8, doc);
  assert.strictEqual(docPlan.phaseCount, 10);
  assert.ok(docPlan.layout.every(p => p.phase_type !== 'climax' || p.phase_number === 9));
  assert.strictEqual(docPlan.climaxPhase, 9);
  assert.strictEqual(docPlan.plantPhase, 2);
  assert.strictEqual(docPlan.rehookPhases.length, 0); // low engagement has no rehooks
  console.log('✓ Documentary layout passed.');

  // 2.2 Tutorial
  const tutPlan = buildPhasePlan(8, tut);
  assert.strictEqual(tutPlan.phaseCount, 10);
  assert.ok(tutPlan.layout.every(p => p.phase_type !== 'climax')); // no climax
  assert.strictEqual(tutPlan.climaxPhase, undefined); // no climax
  assert.strictEqual(tutPlan.plantPhase, undefined); // no plant
  assert.strictEqual(tutPlan.rehookPhases.length, 0); // low engagement has no rehooks
  console.log('✓ Tutorial layout passed.');

  // 2.3 Listicle
  const listPlan = buildPhasePlan(8, list);
  assert.strictEqual(listPlan.phaseCount, 10);
  assert.ok(listPlan.layout.every(p => p.phase_type !== 'climax')); // no climax
  assert.strictEqual(listPlan.climaxPhase, undefined);
  assert.strictEqual(listPlan.plantPhase, undefined);
  assert.strictEqual(listPlan.rehookPhases.length, 1); // medium engagement has 1 rehook
  console.log('✓ Listicle layout passed.');

  // 2.4 Viral Story Regression
  const viralPlan = buildPhasePlan(8, viral);
  assert.strictEqual(viralPlan.phaseCount, 10);
  assert.strictEqual(viralPlan.climaxPhase, 9);
  assert.strictEqual(viralPlan.plantPhase, 2);
  assert.ok(viralPlan.rehookPhases.length > 0); // high engagement has multiple rehooks
  console.log('✓ Viral Story regression layout passed.\n');

  // ==========================================
  // 3. render_style Fallback Reversion Check
  // ==========================================
  console.log('--- TEST 3: render_style Fallback Reversion ---');

  // Pixar 3D with omitted render_style
  const pixarLock = visualStyleLockSchema.parse({
    render_family: 'pixar_3d'
  });
  assert.strictEqual(pixarLock.render_style, 'Pixar-style 3D animation');

  // Omitted render_family and render_style
  const neutralLock = visualStyleLockSchema.parse({});
  assert.strictEqual(neutralLock.render_style, 'cinematic'); // neutral, not photoreal

  // Explicit render_style preserved
  const explicitLock = visualStyleLockSchema.parse({
    render_family: 'pixar_3d',
    render_style: 'custom style'
  });
  assert.strictEqual(explicitLock.render_style, 'custom style');

  console.log('✓ render_style Fallback Reversion passed.\n');

  // ==========================================
  // 4. curator ProfileDefaultKey presets mapping
  // ==========================================
  console.log('--- TEST 4: Curator Presets Key Mapping ---');

  const presetKeys = ['photoreal_cinematic', 'documentary_realism', '3d_explainer_environments'];
  for (const pk of presetKeys) {
    const matched = LOCKED_CORE.find(c => c.key === pk);
    assert.ok(matched, `Preset key ${pk} must exist in LOCKED_CORE`);
    assert.ok(matched.name, `Preset key ${pk} must have a name`);
    console.log(`Matched preset key "${pk}" -> name "${matched.name}"`);
  }

  console.log('✓ Curator Presets Key Mapping passed.\n');

  // ==========================================
  // 5. Profile & Type Compatibility / Coherence
  // ==========================================
  console.log('--- TEST 5: Profile/Type Coherence ---');
  assert.ok(isProfileTypeCoherent('viral_story', 'auto'));
  assert.ok(isProfileTypeCoherent('viral_story', 'narrative'));
  assert.ok(!isProfileTypeCoherent('viral_story', 'documentary'));
  assert.ok(!isProfileTypeCoherent('viral_story', 'presenter'));

  assert.ok(isProfileTypeCoherent('documentary', 'auto'));
  assert.ok(isProfileTypeCoherent('documentary', 'documentary'));
  assert.ok(!isProfileTypeCoherent('documentary', 'narrative'));

  assert.ok(isProfileTypeCoherent('tutorial', 'presenter'));
  assert.ok(isProfileTypeCoherent('tutorial', 'documentary'));
  assert.ok(!isProfileTypeCoherent('tutorial', 'narrative'));
  console.log('✓ Profile/Type Coherence passed.\n');

  console.log('All Content Profile Backbone Tests passed successfully!');
}

runTests();
