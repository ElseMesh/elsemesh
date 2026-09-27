// Run on the authorized voice host. Reads private configuration; exports only dialogue WAVs.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPrivateSpeechProvider } from '../networking/SpeechProvider.mjs';
const [config,out]=process.argv.slice(2);
if(!config||!out)throw Error('Usage: node rental-dialogue.mjs PRIVATE_CONFIG OUTPUT_DIRECTORY');
const provider=await loadPrivateSpeechProvider(config);await mkdir(out,{recursive:true});
for(const [name,text] of Object.entries({greeting:"Hello! Welcome to Loz's Helicopter Rental. Come over and I'll give you the keys.",keys:'Here are the keys. You need to fly to Rocket Island. Follow the lights to the helipad.'})){
 const result=await provider.synthesize(text,'loz-omnivoice');await writeFile(join(out,name+'.wav'),result.audio);console.log(name+': '+result.audio.length+' bytes');
}
