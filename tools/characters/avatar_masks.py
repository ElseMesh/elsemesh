"""UV-specific tint zones in unused ORM red: 51 shirt,102 trousers,153 skin,204 hair.
Only for Rocketbox m014/f001. Original source textures are never modified.
Coordinates refer to the 512px source previews; nearest scaling keeps zone IDs exact.
The runtime uses these masks instead of tinting the whole character/eyes/shoes.
"""
from PIL import Image, ImageDraw
from pathlib import Path
import sys
root=Path(sys.argv[1]); prefix=sys.argv[2]
assert prefix in ('m014','f001')
for kind in ('body','head'):
    mask=Image.new('L',(512,512),0); d=ImageDraw.Draw(mask)
    if kind=='body' and prefix=='m014':
        d.rectangle((0,0,155,230),fill=102); d.rectangle((358,0,511,230),fill=102)
        d.rectangle((157,0,357,474),fill=51)
        d.rectangle((0,226,155,375),fill=51); d.rectangle((357,226,511,375),fill=51)
        d.polygon([(0,376),(122,376),(119,426),(105,438),(107,511),(0,511)],fill=153)
        d.polygon([(389,376),(511,376),(511,511),(405,511),(407,438),(392,426)],fill=153)
    elif kind=='body':
        d.rectangle((0,289,164,511),fill=102); d.rectangle((347,289,511,511),fill=102)
        d.rectangle((112,20,398,279),fill=51); d.rectangle((164,279,346,495),fill=51)
        d.rectangle((0,132,12,276),fill=51); d.rectangle((498,132,511,276),fill=51)
        d.rectangle((0,0,103,140),fill=153); d.rectangle((410,0,511,140),fill=153)
        d.rectangle((13,146,111,255),fill=153); d.rectangle((399,146,497,255),fill=153)
        d.polygon([(241,235),(272,235),(259,272)],fill=153)
    else:
        # Main face/neck island; eyes and mouth interiors below it retain their source colour.
        d.polygon([(0,0),(511,0),(511,310),(410,337),(300,420 if prefix=='f001' else 361),
                   (256,435 if prefix=='f001' else 379),(130,335),(0,295)],fill=153)
        if prefix=='m014':
            d.polygon([(0,0),(511,0),(511,222),(466,218),(424,194),(399,160),(365,153),
                       (347,104),(326,73),(283,61),(253,70),(209,68),(182,78),(168,101),
                       (155,156),(114,156),(100,184),(46,220),(0,222)],fill=204)
        else:
            d.polygon([(0,0),(511,0),(511,235),(479,215),(431,190),(401,163),(374,155),
                       (347,108),(315,71),(275,59),(241,65),(206,74),(180,96),(153,146),
                       (119,157),(101,180),(48,212),(0,237)],fill=204)
            d.polygon([(248,458),(279,415),(351,390),(419,393),(457,344),(499,314),
                       (511,331),(511,511),(248,511)],fill=204)
    orm=Image.open(root/f'{prefix}_{kind}_orm.jpg').convert('RGB')
    channels=list(orm.split()); channels[0]=mask.resize(orm.size,Image.Resampling.NEAREST)
    Image.merge('RGB',channels).save(root/f'{prefix}_{kind}_orm.png')
