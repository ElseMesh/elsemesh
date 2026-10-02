// Original authored, deterministic demonstration. Coordinates are quay-local.
export const CARGO_DURATION = 112;
const mix = (a,b,t) => a + (b-a)*t;
const smooth = t => { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
export function cargoPose(seconds) {
  const t=Math.max(0,Math.min(CARGO_DURATION,Number.isFinite(seconds)?seconds:0));
  const arrival=smooth(t/35);
  const ship={x:mix(-170,0,arrival),z:mix(182,172,arrival),y:0};
  let phase='Approaching berth', cargo={x:ship.x+8,y:4.6,z:ship.z}, attached=false;
  let hook={x:8,y:21,z:172};
  if(t>=35) phase='Moored · lowering spreader';
  if(t>=35&&t<43) hook.y=mix(21,6,smooth((t-35)/8));
  if(t>=43&&t<55) {
    phase='Lifting cargo'; attached=true;
    cargo.y=mix(4.6,13,smooth((t-43)/12)); hook.y=cargo.y+1.4;
  }
  if(t>=55&&t<68) {
    phase='Traversing to quay'; attached=true;
    cargo.y=13; cargo.z=mix(172,145,smooth((t-55)/13)); hook={x:8,y:14.4,z:cargo.z};
  }
  if(t>=68&&t<80) {
    phase='Lowering onto staging pad'; attached=true;
    cargo.z=145; cargo.y=mix(13,6.42,smooth((t-68)/12)); hook={x:8,y:cargo.y+1.4,z:145};
  }
  if(t>=80) {
    phase='Cargo released · hoist returning';
    cargo={x:8,y:6.42,z:145};
    hook={x:8,y:mix(7.82,21,smooth((t-80)/12)),z:145};
  }
  const doors=smooth((t-92)/4), travel=smooth((t-98)/14);
  if(t>=92) phase='Opening vehicle container';
  if(t>=98) phase='Sedan driving onto dockside';
  if(t>=112) phase='Sedan ready for collection · press E nearby';
  // The MMC sedan's measured tyre bounds reach 0.01241 m below its origin.
  const vehicle={x:mix(8,-4,travel),z:145,y:5.213-.08*smooth((8-mix(8,-4,travel)-1)/5),yaw:-Math.PI/2};
  return {seconds:t,phase,ship,cargo,hook,attached,doors,vehicle,ready:t>=112,moored:t>=35,complete:t>=CARGO_DURATION};
}
export class PortCargoSequence {
  constructor(){this.reset();}
  reset(){this.seconds=0;this.running=false;this.pose=cargoPose(0);}
  start(){if(this.running)return false;this.reset();this.running=true;return true;}
  update(dt){
    if(this.running&&Number.isFinite(dt)&&dt>0)this.seconds=Math.min(CARGO_DURATION,this.seconds+Math.min(dt,.1));
    this.pose=cargoPose(this.seconds);
    if(this.pose.complete)this.running=false;
    return this.pose;
  }
}
