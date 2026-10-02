function safeJSON(value) {
	return JSON.stringify( value ).replace( /[<>&\u2028\u2029]/g, ( character ) => ( {
		'<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
	} )[ character ] );
}

export function renderAIEditReviewHTML(report) {
	const encodedReport = safeJSON( report );
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>ElseMesh owner review</title>
<style>
:root{color-scheme:dark;font:16px/1.5 system-ui,sans-serif;background:#101821;color:#eaf0f5}body{max-width:1100px;margin:0 auto;padding:24px}h1,h2,h3{line-height:1.2}h1{margin-bottom:4px}.muted{color:#a9b8c7}.notice{border:1px solid #cf9b43;background:#352913;padding:12px 16px;border-radius:8px;margin:20px 0}.summary,.changes{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}.card{background:#1a2733;border:1px solid #334656;border-radius:8px;padding:16px;min-width:0}.card h3{margin:0 0 8px}pre{overflow:auto;max-height:420px;background:#0e151c;padding:12px;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere}code{overflow-wrap:anywhere}.status{font-weight:700;color:#f0c46e}a{color:#91c7ff}li{margin:4px 0}.empty{color:#9eb0bf;padding:10px 0}.preview{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;background:#0e151c;border-radius:6px}@media(max-width:600px){body{padding:14px}}
</style>
</head>
<body>
<header><p class="muted">ELSEMESH · OWNER REVIEW</p><h1 id="title"></h1><div id="identity" class="muted"></div></header>
<div class="notice"><strong>Unsigned candidate.</strong> This worker did not sign or publish the world. Inspect the changes and open the candidate Blender file before accepting anything.</div>
<section class="summary" id="summary"></section>
<h2>Rendered scene preview</h2><section class="card" id="preview"></section>
<h2>Object changes</h2><section class="changes" id="objects"></section>
<h2>Portal changes</h2><section class="changes" id="portals"></section>
<h2>World field changes</h2><section class="changes" id="world"></section>
<h2>Generated assets</h2><section class="card" id="assets"></section>
<h2>Candidate files</h2><section class="card" id="candidate-files"><ul><li><a href="./candidate.world-source.json">Unsigned world source</a></li><li><a href="./candidate.blend">Blender scene</a></li><li><a href="./review.json">Machine-readable review</a></li></ul></section>
<script type="application/json" id="review-data">${encodedReport}</script>
<script>
const report=JSON.parse(document.getElementById('review-data').textContent);
const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=String(value??'');if(className)node.className=className;return node};
document.getElementById('title').textContent=report.worldTitle||report.worldId;
document.getElementById('identity').textContent='World '+report.worldId+' · Task '+report.taskId;
function card(parent,title,body){const box=document.createElement('article');box.className='card';box.append(text('h3',title));box.append(body);parent.append(box);return box;}
const summary=document.getElementById('summary');
card(summary,'Request',text('p',report.instruction));
card(summary,'Source binding',text('pre','Base: '+report.baseSourceHash+'\\nCandidate: '+report.candidateSourceHash));
card(summary,'Validation',text('pre',JSON.stringify(report.validation,null,2)));
const preview=document.getElementById('preview');
if(report.preview?.file==='review-preview.png'){const image=document.createElement('img');image.className='preview';image.src='./review-preview.png';image.alt='Offline Blender preview of the candidate scene';preview.append(image);const note=text('p','Workbench render of the candidate geometry. It is a review aid, not the game renderer or a material-fidelity comparison.','muted');preview.append(note);}else preview.append(text('p','Blender found no renderable mesh geometry for a preview.','empty'));
if(report.baseSourceFile==='base.world-source.json'){const baseLink=document.createElement('li');const anchor=document.createElement('a');anchor.href='./base.world-source.json';anchor.textContent='Base world source';baseLink.append(anchor);document.querySelector('#candidate-files ul').prepend(baseLink);}
if(report.baseSourceFile==='base.world-source.json'){const publishLink=document.createElement('li');const anchor=document.createElement('a');anchor.href='./PUBLISHING.md';anchor.textContent='Owner publication checklist';publishLink.append(anchor);document.querySelector('#candidate-files ul').append(publishLink);}
function renderChanges(target,changes){if(!changes.length){target.append(text('p','No changes', 'empty'));return;}for(const change of changes){const before=text('pre',change.before===null?'(new record)':JSON.stringify(change.before,null,2));const after=text('pre',change.after===null?'(removed)':JSON.stringify(change.after,null,2));const body=document.createElement('div');body.append(text('p',change.status+' · '+change.id,'status'));body.append(text('h4','Before'));body.append(before);body.append(text('h4','After'));body.append(after);card(target,change.id,body);}}
renderChanges(document.getElementById('objects'),report.objectChanges||[]);
renderChanges(document.getElementById('portals'),report.portalChanges||[]);
renderChanges(document.getElementById('world'),report.worldChanges||[]);
const assets=document.getElementById('assets');
if(!(report.generatedAssets||[]).length)assets.append(text('p','No generated assets.','empty'));
for(const asset of report.generatedAssets||[]){const row=document.createElement('p');const link=document.createElement('a');link.href='./assets/'+asset.id.slice(7);link.textContent=asset.id;row.append(link,text('span',' · '+asset.bytes+' bytes'));assets.append(row);}
</script>
</body>
</html>\n`;
}
