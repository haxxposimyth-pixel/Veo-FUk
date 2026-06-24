import type { ContentProfileConfig } from './content-profile';
import { resolveContentProfile } from './content-profile';

export interface PhasePlan {
  durationMinutes: number;
  phaseCount: number;
  layout: { phase_number: number; phase_type: 'hook' | 'build_up' | 'escalation' | 'climax' | 'outro' }[];
  plantPhase?: number | null;        // open-loop plant (early)
  payoffPhase?: number | null;       // = climaxPhase
  climaxPhase?: number | null;
  preClimaxSpikePhase?: number | null;
  outroPhase: number;
  rehookPhases: number[];    // spread across the middle
  wordsPerPhase: number;     // target narration words per phase
}

export function buildPhasePlan(
  durationMinutes: number,
  profile: ContentProfileConfig = resolveContentProfile('viral_story'),
  wordsPerMinute: number = 150
): PhasePlan {
  const PRESETS: Record<number, number> = { 8: 10, 10: 12, 15: 16, 30: 30 }; // minutes -> phaseCount
  const phaseCount = PRESETS[durationMinutes] ?? Math.min(40, Math.max(10, Math.round(durationMinutes * 1.0)));
  const layout: { phase_number: number; phase_type: 'hook' | 'build_up' | 'escalation' | 'climax' | 'outro' }[] = [];
  layout.push({ phase_number: 1, phase_type: 'hook' });
  const middle = phaseCount - 2;                 // excludes hook and outro
  
  if (profile.arcTemplate === 'listicle') {
    // FLAT sequential item-segments (no build_up/escalation/climax acts; even segments + short outro)
    for (let i = 2; i < phaseCount; i++) {
      layout.push({ phase_number: i, phase_type: 'build_up' });
    }
  } else if (profile.arcTemplate === 'tutorial') {
    // FLAT sequential step-segments
    for (let i = 2; i < phaseCount; i++) {
      layout.push({ phase_number: i, phase_type: 'build_up' });
    }
  } else if (profile.arcTemplate === '3-act-documentary') {
    const buildCount = Math.max(1, Math.round((phaseCount - 3) * 0.6));
    const escCount = (phaseCount - 3) - buildCount;
    let n = 2;
    for (let i = 0; i < buildCount; i++) layout.push({ phase_number: n++, phase_type: 'build_up' });
    for (let i = 0; i < escCount; i++)   layout.push({ phase_number: n++, phase_type: 'escalation' });
    layout.push({ phase_number: phaseCount - 1, phase_type: 'climax' });
  } else {
    // default 5-act-viral or story-arc
    const buildCount = Math.max(1, Math.round((phaseCount - 3) * 0.4));
    const escCount = (phaseCount - 3) - buildCount;
    let n = 2;
    for (let i = 0; i < buildCount; i++) layout.push({ phase_number: n++, phase_type: 'build_up' });
    for (let i = 0; i < escCount; i++)   layout.push({ phase_number: n++, phase_type: 'escalation' });
    layout.push({ phase_number: phaseCount - 1, phase_type: 'climax' });
  }
  
  layout.push({ phase_number: phaseCount,  phase_type: 'outro' });

  // plant/payoff/climax references
  const isViralOrStory = profile.arcTemplate === '5-act-viral' || profile.arcTemplate === '3-act-documentary';
  const plantPhase = isViralOrStory ? 2 : undefined;
  const climaxPhase = isViralOrStory ? phaseCount - 1 : undefined;
  const payoffPhase = isViralOrStory ? climaxPhase : undefined;
  const preClimaxSpikePhase = isViralOrStory ? phaseCount - 2 : undefined;
  const outroPhase = phaseCount;

  // rehooks logic based on engagementIntensity
  const rehookPhases: number[] = [];
  const start = 3;
  const end = isViralOrStory ? (phaseCount - 2) : (phaseCount - 1);
  const span = end - start;
  
  if (profile.engagementIntensity === 'high') {
    const count = Math.max(3, Math.round(middle / 3));
    for (let i = 1; i <= count; i++) {
      const p = Math.round(start + (span * i) / (count + 1));
      if (p >= start && p <= end && !rehookPhases.includes(p)) {
        rehookPhases.push(p);
      }
    }
  } else if (profile.engagementIntensity === 'medium') {
    // Exactly 1 rehook phase spread near midpoint
    const p = Math.round(start + span / 2);
    if (p >= start && p <= end) {
      rehookPhases.push(p);
    }
  }

  const wordsPerPhase = Math.round((durationMinutes * wordsPerMinute) / phaseCount);

  return {
    durationMinutes,
    phaseCount,
    layout,
    plantPhase,
    payoffPhase,
    climaxPhase,
    preClimaxSpikePhase,
    outroPhase,
    rehookPhases,
    wordsPerPhase,
  };
}

// Sanity parity check for 8-minute preset
const sanity8 = buildPhasePlan(8, resolveContentProfile('viral_story'), 150);
if (
  sanity8.phaseCount !== 10 ||
  sanity8.climaxPhase !== 9 ||
  sanity8.outroPhase !== 10 ||
  sanity8.plantPhase !== 2 ||
  sanity8.preClimaxSpikePhase !== 8
) {
  console.error('[PhasePlan Sanity] Failed sanity parity check for 8-min plan!', sanity8);
} else {
  console.log('[PhasePlan Sanity] Parity check passed successfully: 8-min yields exactly 10 phases, climax=9, outro=10, plant=2, spike=8.');
}
