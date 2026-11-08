// Rebuild Sunwashed runtime exports from hand-editable Pixel Workshop sources.
// Usage: node scripts/export_sunwashed_art.mjs <workshop-root> [source-directory]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export const SUNWASHED_KEYS = ["grassTop","grassSide","dirt","stone","sand","ember","rubble","woodSide","woodTop","leaves","mossTop","mossSide","bush","lamp"];
export const SUNWASHED_SYMBOLS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!$%&()*+,-./:;<=>?@[]^_{|}~";
export const SUNWASHED_EDGE_MODES = Object.fromEntries(SUNWASHED_KEYS.map(key => [key, ["woodTop","lamp"].includes(key) ? "object" : ["grassSide","mossSide"].includes(key) ? "horizontal" : "connected"]));
const SIZE=32, COUNT=64, COLUMNS=32, ROWS=28;
const packed = (bytes,at) => (bytes[at]*16777216+bytes[at+1]*65536+bytes[at+2]*256+bytes[at+3])>>>0;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export function tileRgba(tiles) {
  const bytes=Buffer.alloc(tiles.length*SIZE*SIZE*4);
  tiles.forEach((tile,t)=>tile.forEach((pixel,p)=>bytes.writeUInt32BE(pixel,(t*SIZE*SIZE+p)*4)));
  return bytes;
}
export function verifySunwashedEdges(tiles,mode,key) {
  let compatiblePairs=0,edgePixels=0;
  if(mode!=="object")for(let a=0;a<COUNT;a++)for(let b=0;b<COUNT;b++){
    if(Boolean(a&2)===Boolean(b&1)&&Boolean(a&4)===Boolean(b&8)){
      compatiblePairs++;
      for(let p=0;p<SIZE;p++){edgePixels++;if(tiles[a][p*SIZE+31]!==tiles[b][p*SIZE])throw Error(`${key}: horizontal seam ${a}→${b}, pixel ${p}`);}
    }
    if(mode==="connected"&&Boolean(a&8)===Boolean(b&1)&&Boolean(a&4)===Boolean(b&2)){
      compatiblePairs++;
      for(let p=0;p<SIZE;p++){edgePixels++;if(tiles[a][31*SIZE+p]!==tiles[b][p])throw Error(`${key}: vertical seam ${a}→${b}, pixel ${p}`);}
    }
  }
  const uniqueTiles=new Set(tiles.map(tile=>tile.join(","))).size;
  if(uniqueTiles!==(mode==="object"?4:64))throw Error(`${key}: unexpected unique tile count ${uniqueTiles}`);
  return {mode,uniqueTiles,compatiblePairs,edgePixels};
}
export async function exportSunwashedArt(workshopRoot,sourceRoot="assets/terrain/sunwashed") {
  if(!workshopRoot)throw Error("Supply the Pixel Workshop checkout path.");
  const {validateDocument,composite}=await import(pathToFileURL(resolve(workshopRoot,"lib/pixels.ts")));
  const {encodePng,encodeRgbaPng}=await import(pathToFileURL(resolve(workshopRoot,"lib/png.ts")));
  const manifest=JSON.parse(await readFile(join(sourceRoot,"manifest.json"),"utf8"));
  if(manifest.tileSize!==SIZE||manifest.variants!==COUNT||JSON.stringify(manifest.materials.map(m=>m.key))!==JSON.stringify(SUNWASHED_KEYS))throw Error("Sunwashed manifest order or dimensions differ from the runtime contract.");
  const palette=[], tiles={}, raw={}, previews=[];
  const atlas=new Uint8Array(COLUMNS*SIZE*ROWS*SIZE*4);
  const report={format:"sunwashed-verification/1",tileSize:SIZE,variants:COUNT,atlas:{columns:COLUMNS,rows:ROWS,width:COLUMNS*SIZE,height:ROWS*SIZE},representativeBlockColors:manifest.representativeBlockColors,families:{}};
  for(const [base,key]of SUNWASHED_KEYS.entries()){
    const entry=manifest.materials[base];
    if(entry.edgeMode!==SUNWASHED_EDGE_MODES[key])throw Error(`${key}: wrong manifest edge mode.`);
    const doc=validateDocument(JSON.parse(await readFile(join(sourceRoot,entry.source),"utf8")));
    if(doc.width!==256||doc.height!==256||doc.animation)throw Error(`${key}: expected a static 256×256 Workshop sheet.`);
    const rgba=composite(doc);
    raw[key]=[];tiles[key]=[];
    for(let t=0;t<COUNT;t++){
      const pixels=[],indexedRows=[];
      for(let y=0;y<SIZE;y++){
        let row="";
        for(let x=0;x<SIZE;x++){
          const at=((Math.floor(t/8)*SIZE+y)*256+(t%8)*SIZE+x)*4;
          if(rgba[at+3]!==255)throw Error(`${key}[${t}]: transparent pixel ${x},${y}.`);
          pixels.push(packed(rgba,at));
          const color="#"+Array.from(rgba.subarray(at,at+3),v=>v.toString(16).padStart(2,"0")).join("");
          let pi=palette.indexOf(color);if(pi<0){pi=palette.length;palette.push(color);}
          if(palette.length>SUNWASHED_SYMBOLS.length)throw Error(`Sunwashed exceeds ${SUNWASHED_SYMBOLS.length} palette colors.`);
          row+=SUNWASHED_SYMBOLS[pi];
          const tileId=base*COUNT+t;
          atlas.set(rgba.subarray(at,at+4),((Math.floor(tileId/COLUMNS)*SIZE+y)*COLUMNS*SIZE+(tileId%COLUMNS)*SIZE+x)*4);
        }
        indexedRows.push(row);
      }
      raw[key].push(pixels);tiles[key].push(indexedRows);
    }
    report.families[key]={...verifySunwashedEdges(raw[key],entry.edgeMode,key),sha256:hash(tileRgba(raw[key]))};
    previews.push({path:join(sourceRoot,entry.preview),bytes:encodePng(doc)});
  }
  // Record provenance without making the exporter overwrite intentional native
  // edits: after a later edit this report honestly marks an accepted family as
  // changed while still enforcing its seam and opacity contracts.
  const studies=JSON.parse(await readFile("assets/terrain/studies-2026-11-08/studies.json","utf8"));
  const selected=studies.styles.find(style=>style.id==="sunwashed");
  report.acceptedStudies={};
  for(const [key,material]of Object.entries({grassTop:"grass",dirt:"dirt",stone:"stone",woodSide:"bark"})){
    const expected=selected.materials[material].map(rows=>rows.flatMap(row=>[...row].map(symbol=>(Number.parseInt(selected.palette[studies.symbols.indexOf(symbol)].slice(1),16)*256+255)>>>0)));
    const sourceSha256=hash(tileRgba(expected)),exportSha256=report.families[key].sha256;
    report.acceptedStudies[key]={material,sourceSha256,exportSha256,identical:sourceSha256===exportSha256};
  }
  report.paletteColors=palette.length;
  report.totalTiles=SUNWASHED_KEYS.length*COUNT;
  report.opaquePixels=report.totalTiles*SIZE*SIZE;
  report.compatiblePairs=Object.values(report.families).reduce((n,f)=>n+f.compatiblePairs,0);
  report.edgePixels=Object.values(report.families).reduce((n,f)=>n+f.edgePixels,0);
  await mkdir("src/assets",{recursive:true});
  await writeFile("src/assets/terrain-art.json",JSON.stringify({tileSize:SIZE,palette,tiles})+"\n");
  await writeFile("src/assets/terrain-atlas.png",encodeRgbaPng(atlas,COLUMNS*SIZE,ROWS*SIZE));
  for(const preview of previews)await writeFile(preview.path,preview.bytes);
  await writeFile(join(sourceRoot,"verification.json"),JSON.stringify(report,null,2)+"\n");
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=await exportSunwashedArt(process.argv[2],process.argv[3]);
  console.log(`Exported ${report.totalTiles} Sunwashed tiles, ${report.paletteColors} colors; ${report.edgePixels} compatible edge pixels matched.`);
}
