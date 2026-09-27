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

export function makeRetroScreenMaterial(spec) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = css(spec.border);
  ctx.fillRect(0, 0, 512, 384);
  ctx.fillStyle = css(spec.background);
  ctx.fillRect(22, 18, 468, 348);

  ctx.fillStyle = css(spec.foreground);
  ctx.font = spec.id === 'sun' ? 'bold 25px monospace' : 'bold 27px monospace';
  ctx.textBaseline = 'top';

  if (spec.windows) {
    // Keep the shared descriptor heading above the desktop; window contents are
    // drawn separately so generic line rows cannot overwrite either title bar.
    ctx.fillText(spec.lines[0], 40, 35);
    ctx.fillStyle = '#aebfc0';
    ctx.fillRect(52, 76, 276, 218);
    ctx.fillStyle = '#334143';
    ctx.fillRect(52, 76, 276, 25);
    ctx.fillStyle = '#d5dfdc';
    ctx.fillRect(196, 132, 260, 190);
    ctx.fillStyle = '#344244';
    ctx.fillRect(196, 132, 260, 25);
    ctx.strokeStyle = '#263234';
    ctx.lineWidth = 4;
    ctx.strokeRect(52, 76, 276, 218);
    ctx.strokeRect(196, 132, 260, 190);
    ctx.fillStyle = '#66797b';
    for (let y = 120; y < 270; y += 34) ctx.fillRect(76, y, 86, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('File Manager', 68, 79);
    ctx.fillText('Terminal', 212, 135);
    ctx.fillStyle = '#1b2324';
    ctx.font = '20px monospace';
    ctx.fillText('$ openwin', 216, 174);
    spec.lines.slice(1).forEach((line, row) => ctx.fillText(line, 216, 208 + row * 28));
  } else {
    spec.lines.forEach((line, row) => ctx.fillText(line, 40, 35 + row * 48));
  }
  const texture = new Texture({
    label: `${spec.id.toUpperCase()} generated display`,
    width: canvas.width, height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
  });

  let cursor = '';
  if (spec.cursor?.blink) {
    const x0 = (40 + spec.cursor.column * 17) / 512;
    const x1 = x0 + 15 / 512;
    // Texture sampling flips canvas Y, so cursor bounds are expressed in shader UV.
    const top = 35 + spec.cursor.row * 48;
    const y0 = 1 - (top + 28) / 384;
    const y1 = 1 - top / 384;
    const c = spec.cursor.color;
    const rgb = [16, 8, 0].map(shift => ((c >> shift) & 255) / 255);
    cursor = `let cursor=step(${x0.toFixed(5)},in.uv.x)*step(in.uv.x,${x1.toFixed(5)})*step(${y0.toFixed(5)},in.uv.y)*step(in.uv.y,${y1.toFixed(5)})*step(fract(frame.time),0.5); ink=mix(ink,vec3f(${rgb.map(v => v.toFixed(4)).join(',')}),cursor);`;
  }
  return standard({
    name: `${spec.id.toUpperCase()} decorative display`, color: 0xffffff, roughness: .35,
    emissive: 0xffffff, emissiveIntensity: .22, textures: { retroDisplay: texture },
    surface: `var ink=textureSample(retroDisplay,smpAnisoClamp,vec2f(in.uv.x,1.0-in.uv.y)).rgb; ${cursor} s.albedo=ink; s.emissive=ink*.38;`
  });
}
