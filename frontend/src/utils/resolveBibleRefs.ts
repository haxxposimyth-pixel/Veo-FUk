import type { ProductionBibleData } from 'shared';

export function resolveBibleRefs(
  text: string | undefined | null,
  bible: ProductionBibleData | null | undefined
): string {
  if (!text || !bible) return text || '';
  
  let resolved = text;
  
  // Resolve character IDs
  bible.character_roster?.forEach(char => {
    if (char.id && char.name) {
      const regex = new RegExp(char.id, 'g');
      resolved = resolved.replace(regex, char.name);
    }
  });
  
  // Resolve location IDs
  bible.location_roster?.forEach(loc => {
    if (loc.id && loc.name) {
      const regex = new RegExp(loc.id, 'g');
      resolved = resolved.replace(regex, loc.name);
    }
  });
  
  // Resolve object IDs
  bible.object_registry?.forEach(obj => {
    if (obj.id && obj.name) {
      const regex = new RegExp(obj.id, 'g');
      resolved = resolved.replace(regex, obj.name);
    }
  });
  
  return resolved;
}
