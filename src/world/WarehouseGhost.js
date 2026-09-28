export const ESMIE_INTRO = `My name is Esmie, from Edinburgh. Long before these islands had names on charts, ships were drawn onto the reefs by lights that nobody tended. Their bells still sound beneath the winter tide. Some carried coin, some carried letters, and one carried a map to treasure hidden under the black stone. Every island keeps a different part of the story. Listen carefully. The sea remembers all of them.`;

export const ESMIE_MEMORIES = Object.freeze([
  `When I was a girl in Edinburgh, I counted the closes along the Royal Mile while rain shone on the old stones. One doorway always felt colder than the rest.`,
  `I remember the wind at Calton Hill, lifting my scarf while the city lamps came on below. The sea looked near enough to walk to.`,
  `On winter afternoons I watched the shadow of Edinburgh Castle cross Princes Street Gardens, and wondered whose footsteps were buried beneath mine.`,
  `My father took me to the Water of Leith after rain. He said every river carries a secret to the sea, if it is allowed to travel far enough.`,
  `In Greyfriars Kirkyard I once heard a small bell after midnight. There was no wind, and no living hand near the rope.`,
  `At Arthur's Seat the gorse smelled bright in summer. From the summit I imagined islands beyond the Firth of Forth, waiting with their lights extinguished.`,
  `I used to shelter beneath the great roof of Waverley Station and listen to departures. I thought every train might carry me to a kinder coast.`,
]);

const estimateDuration = text => Math.max(8, Math.min(38, text.split(/\s+/).length / 2.15));

export class WarehouseGhost {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.elapsed = 0;
    this.introSpoken = false;
    this.quoteElapsed = 0;
    this.lastMemory = -1;
    this.speaking = false;
    this.captionUntil = 0;
    this.clock = 0;
    this.caption = document.createElement('aside');
    this.caption.className = 'bh-esmie-caption';
    this.caption.hidden = true;
    this.caption.innerHTML = `<style>
      .bh-esmie-caption{position:fixed;left:50%;bottom:8vh;z-index:55;transform:translateX(-50%);width:min(680px,86vw);padding:15px 42px 15px 19px;border:1px solid #bed5d055;border-radius:15px;background:#091317d9;color:#dce9e8;box-shadow:0 12px 44px #000b;backdrop-filter:blur(10px);font:italic 16px/1.45 Georgia,serif;text-shadow:0 0 12px #b9eee788}
      .bh-esmie-caption strong{display:block;color:#c7eee7;font:600 12px/1.4 system-ui;letter-spacing:.18em;text-transform:uppercase;margin-bottom:5px}.bh-esmie-caption button{position:absolute;right:11px;top:10px;border:0;background:transparent;color:#dce9e8;font:22px system-ui;cursor:pointer}
    </style><strong>Esmie · a voice in the warehouse</strong><span></span><button aria-label="Dismiss Esmie caption">×</button>`;
    this.caption.querySelector('button').onclick = () => { this.caption.hidden = true; };
    document.body.append(this.caption);
  }

  setActive(active) {
    if (active && !this.active) {
      this.elapsed = 0;
      this.quoteElapsed = 0;
    }
    this.active = active;
    if (!active) {
      this.caption.hidden = true;
      if (this.speaking) globalThis.speechSynthesis?.cancel();
      this.speaking = false;
    }
  }

  chooseMemory() {
    let index = Math.floor(Math.random() * ESMIE_MEMORIES.length);
    if (ESMIE_MEMORIES.length > 1 && index === this.lastMemory) index = (index + 1) % ESMIE_MEMORIES.length;
    this.lastMemory = index;
    return ESMIE_MEMORIES[index];
  }

  speak(text) {
    this.caption.querySelector('span').textContent = text;
    this.caption.hidden = false;
    this.captionUntil = this.clock + estimateDuration(text);
    if (this.app.audio?.muted || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) return;
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = globalThis.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => /scot|edinburgh/i.test(`${voice.name} ${voice.lang}`)) || voices.find(voice => /^en-GB/i.test(voice.lang)) || voices.find(voice => /^en/i.test(voice.lang)) || null;
    utterance.lang = utterance.voice?.lang || 'en-GB';
    utterance.volume = .28;
    utterance.rate = .78;
    utterance.pitch = .68;
    utterance.onend = utterance.onerror = () => { this.speaking = false; };
    this.speaking = true;
    globalThis.speechSynthesis.speak(utterance);
  }

  update(dt, paused = false) {
    this.clock += dt;
    if (!this.active || paused || document.hidden) return;
    this.elapsed += dt;
    if (!this.introSpoken && this.elapsed >= 60) {
      this.introSpoken = true;
      this.quoteElapsed = 0;
      this.speak(ESMIE_INTRO);
    } else if (this.introSpoken && !this.speaking) {
      this.quoteElapsed += dt;
      if (this.quoteElapsed >= 300) {
        this.quoteElapsed = 0;
        this.speak(this.chooseMemory());
      }
    }
    if (!this.speaking && this.clock >= this.captionUntil) this.caption.hidden = true;
  }
}
