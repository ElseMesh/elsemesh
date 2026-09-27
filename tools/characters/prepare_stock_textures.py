"""Prepare Rocketbox source textures with Pillow; source files remain untouched."""
from pathlib import Path
from PIL import Image, ImageOps
import sys
source, target = map(Path, sys.argv[1:3])
target.mkdir(parents=True, exist_ok=True)
for kind in ('body', 'head'):
    for channel in ('color', 'normal'):
        im = Image.open(source / f'm014_{kind}_{channel}.tga').convert('RGB')
        im.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        im.save(target / f'm014_{kind}_{channel}.jpg', quality=92)
    spec = ImageOps.grayscale(Image.open(source / f'm014_{kind}_specular.tga'))
    spec.thumbnail((1024,1024), Image.Resampling.LANCZOS)
    rough = spec.point(lambda v: int(255*.92 - .6*v))
    Image.merge('RGB',(Image.new('L',spec.size,255),rough,Image.new('L',spec.size,0))).save(target/f'm014_{kind}_orm.jpg',quality=92)
im=Image.open(source/'m014_opacity_color.tga').convert('RGBA')
im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
im.save(target/'m014_opacity.png')
