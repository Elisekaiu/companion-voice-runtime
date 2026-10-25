// Public release ships without audio assets or a private clip map.
// Add your own licensed audio sprite and populate this catalog locally.
// Each item: { id, group, variant, offset, duration, intensity, placement }.
export const REAL_SFX_CATALOG=Object.freeze([]);

function group(name,variant){
  return Object.freeze(REAL_SFX_CATALOG.filter(x=>x.group===name&&x.variant===variant));
}

export const REAL_SFX_GROUPS=Object.freeze({
  kiss_single:group('kiss','single'),
  kiss_sequence:group('kiss','sequence'),
  breath_soft:group('breath','soft'),
  breath_restrained:group('breath','restrained'),
  breath_strong:group('breath','strong'),
  rhythm_medium:group('rhythm','medium'),
  rhythm_fast:group('rhythm','fast'),
  rhythm_faster:group('rhythm','faster'),
  rhythm_fastest:group('rhythm','fastest')
});
