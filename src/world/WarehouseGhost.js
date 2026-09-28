export const ESMIE_INTRO = `My name is Esmie, from Edinburgh. Long before these islands had names on charts, ships were drawn onto the reefs by lights that nobody tended. Their bells still sound beneath the winter tide. Some carried coin, some carried letters, and one carried a map to treasure hidden under the black stone. Every island keeps a different part of the story. Listen carefully. The sea remembers all of them. My mother warned me that treasure never lies quiet. It calls through dreams, and those who answer return carrying salt in their lungs.`;

export const ESMIE_MEMORIES = Object.freeze([
  { id:'memory-royal-mile', text:`When I was a girl in Edinburgh, I counted the closes along the Royal Mile while rain shone on the old stones. One doorway always felt colder than the rest.` },
  { id:'memory-calton-hill', text:`I remember the wind at Calton Hill, lifting my scarf while the city lamps came on below. The sea looked near enough to walk to.` },
  { id:'memory-castle', text:`On winter afternoons I watched the shadow of Edinburgh Castle cross Princes Street Gardens, and wondered whose footsteps were buried beneath mine.` },
  { id:'memory-water-of-leith', text:`My father took me to the Water of Leith after rain. He said every river carries a secret to the sea, if it is allowed to travel far enough.` },
  { id:'memory-greyfriars', text:`In Greyfriars Kirkyard I once heard a small bell after midnight. There was no wind, and no living hand near the rope.` },
  { id:'memory-arthurs-seat', text:`At Arthur's Seat the gorse smelled bright in summer. From the summit I imagined islands beyond the Firth of Forth, waiting with their lights extinguished.` },
  { id:'memory-waverley', text:`I used to shelter beneath the great roof of Waverley Station and listen to departures. I thought every train might carry me to a kinder coast.` },
]);

export class WarehouseGhost {
  constructor(app) {
    this.app=app; this.elapsed=0; this.introSpoken=false;
    this.quoteElapsed=0; this.lastMemory=-1; this.speaking=false; this.voice=null;
  }
  stop() {
    if(this.voice){this.voice.pause();this.voice.removeAttribute('src');this.voice.load();this.voice=null;}
    this.speaking=false;
  }
  chooseMemory() {
    let index=Math.floor(Math.random()*ESMIE_MEMORIES.length);
    if(ESMIE_MEMORIES.length>1&&index===this.lastMemory)index=(index+1)%ESMIE_MEMORIES.length;
    this.lastMemory=index;return ESMIE_MEMORIES[index];
  }
  speak(id) {
    this.stop();if(this.app.audio?.muted)return;
    const voice=this.voice=new Audio((import.meta.env.BASE_URL||'/')+'audio/esmie/'+id+'.wav');
    voice.preload='auto';voice.volume=.28;
    voice.onended=voice.onerror=()=>{if(this.voice===voice){this.voice=null;this.speaking=false;}};
    this.speaking=true;voice.play().catch(()=>{if(this.voice===voice){this.voice=null;this.speaking=false;}});
  }
  update(dt) {
    if(document.hidden){if(this.speaking)this.stop();return;}
    if(this.voice)this.voice.volume=this.app.audio?.muted?0:.28;
    this.elapsed+=dt;
    if(!this.introSpoken&&this.elapsed>=60){this.introSpoken=true;this.quoteElapsed=0;this.speak('intro');}
    else if(this.introSpoken&&!this.speaking){this.quoteElapsed+=dt;if(this.quoteElapsed>=300){this.quoteElapsed=0;this.speak(this.chooseMemory().id);}}
  }
}
