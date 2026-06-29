import type { Project, ProductionBible, Script, Phase, Scene, VeoPrompt, VideoMetadata } from 'shared';
import { cleanTopicScaffolding } from 'shared';

function sanitizeContinuityNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  const lines = notes.split('\n');
  const cleanLines = lines.filter(line => {
    const lower = line.toLowerCase().trim();
    return !lower.includes('auto-removed unregistered object:') && !lower.includes('register in production bible if needed');
  });
  return cleanLines.join('\n').trim();
}

export interface ExportPackage {
  project: Project;
  bible: ProductionBible | null;
  script: Script | null;
  phases: Phase[];
  scenes: Scene[];
  prompts: VeoPrompt[];
  metadata?: VideoMetadata | null;
}

export const ExportService = {
  /**
   * Generates a nested JSON export payload.
   */
  exportJSON(pack: ExportPackage): string {
    const payload = {
      project: pack.project,
      production_bible: pack.bible ? JSON.parse(pack.bible.raw_json) : null,
      script: pack.script ? JSON.parse(pack.script.raw_json) : null,
      phases: pack.phases,
      scenes: pack.scenes.map((s) => ({ ...s, raw_json: undefined, parsed_data: JSON.parse(s.raw_json) })),
      // Contract: External TTS/ElevenLabs should ONLY dub fragments where narration_audio_source === 'elevenlabs_vo'; 'veo_on_camera' fragments already have spoken audio from Veo.
      veo_prompts: pack.prompts.map((p) => ({
        ...p,
        raw_json: undefined,
        parsed_data: JSON.parse(p.raw_json),
        narration_audio_source: JSON.parse(p.raw_json).narration_audio_source || 'elevenlabs_vo',
        spoken_on_camera: JSON.parse(p.raw_json).spoken_on_camera === true,
      })),
      youtube_metadata: pack.metadata ? JSON.parse(pack.metadata.raw_json) : null,
    };
    return JSON.stringify(payload, null, 2);
  },

  /**
   * Generates a formatted Markdown production notebook.
   */
  exportMarkdown(pack: ExportPackage): string {
    const { project, bible, phases, scenes, prompts } = pack;

    if (project.content_profile === 'cinematic_series') {
      let md = `# Cinematic Production Package: ${project.title}\n\n`;
      md += `**Topic:** ${cleanTopicScaffolding(project.topic)}\n`;
      md += `**Visual Style:** ${project.visual_style}\n`;
      md += `**Aspect Ratio:** ${project.aspect_ratio}\n`;
      md += `**Narration Language:** ${project.narration_language}\n`;
      md += `**Pacing Stage:** ${project.status.toUpperCase()}\n\n`;
      md += `*Generated via Cinematic Video Studio AI*\n\n`;
      md += `--- \n\n`;

      if (bible) {
        const bibleData = JSON.parse(bible.raw_json);
        md += `## 1. PRODUCTION REGISTRIES\n\n`;

        md += `### Creature/Monster Registry\n`;
        const creatures = bibleData.creature_registry || [];
        if (creatures.length > 0) {
          creatures.forEach((c: any) => {
            md += `- **${c.name}** (Size: ${c.size || 'N/A'}): ${c.description || c.physical_description || 'N/A'}. *Powers:* ${(c.powers || []).join(', ') || 'N/A'}\n`;
          });
        } else {
          md += `*No creatures registered.*\n`;
        }

        md += `\n### World/Location Locks\n`;
        const locations = bibleData.location_roster || [];
        if (locations.length > 0) {
          locations.forEach((loc: any) => {
            md += `- **${loc.name}** (${loc.type || 'exterior'}): ${loc.atmosphere || 'N/A'}. *Visual Lock:* ${loc.visual_signature || loc.description || 'N/A'}\n`;
          });
        } else {
          md += `*No locations locked.*\n`;
        }

        md += `\n### Weapon/Artifact Locks\n`;
        const weapons = bibleData.object_registry || [];
        if (weapons.length > 0) {
          weapons.forEach((obj: any) => {
            md += `- **${obj.name}**: ${obj.description || 'N/A'}. *Symbolic Significance:* ${obj.symbolic_meaning || 'N/A'}\n`;
          });
        } else {
          md += `*No weapons or artifacts locked.*\n`;
        }

        md += `\n### Character Roster\n`;
        const chars = bibleData.character_roster || [];
        chars.forEach((char: any) => {
          md += `- **${char.name}** (${char.role}): ${char.physical_description || char.description || 'N/A'}. *Costume Lock:* ${char.costume_description || 'N/A'}\n`;
        });
        md += `\n--- \n\n`;
      }

      md += `## 2. SCREENPLAY & SHOT BREAKDOWN\n\n`;
      phases.forEach((p) => {
        md += `### PHASE ${p.phase_number} (${p.phase_type.toUpperCase()}): ${p.phase_title.toUpperCase()}\n\n`;

        const phaseScenes = scenes.filter((s) => s.phase_number === p.phase_number);
        phaseScenes.forEach((s) => {
          const sData = JSON.parse(s.raw_json);
          const locationName = sData.location_id || 'LOC_001';
          const timeOfDay = sData.visual_state_snapshot?.time_of_day?.toUpperCase() || 'N/A';
          
          md += `#### SCENE ${s.scene_number}: ${s.title.toUpperCase()}\n`;
          md += `**${locationName} - ${timeOfDay}**\n\n`;

          md += `${s.scene_description || sData.scene_description}\n\n`;

          if (s.narration_fragment) {
            md += `    NARRATOR / VANCE\n`;
            md += `    (voiceover)\n`;
            md += `    "${s.narration_fragment}"\n\n`;
          }

          if (sData.dialogue && sData.dialogue !== 'None') {
            md += `    VANCE\n`;
            md += `    "${sData.dialogue}"\n\n`;
          }

          const cleanNotes = sanitizeContinuityNotes(s.continuity_notes);
          if (cleanNotes) {
            md += `*Continuity Note: ${cleanNotes}*\n\n`;
          }

          const pObj = prompts.find((pr) => pr.phase_number === p.phase_number && pr.scene_number === s.scene_number);
          if (pObj) {
            const pData = JSON.parse(pObj.raw_json);
            const globalIndex = prompts.findIndex((pr) => pr.id === pObj.id) + 1;
            md += `*Veo Prompt Formulation:*\n`;
            md += `> **Shot & Camera:** ${pData.shot} | ${pData.camera} | ${pData.lens}\n`;
            md += `> **Visual Description:** ${pData.visual}\n`;
            md += `> **Negative Avoid List:** \`${pData.avoid}\`\n\n`;
          }
          md += `\n`;
        });
      });

      if (pack.metadata) {
        const metaData = JSON.parse(pack.metadata.raw_json);
        md += `--- \n\n`;
        md += `## 3. Cinematic Marketing & Metadata\n\n`;
        
        md += `### Selected Title\n`;
        md += `**${pack.metadata.selected_title || (metaData.titles?.[0]?.text || 'N/A')}**\n\n`;

        md += `### Titles Table\n`;
        md += `| Title | Structure Type | Length |\n`;
        md += `| :--- | :--- | :--- |\n`;
        metaData.titles?.forEach((t: any) => {
          const isSelected = t.text === pack.metadata?.selected_title ? ' **(Selected)**' : '';
          md += `| ${t.text}${isSelected} | ${t.structure_type || 'cinematic'} | ${t.char_count} |\n`;
        });
        md += `\n`;

        md += `### Description & Logline\n`;
        let descWithChapters = pack.metadata.description || '';
        if (descWithChapters.includes('[CHAPTERS]')) {
          const chaptersList = metaData.chapters?.map((c: any) => `${c.timestamp} ${c.label}`).join('\n') || '';
          descWithChapters = descWithChapters.replace('[CHAPTERS]', chaptersList);
        }
        md += `${descWithChapters}\n\n`;

        md += `### Chapters\n`;
        metaData.chapters?.forEach((c: any) => {
          md += `- **${c.timestamp}** ${c.label}\n`;
        });
        md += `\n`;

        md += `### Tags\n`;
        md += `${metaData.tags?.join(', ')}\n\n`;

        md += `### Hashtags\n`;
        md += `${metaData.hashtags?.join(' ')}\n\n`;

        md += `### Thumbnail Hook\n`;
        md += `*${pack.metadata.thumbnail_hook || metaData.thumbnail_hook}*\n\n`;
      }

      return md;
    }

    const { project: pObj, prompts: promptsList } = pack;

    let md = `# Production Package: ${project.title}\n\n`;
    md += `**Topic:** ${cleanTopicScaffolding(project.topic)}\n`;
    md += `**Visual Style:** ${project.visual_style}\n`;
    md += `**Aspect Ratio:** ${project.aspect_ratio}\n`;
    md += `**Narration Language:** ${project.narration_language}\n`;
    md += `**Pacing Stage:** ${project.status.toUpperCase()}\n\n`;
    md += `*Generated via Viral Video Studio AI*\n\n`;
    md += `--- \n\n`;

    // Production Bible
    if (bible) {
      const bibleData = JSON.parse(bible.raw_json);
      md += `## 1. Production Bible\n\n`;
      
      md += `### Characters Roster\n`;
      bibleData.character_roster?.forEach((char: any) => {
        md += `- **${char.name}** (${char.role}): ${char.physical_description}. *Costume:* ${char.costume_description}. *Voice:* ${char.voice_tone}. *Significance:* ${char.significance}\n`;
      });
      
      md += `\n### Locations Roster\n`;
      bibleData.location_roster?.forEach((loc: any) => {
        md += `- **${loc.name}** (${loc.type}): ${loc.atmosphere}. *Lighting:* ${loc.lighting_notes}. *Signature:* ${loc.visual_signature}\n`;
      });

      md += `\n### Objects Registry\n`;
      bibleData.object_registry?.forEach((obj: any) => {
        md += `- **${obj.name}**: ${obj.description}. *Symbolic Meaning:* ${obj.symbolic_meaning}. *Screen Time:* ${obj.screen_time}\n`;
      });

      md += `\n### Visual Style Lock\n`;
      md += `- **Color Palette:** ${bibleData.visual_style_lock?.color_palette?.join(', ')}\n`;
      md += `- **Color Mood:** ${bibleData.visual_style_lock?.color_mood}\n`;
      md += `- **Lighting Style:** ${bibleData.visual_style_lock?.lighting_style}\n`;
      md += `- **Camera Movement Style:** ${bibleData.visual_style_lock?.camera_movement_style}\n`;
      md += `- **Film Grain:** ${bibleData.visual_style_lock?.film_grain ? 'Enabled' : 'Disabled'}\n`;
      md += `- **Veo Tokens:** ${bibleData.visual_style_lock?.veo_style_tokens?.join(', ')}\n`;
      md += `- **Avoid Items:** ${bibleData.visual_style_lock?.forbidden_elements?.join(', ')}\n\n`;
      md += `--- \n\n`;
    }

    // Scripts and Storyboard
    md += `## 2. Script & Visual Sequences\n\n`;
    phases.forEach((p) => {
      md += `### Phase ${p.phase_number} (${p.phase_type.toUpperCase()}): ${p.phase_title}\n`;
      md += `*Narrative Script:* ${p.phase_content}\n\n`;

      const phaseScenes = scenes.filter((s) => s.phase_number === p.phase_number);
      if (phaseScenes.length > 0) {
        md += `#### Scenes Storyboard Breakdown:\n\n`;
        phaseScenes.forEach((s) => {
          const sData = JSON.parse(s.raw_json);
          md += `##### Scene ${s.scene_number}: ${s.title}\n`;
          md += `- **Visual Framing:** ${s.scene_description}\n`;
          const narrationText = s.narration_fragment ? `*"${s.narration_fragment}"*` : '(Silent B-Roll)';
          md += `- **Narration Fragment:** ${narrationText}\n`;
          const cleanNotes = sanitizeContinuityNotes(s.continuity_notes);
          if (cleanNotes) {
            md += `- **Continuity Notes:** ${cleanNotes}\n`;
          }
          md += `- **Emotional Beat:** ${sData.emotional_beat} | **Transition:** ${sData.transition_to_next}\n`;

          const pObj = prompts.find((pr) => pr.phase_number === p.phase_number && pr.scene_number === s.scene_number);
          if (pObj) {
            const pData = JSON.parse(pObj.raw_json);
            const globalIndex = prompts.findIndex((pr) => pr.id === pObj.id) + 1;
            md += `\n*Veo Prompt Formulation:*\n`;
            md += `> **Prompt Number:** Prompt ${globalIndex}\n`;
            md += `> **Unified Prompt:** \`${pData.veo_full_prompt}\`\n`;
            if (pData.overlay_suggestions && pData.overlay_suggestions.length > 0) {
              md += `> **Post-Production Overlays:**\n`;
              pData.overlay_suggestions.forEach((suggest: any) => {
                const targetStr = suggest.target ? ` (Target: ${suggest.target})` : '';
                const timingStr = suggest.timing ? ` [${suggest.timing}]` : '';
                md += `> - **[${suggest.type.toUpperCase()}]** ${suggest.text}${targetStr}${timingStr}\n`;
              });
            }
          }
          md += `\n`;
        });
      }
      md += `\n`;
    });

    if (pack.metadata) {
      const metaData = JSON.parse(pack.metadata.raw_json);
      md += `--- \n\n`;
      md += `## 3. YouTube Metadata\n\n`;
      
      md += `### Selected Title\n`;
      md += `**${pack.metadata.selected_title || (metaData.titles?.[0]?.text || 'N/A')}**\n\n`;

      md += `### Titles Table\n`;
      md += `| Title | Structure Type | Length |\n`;
      md += `| :--- | :--- | :--- |\n`;
      metaData.titles?.forEach((t: any) => {
        const isSelected = t.text === pack.metadata?.selected_title ? ' **(Selected)**' : '';
        md += `| ${t.text}${isSelected} | ${t.structure_type} | ${t.char_count} |\n`;
      });
      md += `\n`;

      md += `### Description\n`;
      let descWithChapters = pack.metadata.description || '';
      if (descWithChapters.includes('[CHAPTERS]')) {
        const chaptersList = metaData.chapters?.map((c: any) => `${c.timestamp} ${c.label}`).join('\n') || '';
        descWithChapters = descWithChapters.replace('[CHAPTERS]', chaptersList);
      }
      md += `${descWithChapters}\n\n`;

      md += `### Chapters\n`;
      metaData.chapters?.forEach((c: any) => {
        md += `- **${c.timestamp}** ${c.label}\n`;
      });
      md += `\n`;

      md += `### Tags\n`;
      md += `${metaData.tags?.join(', ')}\n\n`;

      md += `### Hashtags\n`;
      md += `${metaData.hashtags?.join(' ')}\n\n`;

      md += `### Thumbnail Hook\n`;
      md += `*${pack.metadata.thumbnail_hook || metaData.thumbnail_hook}*\n\n`;
    }

    return md;
  },

  /**
   * Generates a plain text narration script.
   */
  exportTXT(pack: ExportPackage): string {
    const { project, bible, phases, scenes, prompts } = pack;

    if (project.content_profile === 'cinematic_series') {
      let txt = '';
      if (pack.metadata) {
        const metaData = JSON.parse(pack.metadata.raw_json);
        const selTitle = pack.metadata.selected_title || (metaData.titles?.[0]?.text || 'N/A');
        const thumbHook = pack.metadata.thumbnail_hook || (metaData.thumbnail_hook || 'N/A');
        txt += `=== CINEMATIC METADATA ===\n`;
        txt += `Selected Title: ${selTitle}\n`;
        txt += `Poster Hook: ${thumbHook}\n\n`;
      }

      txt += `=== SCREENPLAY: ${project.title} ===\n`;
      txt += `Topic: ${cleanTopicScaffolding(project.topic)}\n`;
      txt += `Style: ${project.visual_style}\n\n`;

      if (bible) {
        const bibleData = JSON.parse(bible.raw_json);
        txt += `==================================================\n`;
        txt += `PRODUCTION REGISTRIES\n`;
        txt += `==================================================\n\n`;
        
        txt += `CREATURE REGISTRY:\n`;
        const creatures = bibleData.creature_registry || [];
        creatures.forEach((c: any) => {
          txt += `- ${c.name} (Size: ${c.size || 'N/A'}): ${c.description || c.physical_description || 'N/A'}. Powers: ${(c.powers || []).join(', ')}\n`;
        });
        
        txt += `\nWORLD/LOCATION LOCKS:\n`;
        const locations = bibleData.location_roster || [];
        locations.forEach((loc: any) => {
          txt += `- ${loc.name} (${loc.type || 'exterior'}): ${loc.atmosphere || 'N/A'}. Lock: ${loc.visual_signature || 'N/A'}\n`;
        });

        txt += `\nWEAPON/ARTIFACT LOCKS:\n`;
        const weapons = bibleData.object_registry || [];
        weapons.forEach((obj: any) => {
          txt += `- ${obj.name}: ${obj.description || 'N/A'}. Significance: ${obj.symbolic_meaning || 'N/A'}\n`;
        });
        txt += `\n==================================================\n\n`;
      }

      txt += `==================================================\n`;
      txt += `SCREENPLAY & DIALOGUE\n`;
      txt += `==================================================\n\n`;

      phases.forEach((p) => {
        txt += `PHASE ${p.phase_number}: ${p.phase_title.toUpperCase()}\n\n`;
        const phaseScenes = scenes.filter((s) => s.phase_number === p.phase_number);
        phaseScenes.forEach((s) => {
          const sData = JSON.parse(s.raw_json);
          const locationName = sData.location_id || 'LOC_001';
          const timeOfDay = sData.visual_state_snapshot?.time_of_day?.toUpperCase() || 'N/A';

          txt += `SCENE ${s.scene_number} - ${s.title.toUpperCase()}\n`;
          txt += `${locationName} - ${timeOfDay}\n\n`;
          txt += `${s.scene_description || sData.scene_description}\n\n`;

          if (s.narration_fragment) {
            txt += `    NARRATOR / VANCE\n`;
            txt += `    (voiceover)\n`;
            txt += `    "${s.narration_fragment}"\n\n`;
          }

          if (sData.dialogue && sData.dialogue !== 'None') {
            txt += `    VANCE\n`;
            txt += `    "${sData.dialogue}"\n\n`;
          }

          const cleanNotes = sanitizeContinuityNotes(s.continuity_notes);
          if (cleanNotes) {
            txt += `  [Continuity: ${cleanNotes}]\n\n`;
          }
        });
        txt += `\n`;
      });

      txt += `==================================================\n`;
      txt += `VEO CAMERA PROMPTS LIST\n`;
      txt += `==================================================\n\n`;

      prompts.forEach((vp, idx) => {
        const pData = JSON.parse(vp.raw_json);
        txt += `Prompt ${idx + 1} :\n`;
        txt += `Visual: ${pData.visual || ''}\n`;
        txt += `Lens: ${pData.lens || ''}\n`;
        txt += `Lighting: ${pData.lighting || ''}\n`;
        txt += `Camera: ${pData.camera || ''}\n`;
        txt += `Dialogue: ${pData.dialogue || 'None'}\n`;
        txt += `Avoid: ${pData.avoid || ''}\n\n`;
      });

      return txt;
    }

    let txt = '';
    if (pack.metadata) {
      const metaData = JSON.parse(pack.metadata.raw_json);
      const selTitle = pack.metadata.selected_title || (metaData.titles?.[0]?.text || 'N/A');
      const thumbHook = pack.metadata.thumbnail_hook || (metaData.thumbnail_hook || 'N/A');
      txt += `=== YOUTUBE METADATA ===\n`;
      txt += `Selected Title: ${selTitle}\n`;
      txt += `Thumbnail Hook: ${thumbHook}\n\n`;
    }

    txt += `=== SCRIPT BOOKLET: ${project.title} ===\n`;
    txt += `Topic: ${cleanTopicScaffolding(project.topic)}\n`;
    txt += `Style: ${project.visual_style}\n\n`;
    txt += `==================================================\n`;
    txt += `FULL NARRATION VOICEOVER\n`;
    txt += `==================================================\n\n`;

    phases.forEach((p) => {
      txt += `Phase ${p.phase_number} [${p.phase_type.toUpperCase()}]: ${p.phase_title}\n`;
      txt += `${p.phase_content}\n\n`;
    });

    txt += `==================================================\n`;
    txt += `VEO CAMERA PROMPTS LIST\n`;
    txt += `==================================================\n\n`;

    prompts.forEach((vp, idx) => {
      const pData = JSON.parse(vp.raw_json);
      const dialogueVal = pData.dialogue || 'None';
      txt += `Prompt ${idx + 1} :\n`;
      txt += `Visual: ${pData.visual || ''}\n`;
      txt += `Lens: ${pData.lens || ''}\n`;
      txt += `Lighting: ${pData.lighting || ''}\n`;
      txt += `Camera: ${pData.camera || ''}\n`;
      txt += `Sound:\n`;
      txt += `  Ambient: ${pData.ambient_sound || ''}\n`;
      txt += `  SFX: ${pData.sfx || ''}\n`;
      txt += `  Dialogue: ${dialogueVal}\n`;
      txt += `Avoid: ${pData.avoid || ''}\n`;
      txt += `Connection: ${pData.connection || ''}\n`;
      txt += `Narration: ${pData.narration || ''}\n`;
      if (pData.overlay_suggestions && pData.overlay_suggestions.length > 0) {
        txt += `Overlays:\n`;
        pData.overlay_suggestions.forEach((suggest: any) => {
          const targetStr = suggest.target ? ` (Target: ${suggest.target})` : '';
          const timingStr = suggest.timing ? ` [${suggest.timing}]` : '';
          txt += `  - [${suggest.type.toUpperCase()}] ${suggest.text}${targetStr}${timingStr}\n`;
        });
      }
      txt += `\n`;
    });

    return txt;
  },

  /**
   * Generates flat CSV rows of Veo Prompts mapping variables.
   */
  exportCSV(pack: ExportPackage): string {
    const headers = [
      'prompt_number',
      'phase',
      'scene',
      'visual',
      'shot',
      'lens',
      'lighting',
      'camera',
      'ambient_sound',
      'sfx',
      'dialogue',
      'avoid',
      'narration',
      'full_prompt',
    ];

    let csv = headers.map((h) => `"${h}"`).join(',') + '\n';

    pack.prompts.forEach((vp) => {
      const pData = JSON.parse(vp.raw_json);
      
      const row = [
        pData.prompt_number,
        vp.phase_number.toString(),
        vp.scene_number.toString(),
        pData.visual,
        pData.shot,
        pData.lens,
        pData.lighting,
        pData.camera,
        pData.ambient_sound,
        pData.sfx,
        pData.dialogue || 'None.',
        pData.avoid,
        pData.narration,
        pData.veo_full_prompt,
      ].map((val) => {
        // Escape quotes
        const clean = (val || '').replace(/"/g, '""');
        return `"${clean}"`;
      });

      csv += row.join(',') + '\n';
    });

    return csv;
  },
};
