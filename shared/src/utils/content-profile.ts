export interface ContentProfileConfig {
  id: string;
  arcTemplate: '5-act-viral' | '3-act-documentary' | 'tutorial' | 'listicle';
  engagementIntensity: 'high' | 'medium' | 'low' | 'off';
  scoringObjective: string;     
  cameraEnergy: 'calm' | 'standard' | 'dynamic';
  defaultCharacterCount?: number;
  defaultVisualStyleKey?: string;
  hookThreshold: number;
  hookCriteria: Array<{
    key: 'pattern_interrupt' | 'stakes_clarity' | 'curiosity_gap' | 'scroll_stop_power';
    label: string;
    prompt: string;
  }>;
}

const profiles: Record<string, ContentProfileConfig> = {
  'viral_story': {
    id: 'viral_story',
    arcTemplate: '5-act-viral',
    engagementIntensity: 'high',
    scoringObjective: 'You are a YouTube retention expert. Evaluate the hook for hyper-engaging pattern interrupts, stakes, curiosity gaps, and scroll-stop power.',
    cameraEnergy: 'dynamic',
    defaultCharacterCount: 2,
    defaultVisualStyleKey: 'photoreal_cinematic',
    hookThreshold: 7,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Pattern Interrupt',
        prompt: 'Does the opening sentence immediately challenge a common belief, present a shocking contradiction, or create cognitive dissonance?'
      },
      {
        key: 'stakes_clarity',
        label: 'Stakes Clarity',
        prompt: 'Are the consequences or payoff of watching clearly implied within the first 3 sentences?'
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an unanswered question or unresolved tension that compels the viewer to keep watching?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Scroll Stop Power',
        prompt: "Would this narration, heard over a compelling visual, make someone stop scrolling in the first 5 seconds? Specifically penalize any hook that contains Beat 3 answer hints (hints or answers to the curiosity gap question), transition summaries (explaining what the video will cover), or any of these prohibited clichés:\n   - 'You have been fed a...'\n   - 'History books will tell you...'\n   - 'Most people don't know...'\n   - 'What they don't want you to know...'\n   - 'Let that sink in.'\n   - 'The truth is...'\n   - 'It's more complicated than that.'\n   - 'Throughout history...'\n   - 'In a world where...'\n   - Any phrase that promises to reveal something without immediately revealing it."
      }
    ]
  },
  'documentary': {
    id: 'documentary',
    arcTemplate: '3-act-documentary',
    engagementIntensity: 'low',
    scoringObjective: 'You are a documentary editor scoring for credibility, narrative clarity, and sustained interest (NOT viral scroll-stopping).',
    cameraEnergy: 'standard',
    defaultCharacterCount: 4,
    defaultVisualStyleKey: 'documentary_realism',
    hookThreshold: 6,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Intriguing Angle',
        prompt: 'Does the opening raise a compelling question, tension, or little-known angle (NOT necessarily a shocking contradiction)?'
      },
      {
        key: 'stakes_clarity',
        label: 'Stakes Clarity',
        prompt: "Is it clear why this subject matters / what's at stake?"
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an unresolved question that compels continued watching?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Narrative Pull',
        prompt: 'Does the opening, over a compelling visual, draw the viewer into the subject and establish sustained interest? (Do NOT require 5-second scroll-stopping.)'
      }
    ]
  },
  'tutorial': {
    id: 'tutorial',
    arcTemplate: 'tutorial',
    engagementIntensity: 'low',
    scoringObjective: 'You are an instructional-design expert scoring for clarity, logical step order, and learner payoff (NOT viral retention).',
    cameraEnergy: 'calm',
    defaultCharacterCount: 1,
    defaultVisualStyleKey: '3d_explainer_environments',
    hookThreshold: 5.5,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Problem Statement',
        prompt: 'Does the opening clearly frame a real-world problem, challenge, or learning objective?'
      },
      {
        key: 'stakes_clarity',
        label: 'Relevance & Value',
        prompt: 'Is it clear how solving this problem benefits the learner or what the stakes are if ignored?'
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an engaging question or puzzle that primes the learner for the upcoming steps?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Promise of Payoff',
        prompt: "Will the learner trust they'll gain a clear skill? Specifically, does the opening establish credible expertise and layout a clear promise of what will be learned without hype or clickbait?"
      }
    ]
  },
  'listicle': {
    id: 'listicle',
    arcTemplate: 'listicle',
    engagementIntensity: 'medium',
    scoringObjective: 'You are an editor scoring for item variety, pace between items, and curiosity to keep watching the countdown.',
    cameraEnergy: 'standard',
    defaultCharacterCount: 1,
    defaultVisualStyleKey: '3d_explainer_environments',
    hookThreshold: 6,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Theme Hook',
        prompt: 'Does the opening set up the countdown theme or category in an intriguing or unexpected way?'
      },
      {
        key: 'stakes_clarity',
        label: 'Stakes Clarity',
        prompt: 'Is it clear why these specific items or this ranking matters to the viewer?'
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there a curiosity gap setup regarding what ranks highest or what unique items are featured?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Countdown Pull',
        prompt: 'Does the opening create anticipation for the countdown sequence, establishing a fast-paced reason to watch all the items?'
      }
    ]
  },
  'narrative_fiction': {
    id: 'narrative_fiction',
    arcTemplate: '5-act-viral',
    engagementIntensity: 'medium',
    scoringObjective: 'You are a story editor scoring for immersion, stakes, and emotional payoff.',
    cameraEnergy: 'dynamic',
    defaultCharacterCount: 4,
    defaultVisualStyleKey: 'photoreal_cinematic',
    hookThreshold: 6.5,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Hook / Inciting Angle',
        prompt: 'Does the opening drop the viewer directly into a compelling scene, mood, or character conflict?'
      },
      {
        key: 'stakes_clarity',
        label: 'Stakes Clarity',
        prompt: 'Are the narrative stakes or character desires clearly set up or hinted at early on?'
      },
      {
        key: 'curiosity_gap',
        label: 'Narrative Gap',
        prompt: 'Is there a mystery or unanswered narrative question that creates immediate tension?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Immersive Pull',
        prompt: 'Does the opening establish a rich atmosphere and sensory details that draw the viewer in, avoiding cliché generic introductions?'
      }
    ]
  },
  'cinematic_series': {
    id: 'cinematic_series',
    arcTemplate: '5-act-viral',
    engagementIntensity: 'high',
    scoringObjective: 'You are an episodic cinematic showrunner scoring for cinematic tension, hook intensity, cliffhangers, and character-driven high stakes.',
    cameraEnergy: 'dynamic',
    defaultCharacterCount: 4,
    defaultVisualStyleKey: 'photoreal_cinematic',
    hookThreshold: 7.0,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Inciting Incident / Hook',
        prompt: 'Does the opening immediately pull the audience into a high-stakes cinematic incident, intense character dynamic, or jarring visual conflict?'
      },
      {
        key: 'stakes_clarity',
        label: 'Cinematic Stakes',
        prompt: 'Are the immediate life-or-death, emotional, or narrative stakes established within the opening moments?'
      },
      {
        key: 'curiosity_gap',
        label: 'Narrative Hook / Cliffhanger',
        prompt: 'Is there a compelling micro-cliffhanger or central question established to sustain episodic viewer retention?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Cinematic Grip',
        prompt: 'Does the opening narration and action bypass exposition to instantly grip the audience and hook them into the scene?'
      }
    ]
  },
  'industry_profile': {
    id: 'industry_profile',
    arcTemplate: '3-act-documentary',
    engagementIntensity: 'low',
    scoringObjective: 'You are a business explainer editor scoring for clarity of the industry process, professional credibility, and structured business analysis.',
    cameraEnergy: 'standard',
    defaultCharacterCount: 4,
    defaultVisualStyleKey: 'documentary_realism',
    hookThreshold: 6,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Intriguing Industry Angle',
        prompt: 'Does the opening raise a compelling question, operational challenge, or little-known industry insight?'
      },
      {
        key: 'stakes_clarity',
        label: 'Economic/Business Stakes',
        prompt: "Is it clear why this industry process or business case study matters and what is at stake?"
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an unresolved operational or economic question that drives continued watching?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Narrative Interest',
        prompt: 'Does the opening establish a professional yet engaging hook that warrants sustained attention?'
      }
    ]
  },
  'product_showcase': {
    id: 'product_showcase',
    arcTemplate: 'tutorial',
    engagementIntensity: 'medium',
    scoringObjective: 'You are a product marketing editor scoring for clear value proposition, features explanation, and viewer interest.',
    cameraEnergy: 'standard',
    defaultCharacterCount: 2,
    defaultVisualStyleKey: 'photoreal_cinematic',
    hookThreshold: 6,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Product Benefit Hook',
        prompt: 'Does the opening highlight a compelling user problem or key product utility?'
      },
      {
        key: 'stakes_clarity',
        label: 'Relevance & Solution',
        prompt: 'Is it clear how this product solves the problem or improves the user\'s setup?'
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an engaging question or puzzle regarding the product\'s capabilities?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Promise of Value',
        prompt: 'Will the viewer trust the presentation and stay engaged for the detailed feature breakdown?'
      }
    ]
  },
  'episodic_animated_story': {
    id: 'episodic_animated_story',
    arcTemplate: '5-act-viral',
    engagementIntensity: 'high',
    scoringObjective: 'You are an animation showrunner scoring for episodic hooks, character development, and narrative pacing.',
    cameraEnergy: 'dynamic',
    defaultCharacterCount: 4,
    defaultVisualStyleKey: 'photoreal_cinematic',
    hookThreshold: 7.0,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Hook / Inciting Angle',
        prompt: 'Does the opening drop the viewer directly into a compelling scene, mood, or character conflict?'
      },
      {
        key: 'stakes_clarity',
        label: 'Stakes Clarity',
        prompt: 'Are the narrative stakes or character desires clearly set up or hinted at early on?'
      },
      {
        key: 'curiosity_gap',
        label: 'Narrative Gap',
        prompt: 'Is there a mystery or unanswered narrative question that creates immediate tension?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Immersive Pull',
        prompt: 'Does the opening establish a rich atmosphere and sensory details that draw the viewer in, avoiding cliché generic introductions?'
      }
    ]
  },
  'kids_educational_story': {
    id: 'kids_educational_story',
    arcTemplate: 'tutorial',
    engagementIntensity: 'medium',
    scoringObjective: 'You are a children\'s educational media expert scoring for clear storytelling, educational value, and engaging pacing.',
    cameraEnergy: 'standard',
    defaultCharacterCount: 2,
    defaultVisualStyleKey: '3d_explainer_environments',
    hookThreshold: 6.0,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Problem Statement',
        prompt: 'Does the opening clearly frame a real-world problem, challenge, or learning objective?'
      },
      {
        key: 'stakes_clarity',
        label: 'Relevance & Value',
        prompt: 'Is it clear how solving this problem benefits the learner or what the stakes are if ignored?'
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an engaging question or puzzle that primes the learner for the upcoming steps?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Promise of Payoff',
        prompt: "Will the learner trust they'll gain a clear skill? Specifically, does the opening establish credible expertise and layout a clear promise of what will be learned without hype or clickbait?"
      }
    ]
  },
  'historical_deep_dive': {
    id: 'historical_deep_dive',
    arcTemplate: '3-act-documentary',
    engagementIntensity: 'medium',
    scoringObjective: 'You are a historical documentary editor scoring for chronological flow, educational depth, and narrative intrigue.',
    cameraEnergy: 'standard',
    defaultCharacterCount: 4,
    defaultVisualStyleKey: 'documentary_realism',
    hookThreshold: 6.5,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Intriguing Angle',
        prompt: 'Does the opening raise a compelling question, tension, or little-known angle (NOT necessarily a shocking contradiction)?'
      },
      {
        key: 'stakes_clarity',
        label: 'Stakes Clarity',
        prompt: "Is it clear why this subject matters / what's at stake?"
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an unresolved question that compels continued watching?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Narrative Pull',
        prompt: 'Does the opening, over a compelling visual, draw the viewer into the subject and establish sustained interest? (Do NOT require 5-second scroll-stopping.)'
      }
    ]
  },
  'vlog_day_in_life': {
    id: 'vlog_day_in_life',
    arcTemplate: '5-act-viral',
    engagementIntensity: 'medium',
    scoringObjective: 'You are a lifestyle vlog strategist scoring for personal connection, relatable hooks, and smooth transitions.',
    cameraEnergy: 'standard',
    defaultCharacterCount: 2,
    defaultVisualStyleKey: 'photoreal_cinematic',
    hookThreshold: 6.0,
    hookCriteria: [
      {
        key: 'pattern_interrupt',
        label: 'Pattern Interrupt',
        prompt: 'Does the opening sentence immediately challenge a common belief, present a shocking contradiction, or create cognitive dissonance?'
      },
      {
        key: 'stakes_clarity',
        label: 'Stakes Clarity',
        prompt: 'Are the consequences or payoff of watching clearly implied within the first 3 sentences?'
      },
      {
        key: 'curiosity_gap',
        label: 'Curiosity Gap',
        prompt: 'Is there an unanswered question or unresolved tension that compels the viewer to keep watching?'
      },
      {
        key: 'scroll_stop_power',
        label: 'Scroll Stop Power',
        prompt: "Would this narration, heard over a compelling visual, make someone stop scrolling in the first 5 seconds? Specifically penalize any hook that contains Beat 3 answer hints (hints or answers to the curiosity gap question), transition summaries (explaining what the video will cover), or any of these prohibited clichés:\n   - 'You have been fed a...'\n   - 'History books will tell you...'\n   - 'Most people don't know...'\n   - 'What they don't want you to know...'\n   - 'Let that sink in.'\n   - 'The truth is...'\n   - 'It's more complicated than that.'\n   - 'Throughout history...'\n   - 'In a world where...'\n   - Any phrase that promises to reveal something without immediately revealing it."
      }
    ]
  }
};

export function resolveContentProfile(profileKey: string): ContentProfileConfig {
  // Graceful fallback if a legacy or unknown key is passed
  return profiles[profileKey] || profiles['viral_story'];
}

/**
 * Matrix defining which video structures (content_types) are coherent with each content profile.
 */
export const PROFILE_TYPE_COHERENCE_MATRIX: Record<string, string[]> = {
  viral_story: ['narrative', 'montage'],
  narrative_fiction: ['narrative'],
  cinematic_series: ['narrative'],
  documentary: ['documentary'],
  industry_profile: ['documentary'],
  tutorial: ['presenter', 'documentary'],
  listicle: ['presenter', 'documentary'],
  product_showcase: ['presenter', 'documentary'],
  episodic_animated_story: ['narrative'],
  kids_educational_story: ['narrative', 'presenter', 'documentary', 'montage'],
  historical_deep_dive: ['documentary', 'montage'],
  vlog_day_in_life: ['presenter', 'documentary', 'montage'],
};

/**
 * Checks if a content profile and content type (video structure) combination is coherent.
 * 'auto' is always considered coherent.
 */
export function isProfileTypeCoherent(profileKey: string, contentType: string): boolean {
  if (!contentType || contentType === 'auto') {
    return true;
  }
  const coherentTypes = PROFILE_TYPE_COHERENCE_MATRIX[profileKey];
  if (!coherentTypes) {
    return true; // Default fallback to true if profile is unknown
  }
  return coherentTypes.includes(contentType);
}

export const PACING_FACTOR_MAP: Record<string, number> = {
  high_pacing: 1.5,
  medium_pacing: 1.25,
  low_pacing: 1.0,
};

export function getProfilePacingFactor(profile?: ContentProfileConfig): number {
  if (!profile) return 1.0;
  if (profile.id === 'documentary' || profile.id === 'industry_profile' || profile.id === 'tutorial') {
    return PACING_FACTOR_MAP.low_pacing;
  }
  const energy = profile.cameraEnergy || 'standard';
  const intensity = profile.engagementIntensity || 'medium';
  
  if (energy === 'dynamic' || intensity === 'high') {
    return PACING_FACTOR_MAP.high_pacing;
  }
  if (energy === 'standard' && intensity === 'medium') {
    return PACING_FACTOR_MAP.medium_pacing;
  }
  return PACING_FACTOR_MAP.low_pacing;
}

