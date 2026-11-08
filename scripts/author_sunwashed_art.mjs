// Complete Sunwashed set. This recipe replaces its 14 native sheets; use the
// exporter instead when preserving later hand edits. Study archives stay read-only.
// Usage: node scripts/author_sunwashed_art.mjs <workshop-root>
import {mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve,join,relative} from "node:path";
import {pathToFileURL} from "node:url";
import {SUNWASHED_KEYS,SUNWASHED_EDGE_MODES,exportSunwashedArt} from "./export_sunwashed_art.mjs";

const workshopRoot=process.argv[2];
if(!workshopRoot)throw Error("Supply the Pixel Workshop checkout path.");
const {createDocument,applyCommands,composite,validateDocument}=await import(pathToFileURL(resolve(workshopRoot,"lib/pixels.ts")));
const {encodePng}=await import(pathToFileURL(resolve(workshopRoot,"lib/png.ts")));
const root="assets/terrain/sunwashed",SIZE=32,P=31;
const representativeBlockColors={grass:"#949e60",dirt:"#b18e66",stone:"#cbc5ad",sand:"#dec791",ember:"#66513f",rubble:"#c1af91",wood:"#a28558",leaves:"#7d914c",moss:"#8ca154",bush:"#607540",lamp:"#dcbc7a"};
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const mod=(n,d)=>((n%d)+d)%d,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),smooth=n=>n*n*(3-2*n);
const pack=hex=>(parseInt(hex.slice(1),16)*256+255)>>>0;
async function archiveHashes(){
  const entries={};
  async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else entries[relative(".",path).replaceAll("\\","/")]=sha(await readFile(path));}}
  await walk("assets/terrain/studies-2026-11-08");
  for(const path of ["assets/terrain/moss-and-ember.pixel.json","assets/terrain/moss-and-ember.png","scripts/author_terrain_art.mjs","scripts/export_terrain_art.mjs","scripts/author_art_studies.mjs"])entries[path]=sha(await readFile(path));
  return entries;
}
const archivesBefore=await archiveHashes();
const studyFile=await readFile("assets/terrain/studies-2026-11-08/studies.json","utf8");
const studies=JSON.parse(studyFile),sun=studies.styles.find(style=>style.id==="sunwashed");
const accepted={};
for(const [key,material]of Object.entries({grassTop:"grass",dirt:"dirt",stone:"stone",woodSide:"bark"}))accepted[key]=sun.materials[material].map(rows=>rows.flatMap(row=>[...row].map(symbol=>pack(sun.palette[studies.symbols.indexOf(symbol)]))));
const ramps={
  grassTop:sun.palette.slice(0,5),stone:sun.palette.slice(5,10),dirt:sun.palette.slice(10,15),woodSide:sun.palette.slice(15,20),
  sand:["#b8a06d","#cbb27c","#dec791","#eddbae","#f6e8c4"],
  ember:["#302f2c","#484139","#66513f","#98643c","#c18546","#eba554","#ffd17c"],
  leaves:["#425a37","#607540","#7d914c","#9bad62","#bdc67e","#d1d493"],
  mossTop:["#4f683a","#708747","#8ca154","#a9ba6b","#c3ca86"],
  lamp:["#383d36","#605e48","#948153","#bca069","#dcbc7a","#efd492","#ffeab6"],
};
ramps.bush=ramps.leaves;ramps.woodTop=ramps.woodSide;
ramps.grassSide=[...ramps.grassTop,...ramps.dirt];ramps.mossSide=[...ramps.mossTop,...ramps.dirt];
ramps.rubble=[...ramps.stone,...ramps.dirt];
const levelMaps=Object.fromEntries(["grassTop","dirt","stone","woodSide"].map(key=>[key,new Map(ramps[key].map((color,i)=>[pack(color),i]))]));
function hash(x,y,seed){let n=Math.imul(x+71,374761393)^Math.imul(y+113,668265263)^Math.imul(seed+19,1597334677);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
function noise(x,y,seed,cols=7,rows=cols){
  const px=mod(x,P)*cols/P,py=mod(y,P)*rows/P,ix=Math.floor(px),iy=Math.floor(py),u=smooth(px-ix),v=smooth(py-iy);
  const a=(x,y)=>hash(mod(x,cols),mod(y,rows),seed)*2-1;
  return(a(ix,iy)*(1-u)+a(ix+1,iy)*u)*(1-v)+(a(ix,iy+1)*(1-u)+a(ix+1,iy+1)*u)*v;
}
function context(mask,alt,x,y,key){
  const shared=601+SUNWASHED_KEYS.indexOf(key)*271,seed=shared+mask*199+alt*1229;
  const dist=Math.min(x,y,P-x,P-y),inside=dist===0?0:clamp(dist/(1.15+.65*(1+noise(x,y,shared+901,9))),0,1);
  const u=smooth(x/P),v=smooth(y/P),nw=mask&1?1:-1,ne=mask&2?1:-1,se=mask&4?1:-1,sw=mask&8?1:-1;
  const corner=x===0?nw*(1-v)+sw*v:x===P?ne*(1-v)+se*v:y===0?nw*(1-u)+ne*u:y===P?sw*(1-u)+se*u:(nw*(1-u)+ne*u)*(1-v)+(sw*(1-u)+se*u)*v;
  const rough=noise(x,y,shared,8)*.36+noise(x,y,shared+7,14)*.17+inside*(noise(x,y,seed+211,4)*.4+noise(x,y,seed+61,9)*.68+noise(x,y,seed+89,15)*.30);
  return{shared,seed,inside,corner,rough};
}
const tone=(ramp,n)=>pack(ramp[clamp(Math.round(n),0,ramp.length-1)]);
function terrainTile(key,mask,alt){
  const index=mask+alt*16,ramp=ramps[key];
  if(accepted[key])return accepted[key][index].slice();
  if(key==="mossTop")return accepted.grassTop[index].map(pixel=>pack(ramp[levelMaps.grassTop.get(pixel)]));
  const pixels=[];
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const c=context(mask,alt,x,y,key),at=y*SIZE+x;
    let color;
    if(key==="grassSide"||key==="mossSide"){
      const moss=key==="mossSide",topRamp=moss?ramps.mossTop:ramps.grassTop;
      const u=smooth(x/P),top=(mask&1?1:-1)*(1-u)+(mask&2?1:-1)*u;
      const inward=x===0||x===P?0:Math.sin(Math.PI*x/P);
      const height=(moss?15:8)+Math.round(top*1.4+noise(x,0,c.shared,8,1)*2.2+inward*noise(x,0,c.seed,7,1)*1.8);
      const fringe=noise(x,y,c.shared+87,10)*.7+c.inside*noise(x,y,c.seed+93,13)*.55;
      const cap=y<height+(fringe>.35?2:fringe<-.35?-1:0);
      color=cap?pack(topRamp[levelMaps.grassTop.get(accepted.grassTop[index][at])]):accepted.dirt[index][at];
      if(cap&&y>=height-1&&fringe<.05)color=pack(topRamp[0]);
    }else if(key==="sand"){
      const strata=noise(x,y,c.shared+43,3,11)*.4+c.inside*noise(x,y,c.seed+51,4,12)*.35;
      color=tone(ramp,2.25+c.corner*.32+c.rough*.9+strata);
    }else if(key==="ember"){
      const fracture=noise(x,y,c.shared+41,5)+c.inside*noise(x,y,c.seed+17,8)*.40+c.corner*.14;
      const crack=Math.abs(fracture),base=.85+c.rough*.85+c.corner*.28;
      color=tone(ramp,crack<.035?5.1+c.rough:crack<.085?3.5+c.rough:base);
    }else if(key==="rubble"){
      const slab=noise(x,y,c.shared+103,6)+c.inside*noise(x,y,c.seed+107,7)*.65+c.corner*.23;
      color=slab>-.10?accepted.stone[index][at]:accepted.dirt[index][at];
      if(Math.abs(slab+.10)<.045)color=pack(slab>-.10?ramps.stone[0]:ramps.dirt[0]);
    }else if(key==="leaves"||key==="bush"){
      // Dense stepped leaf planes, with broad shadow pockets and sparse warm tips.
      const foliage=noise(x,y,c.shared+31,7)+c.inside*noise(x,y,c.seed+37,8)*.85;
      const veins=noise(x,y,c.shared+49,12)+c.inside*noise(x,y,c.seed+59,13)*.65;
      const lit=foliage>.22&&veins>.1?.65:foliage<-.3?-.5:0;
      color=tone(ramp,(key==="bush"?1.8:2.45)+c.corner*.4+c.rough*.9+foliage*.85+lit);
    }else throw Error(`Unknown connected material ${key}`);
    pixels.push(color);
  }
  return pixels;
}
function objectTile(key,alt){
  const pixels=[],ramp=ramps[key],seed=791+alt*613;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const rough=noise(x,y,seed,9)*.50+noise(x,y,seed+7,15)*.23;
    let value;
    if(key==="woodTop"){
      const dx=x-(14+alt%3),dy=y-(15+(alt>>1));
      const radius=Math.sqrt(dx*dx*.85+dy*dy)+noise(x,y,seed+19,5)*.9;
      const ring=mod(Math.floor(radius),5);
      value=(ring===0?1.45:ring===1?3.25:2.8)+rough;
      const angle=Math.atan2(dy,dx),split=Math.abs(Math.sin(angle-(alt*.51+.35)));
      if(radius>5&&radius<15&&split<.045)value=.5+rough;
    }else{
      const edge=Math.min(x,y,31-x,31-y);
      value=edge<2?0:edge<5?2.3+rough:edge<7?.8:4.8+rough;
      if(edge>=7){
        value+=noise(x,y,seed+37,4)*.55-(y-8)*.018;
        if(x===15||x===16)value=1.7+rough;
      }
      if((x===4||x===27)&&(y===4||y===27))value=5;
      if((y===2&&x>3&&x<28)||(x===2&&y>3&&y<28))value=3.3+rough*.4;
    }
    pixels.push(tone(ramp,value));
  }
  return pixels;
}
await mkdir(root,{recursive:true});
const manifest={format:"sunwashed-terrain/1",name:"Sunwashed",tileSize:SIZE,variants:64,cornerOrder:["NW","NE","SE","SW"],cornerBits:[1,2,4,8],variantIndex:"cornerMask + interiorAlternative * 16",atlas:{columns:32,rows:28},representativeBlockColors,workshopCommit:"718f17700084a8c356e3babe6b17b7774a570c1e",materials:[]};
for(const key of SUNWASHED_KEYS){
  const tiles=Array.from({length:64},(_,index)=>SUNWASHED_EDGE_MODES[key]==="object"?objectTile(key,Math.floor(index/16)):terrainTile(key,index%16,Math.floor(index/16)));
  const palette=[...new Set(ramps[key])];
  const doc=applyCommands(createDocument(`Sunwashed — ${key} (16 corners × 4 interiors)`,256,256),[
    ...tiles.map((pixels,t)=>({op:"paste",layer:"base",x:t%8*SIZE,y:Math.floor(t/8)*SIZE,width:SIZE,height:SIZE,pixels})),
    {op:"palette",colors:palette},
  ]);
  validateDocument(doc);
  const rgba=composite(doc);
  if(rgba.some((v,i)=>i%4===3&&v!==255))throw Error(`${key}: transparent authored pixels.`);
  await writeFile(join(root,`${key}.pixel.json`),JSON.stringify(doc));
  await writeFile(join(root,`${key}.png`),encodePng(doc));
  manifest.materials.push({key,source:`${key}.pixel.json`,preview:`${key}.png`,edgeMode:SUNWASHED_EDGE_MODES[key],note:SUNWASHED_EDGE_MODES[key]==="horizontal"?"Grass cap over earth; only horizontal seams match. Vertical cap discontinuity is intentional.":SUNWASHED_EDGE_MODES[key]==="object"?"Four object-centered alternatives repeat across the sixteen masks.":"All compatible horizontal and vertical corner-mask edges match across all alternatives."});
}
await writeFile(join(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
const report=await exportSunwashedArt(workshopRoot,root);
if(Object.values(report.acceptedStudies).some(entry=>!entry.identical))throw Error("Accepted Sunwashed source pixels changed.");
const archivesAfter=await archiveHashes();
if(JSON.stringify(archivesBefore)!==JSON.stringify(archivesAfter))throw Error("A preserved study or Moss & Ember archive changed during authoring.");
await writeFile(join(root,"provenance.json"),JSON.stringify({studySource:"assets/terrain/studies-2026-11-08/studies.json",studySha256:sha(studyFile),acceptedFamilies:report.acceptedStudies,preservedArchiveFiles:Object.keys(archivesBefore).length,archiveAggregateSha256:sha(JSON.stringify(archivesBefore))},null,2)+"\n");
console.log(`Authored ${report.totalTiles} Sunwashed tiles in ${report.paletteColors} colors. ${report.edgePixels} edge pixels matched; ${Object.keys(archivesBefore).length} archived files unchanged.`);
