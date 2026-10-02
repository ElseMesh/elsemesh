// Development benchmark only. Always restore exact references/visibility.
export function isolatePortGraphics(app, variant) {
  const undo=[];
  const replace=(object,key,value)=>{const previous=object[key];undo.push(()=>{object[key]=previous;});object[key]=value;};
  if(variant==='legacy-kaiju-culling')for(const mesh of app.kaiju.model.meshes)replace(mesh,'frustumCulled',false);
  if(variant==='no-kaiju' && app.kaiju){
    replace(app.kaiju,'update',()=>{});
    for(const object of [app.kaiju.model?.group,...app.kaiju.wake,...app.kaiju.pressureWake])
      if(object)replace(object,'visible',false);
  }
  if(variant==='no-distant-tree-animation'){
    // Wildlife holds separate habitat references; this removes only joint/crown
    // animation loops, not trees, monkeys, island gameplay or their rendering.
    for(const island of [app.thirdIsland,app.fourthIsland])if(island)replace(island,'trees',[]);
  }
  if(variant==='no-ai-traffic'){
    replace(app.portIsland.traffic,'update',()=>{});
    for(const mesh of app.portIsland.trafficMeshes)replace(mesh,'visible',false);
  }
  return ()=>{for(const restore of undo.reverse())restore();};
}
