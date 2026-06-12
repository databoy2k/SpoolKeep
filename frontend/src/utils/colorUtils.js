export const getColorNameFromHex = (hex) => {
  const colourMap = {
    '#1e272e': 'Black', '#f5f6fa': 'White', '#718093': 'Grey',
    '#dcdde1': 'Silver', '#f5cd79': 'Gold', '#cd7f32': 'Bronze', '#b87333': 'Copper',
    '#e84118': 'Red', '#0097e6': 'Blue', '#44bd32': 'Green', '#e1b12c': 'Yellow',
    '#e67e22': 'Orange', '#9b59b6': 'Purple', '#fd79a8': 'Pink', '#8d6e63': 'Brown',
    '#dff9fb': 'Clear', '#2ecc71': 'Neon Green',
    '#f1c40f': 'Neon Yellow', '#00a8ff': 'Teal', '#9c88ff': 'Cyan', '#e056fd': 'Magenta',
    '#55efc4': 'Olive'
  };
  const cleanHex = (hex || '').trim().toLowerCase();
  return colourMap[cleanHex] || 'Generic';
};

// Color conversion helpers (HEX <-> HSL) for custom color picker
export const hexToHsl = (hex) => {
  let clean = (hex || '').trim().replace('#', '');
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length !== 6) {
    return { h: 148, s: 38, l: 32 }; // default to #337150 HSL
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else if (max === b) {
      h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
};

export const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;

  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0');
  const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0');
  const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`.toLowerCase();
};

export const getColourFamily = (hex) => {
  const { h, s, l } = hexToHsl(hex);
  if (l < 12) return 'Black';
  if (l > 85 && s < 20) return 'White';
  if (s < 18) return 'Grey';
  if (h >= 15 && h < 50 && l >= 15 && l < 60 && (l < 30 || s < 60)) return 'Brown';
  if (l < 15) return 'Dark';
  if (h < 15 || h >= 345) return 'Red';
  if (h < 50) return 'Orange';
  if (h < 70) return 'Yellow';
  if (h < 160) return 'Green';
  if (h < 250) return 'Blue';
  return 'Violet';
};
