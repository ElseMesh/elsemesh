import { Interpreter } from '../vendor/basic-m6502/interpreter.js';

const MAX_LINES = 120;

class ScreenConsole {
  constructor(write) { this.write = write; this.column = 0; }
  print(text) { const value=String(text); this.write(value, false); this.column=(this.column+value.length)%40; }
  printLine(text='') { this.write(String(text), true); this.column=0; }
  async readLine(prompt='') { this.print(prompt); return ''; }
  async readChar() { return ''; }
  clearScreen() { this.write('\f', true); this.column=0; }
  getPosition() { return this.column; }
  setPosition(column) { this.column=Math.max(0,column|0); }
  get lineLength() { return 40; }
  get columnWidth() { return 10; }
}

export class C64Computer {
  constructor(app) {
    this.app=app; this.lines=[]; this.active=false; this.loggedIn=false; this.username=''; this.commandQueue=Promise.resolve();
    this.console=new ScreenConsole((text,newline)=>this.write(text,newline));
    this.interpreter=new Interpreter(this.console);
    this.dialog=document.createElement('dialog'); this.dialog.className='elsemesh-c64-terminal';
    this.dialog.setAttribute('aria-label','Commodore 64 computer');
    this.dialog.innerHTML=`<style>
      .elsemesh-c64-terminal{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:radial-gradient(circle at 50% 35%,#514638,#151310 72%);color:#b9c8ff;font-family:ui-monospace,"Courier New",monospace}
      .elsemesh-c64-terminal::backdrop{background:#050505}.elsemesh-c64-shell{height:100%;display:grid;place-items:center;padding:3vh;box-sizing:border-box}
      .elsemesh-c64-monitor{width:min(1080px,94vw);height:min(760px,86vh);display:flex;flex-direction:column;gap:14px;padding:28px;border:18px solid #b6a27b;border-radius:28px;background:#3c3429;box-shadow:0 28px 90px #000,inset 0 0 0 3px #e1d0a2}
      .elsemesh-c64-screen{flex:1;overflow:hidden;white-space:pre-wrap;padding:34px 42px;background:#3155a4;color:#a9c7ff;border:12px solid #171918;border-radius:30px;box-shadow:inset 0 0 60px #07153c,0 0 28px #3a61ad66;font-size:clamp(15px,2.1vw,27px);line-height:1.12;text-transform:uppercase;text-shadow:0 0 7px #bed5ff88}
      .elsemesh-c64-form{display:flex;gap:10px}.elsemesh-c64-input{flex:1;background:#24201a;color:#fff1c8;border:1px solid #d8c69b;border-radius:7px;padding:12px 14px;font:18px ui-monospace,monospace;text-transform:uppercase}
      .elsemesh-c64-form button,.elsemesh-c64-exit{background:#6c5840;color:#fff6dc;border:1px solid #cfb98e;border-radius:7px;padding:10px 17px;font-weight:700;cursor:pointer}
      .elsemesh-c64-meta{display:flex;justify-content:space-between;gap:14px;color:#e9d6aa;font:13px system-ui}.elsemesh-c64-meta span:last-child{text-align:right}
      @media(max-width:650px){.elsemesh-c64-monitor{padding:12px;border-width:9px}.elsemesh-c64-screen{padding:18px 14px;border-width:7px}.elsemesh-c64-meta span:last-child{display:none}}
    </style><div class="elsemesh-c64-shell"><section class="elsemesh-c64-monitor"><div class="elsemesh-c64-screen" role="log" aria-live="polite"></div><form class="elsemesh-c64-form"><input class="elsemesh-c64-input" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="C64 command"><button>RETURN</button><button type="button" class="elsemesh-c64-exit">LEAVE</button></form><div class="elsemesh-c64-meta"><span>COMMODORE 64 · MICROSOFT 6502 BASIC 1.1</span><span>ENTER PROGRAM LINES · RUN · LIST · SAVE "NAME" · ESC LEAVES</span></div></section></div>`;
    document.body.append(this.dialog);
    this.screen=this.dialog.querySelector('.elsemesh-c64-screen'); this.input=this.dialog.querySelector('.elsemesh-c64-input');
    this.dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const command=this.input.value;this.input.value='';this.commandQueue=this.commandQueue.then(()=>this.submit(command));});
    this.dialog.querySelector('.elsemesh-c64-exit').onclick=()=>this.close();
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    this.write('ELSEMESH WAREHOUSE NETWORK',true); this.write('COMMODORE 64 TERMINAL 01',true); this.write('',true); this.write('LOGIN:',true);
  }
  write(text,newline=true) {
    if(text==='\f')this.lines=[];
    else if(newline)this.lines.push(text);
    else if(this.lines.length)this.lines[this.lines.length-1]+=text;
    else this.lines.push(text);
    this.lines=this.lines.slice(-MAX_LINES); this.screen.textContent=this.lines.slice(-25).join('\n'); this.screen.scrollTop=this.screen.scrollHeight;
  }
  async submit(raw) {
    const command=raw.trim(); if(!command)return;
    this.write((this.loggedIn?']':'LOGIN: ')+command,true);
    if(!this.loggedIn){this.username=command.replace(/[^A-Z0-9_-]/gi,'').slice(0,16)||'GUEST';this.loggedIn=true;this.write('',true);this.write(`WELCOME ${this.username.toUpperCase()}`,true);this.write('MICROSOFT BASIC 1.1',true);this.write('FOR THE 6502 MICROPROCESSOR',true);this.write('',true);this.write('READY.',true);return;}
    try { await this.interpreter.processInput(command); }
    catch(error) { this.write(error?.toString?.()||'?ERROR',true); this.write('READY.',true); }
  }
  open(){if(this.active)return;this.active=true;this.app.input.suspend();document.exitPointerLock?.();this.dialog.showModal();this.input.focus();}
  close(){if(!this.active)return;this.active=false;this.dialog.close();this.app.input.resume();this.app.input.requestLock();}
}
