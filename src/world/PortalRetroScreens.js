import { Texture } from '../engine/gpu/Texture.js';
import { standard } from '../materials/Materials.js';

const css = value => `#${value.toString(16).padStart(6, '0')}`;

// Original, programmatically drawn decorative displays. The recipe supplies all
// wording/colours so this renderer and the Blender exporter share one descriptor.
export function makeRetroNameplateMaterial(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#e7dcc3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#4a4035';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = '#211d18';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new Texture({
    label: `${label} generated nameplate`,
    width: canvas.width, height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
  });
  return standard({
    name: `${label} readable nameplate`, color: 0xffffff, roughness: .7,
    textures: { retroNameplate: texture },
    surface: 'let ink=textureSample(retroNameplate,smpAnisoClamp,vec2f(in.uv.x,1.0-in.uv.y)).rgb; s.albedo=ink;'
  });
}

function drawSunDesktop(ctx, width, height) {
  const sx = width / 1536;
  const sy = height / 1152;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#a7aaa5';
  ctx.fillRect(54, 48, 1428, 1056);

  // OpenWindows desktop header and pinned workspace tools.
  ctx.fillStyle = '#d8dad5';
  ctx.fillRect(54, 48, 1428, 52);
  ctx.strokeStyle = '#313735';
  ctx.lineWidth = 4;
  ctx.strokeRect(54, 48, 1428, 52);
  ctx.fillStyle = '#202523';
  ctx.font = 'bold 25px monospace';
  ctx.fillText('OpenWindows', 78, 61);
  ctx.font = '21px monospace';
  ctx.fillText('Workspace   Programs   Utilities', 320, 64);
  ctx.fillText('SunOS 4.1.3', 1260, 64);

  const windowFrame = (x, y, w, h, title) => {
    ctx.fillStyle = '#e5e6e1';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#252b29';
    ctx.lineWidth = 5;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#59615e';
    ctx.fillRect(x, y, w, 48);
    ctx.fillStyle = '#f5f6f1';
    ctx.font = 'bold 30px monospace';
    ctx.fillText(title, x + 58, y + 8);
    ctx.strokeStyle = '#eef0eb';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 12, y + 11, 25, 25);
  };

  windowFrame(105, 145, 790, 650, 'File Manager - /home/demo');
  ctx.save();
  ctx.beginPath();
  ctx.rect(110, 198, 780, 592);
  ctx.clip();
  ctx.fillStyle = '#c5c8c2';
  ctx.fillRect(125, 215, 735, 43);
  ctx.fillStyle = '#202523';
  ctx.font = '20px monospace';
  ctx.fillText('File   View   Edit   Go', 146, 225);
  const folders = [
    [180, 315, 'Documents'], [410, 315, 'Projects'], [640, 315, 'Mail'],
    [180, 520, 'Calendar'], [410, 520, 'Demos'], [640, 520, 'System']
  ];
  for (const [x, y, label] of folders) {
    ctx.fillStyle = '#d9c46e';
    ctx.fillRect(x, y + 22, 112, 76);
    ctx.fillRect(x + 12, y, 48, 28);
    ctx.strokeStyle = '#554d2d';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y + 22, 112, 76);
    ctx.fillStyle = '#202523';
    ctx.font = '19px monospace';
    ctx.fillText(label, x - 3, y + 113);
  }
  ctx.fillStyle = '#b8bbb5';
  ctx.fillRect(855, 263, 19, 475);
  ctx.fillStyle = '#626965';
  ctx.fillRect(858, 340, 13, 145);
  ctx.fillStyle = '#202523';
  ctx.font = '18px monospace';
  ctx.fillText('6 objects     24 MB available', 140, 753);
  ctx.restore();

  // The terminal is deliberately rebuilt with short fitted rows, not descriptor text.
  windowFrame(630, 430, 780, 565, 'Terminal - shelltool');
  ctx.save();
  ctx.beginPath();
  ctx.rect(635, 483, 770, 507);
  ctx.clip();
  ctx.fillStyle = '#f4f5ef';
  ctx.fillRect(650, 498, 735, 470);
  ctx.fillStyle = '#151a18';
  ctx.font = 'bold 30px monospace';
  const terminal = [
    'SunOS 4.1.3 (GENERIC)',
    'demo@warehouse% pwd',
    '/home/demo',
    'demo@warehouse% ls -F',
    'Calendar/ Demos/ Documents/',
    'Mail/ Projects/',
    'demo@warehouse% uptime',
    'up 12 days, load 0.08',
    'demo@warehouse% _'
  ];
  terminal.forEach((line, row) => ctx.fillText(line, 675, 520 + row * 42));
  ctx.fillStyle = '#b8bbb5';
  ctx.fillRect(1364, 510, 15, 430);
  ctx.fillStyle = '#626965';
  ctx.fillRect(1366, 565, 11, 122);
  ctx.restore();
}

export function makeRetroScreenMaterial(spec) {
  const canvas = document.createElement('canvas');
  canvas.width = spec.width || 1024;
  canvas.height = spec.height || 768;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  if (spec.id === 'sun') {
    ctx.fillStyle = css(spec.border);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawSunDesktop(ctx, canvas.width, canvas.height);
  } else {
    const scaleX = canvas.width / 1024;
    const scaleY = canvas.height / 768;
    ctx.fillStyle = css(spec.border);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = css(spec.background);
    ctx.fillRect(42 * scaleX, 36 * scaleY, 940 * scaleX, 696 * scaleY);
    ctx.fillStyle = css(spec.foreground);
    ctx.font = `bold ${54 * scaleY}px monospace`;
    ctx.textBaseline = 'top';
    spec.lines.forEach((line, row) => ctx.fillText(line, 80 * scaleX, (70 + row * 96) * scaleY));
  }

  const texture = new Texture({
    label: `${spec.id.toUpperCase()} generated display`,
    width: canvas.width, height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
  });

  let cursor = '';
  if (spec.cursor?.blink) {
    const x0 = (80 + spec.cursor.column * 34) / 1024;
    const x1 = x0 + 30 / 1024;
    const top = 70 + spec.cursor.row * 96;
    const y0 = 1 - (top + 56) / 768;
    const y1 = 1 - top / 768;
    const c = spec.cursor.color;
    const rgb = [16, 8, 0].map(shift => ((c >> shift) & 255) / 255);
    cursor = `let cursor=step(${x0.toFixed(5)},in.uv.x)*step(in.uv.x,${x1.toFixed(5)})*step(${y0.toFixed(5)},in.uv.y)*step(in.uv.y,${y1.toFixed(5)})*step(fract(frame.time),0.5); ink=mix(ink,vec3f(${rgb.map(v => v.toFixed(4)).join(',')}),cursor);`;
  }
  return standard({
    name: `${spec.id.toUpperCase()} decorative display`, color: 0xffffff, roughness: .35, lit: false,
    textures: { retroDisplay: texture },
    surface: `var ink=textureSample(retroDisplay,smpAnisoClamp,vec2f(in.uv.x,1.0-in.uv.y)).rgb; ${cursor} s.albedo=ink;`
  });
}

export function makeKeyboardLegendMaterial(id) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = id === 'sun' ? '#342b46' : id === 'c64' ? '#efe0bb' : '#f4e8cf';
  const atlasWidth = id === 'sun' ? .74 : .66;
  const canvasX = localX => (.5 - localX / atlasWidth) * canvas.width;
  const canvasY = z => (8.34 - z) / .34 * canvas.height;
  const keyRows = [
    ['1','2','3','4','5','6','7','8','9','0','-','=','DEL'],
    ['Q','W','E','R','T','Y','U','I','O','P','[',']','\\','TAB'],
    ['A','S','D','F','G','H','J','K','L',';','"','RETURN','CTRL'],
    ['SHIFT','Z','X','C','V','B','N','M',',','.','/','SHIFT']
  ];
  const rowSpecs = [
    { count: id === 'sun' ? 14 : 13, z: 8.27, offset: 0 },
    { count: 14, z: 8.21, offset: .015 },
    { count: 13, z: 8.15, offset: .032 },
    { count: 12, z: 8.09, offset: .052 }
  ];
  const keyLabelWidth = .042 / atlasWidth * canvas.width;
  rowSpecs.forEach((row, r) => {
    const labels = Array.from({ length: row.count }, (_, k) => keyRows[r][k] || 'ESC');
    const start = -(row.count - 1) * .048 / 2 + row.offset;
    for (let k = 0; k < row.count; k++) {
      ctx.fillText(labels[row.count - 1 - k], canvasX(start + k * .048), canvasY(row.z), keyLabelWidth);
    }
  });
  const functionCount = id === 'sun' ? 10 : 8;
  for (let k = 0; k < functionCount; k++) {
    ctx.fillText(`F${functionCount - k}`, canvasX(-.25 + k * .056), canvasY(8.32), keyLabelWidth);
  }
  ctx.font = 'bold 20px monospace';
  ctx.fillText('SPACE', canvasX(0), canvasY(8.03), .19 / atlasWidth * canvas.width);
  ctx.fillText('SHIFT', canvasX(-.285), canvasY(8.03), .08 / atlasWidth * canvas.width);
  ctx.fillText('RETURN', canvasX(.3), canvasY(8.115), .08 / atlasWidth * canvas.width);
  const texture = new Texture({
    label: `${id.toUpperCase()} immutable keyboard legends`,
    width: canvas.width, height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
  });
  return standard({
    name: `${id.toUpperCase()} keyboard legend atlas`, color: 0xffffff, roughness: .7, lit: false, transparent: true,
    textures: { keyboardLegend: texture },
    surface: 'let ink=textureSample(keyboardLegend,smpAnisoClamp,vec2f(1.0-in.uv.x,in.uv.y)); s.albedo=ink.rgb; s.opacity=ink.a;'
  });
}
