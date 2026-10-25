import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const data=path.join(root,'data');
const secrets=path.join(data,'secrets');
const codex=path.join(data,'codex');
fs.mkdirSync(secrets,{recursive:true});
fs.mkdirSync(codex,{recursive:true});

const envExample=path.join(root,'.env.example');
const envFile=path.join(root,'.env');
if(!fs.existsSync(envFile)&&fs.existsSync(envExample)){
  fs.copyFileSync(envExample,envFile);
  console.log('created .env from .env.example');
}

const tokenFile=path.join(secrets,'call-access-token');
if(!fs.existsSync(tokenFile)||!String(fs.readFileSync(tokenFile,'utf8')).trim()){
  const token=crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(tokenFile,token+'\n',{mode:0o600});
  console.log('created data/secrets/call-access-token');
}
try{fs.chmodSync(tokenFile,0o600);}catch{}

function sha256(file){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function downloadVerified(url,destination,expectedSha){
  if(fs.existsSync(destination)&&sha256(destination)===expectedSha)return;
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok)throw new Error('asset_download_failed '+response.status+' '+url);
  const bytes=Buffer.from(await response.arrayBuffer());
  const actual=crypto.createHash('sha256').update(bytes).digest('hex');
  if(actual!==expectedSha)throw new Error('asset_checksum_mismatch '+path.basename(destination));
  const tmp=destination+'.tmp';
  fs.writeFileSync(tmp,bytes);
  fs.renameSync(tmp,destination);
  console.log('downloaded '+path.relative(root,destination));
}

function installOrtRuntime(){
  const source=path.join(root,'node_modules','onnxruntime-web','dist');
  const destination=path.join(root,'web','ort');
  const names=[
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.asyncify.mjs',
    'ort-wasm-simd-threaded.asyncify.wasm'
  ];
  if(!fs.existsSync(source))throw new Error('onnxruntime-web is not installed; run npm ci first');
  fs.mkdirSync(destination,{recursive:true});
  for(const name of names){
    const from=path.join(source,name),to=path.join(destination,name);
    if(!fs.existsSync(from))throw new Error('missing ONNX Runtime asset: '+name);
    fs.copyFileSync(from,to);
  }
  console.log('prepared web/ort runtime assets');
}

installOrtRuntime();
await downloadVerified(
  'https://huggingface.co/audiomagic/yamnet-onnx/resolve/f25b741c2f0bdc6d7e6db24b5fddda23347dbafd/yamnet.onnx?download=true',
  path.join(root,'web','models','yamnet.onnx'),
  'd3835ffbbd4a1bb3e777f0ca217b5007907f5171dd5d17c4236b95b2af8f908e'
);

for(const name of ['elevenlabs-api-key','assemblyai-api-key']){
  const file=path.join(secrets,name);
  if(!fs.existsSync(file))console.log('needs: data/secrets/'+name);
}

console.log('');
console.log('Next:');
console.log('  1. Put provider keys in data/secrets/');
console.log('  2. Set ELEVENLABS_VOICE_ID in .env');
console.log('  3. For dedicated Codex: CODEX_HOME="$PWD/data/codex" ./node_modules/.bin/codex login');
console.log('  4. npm run build:web');
console.log('  5. npm start   (or docker compose up -d)');
console.log('');
console.log('Your local call access token is stored in data/secrets/call-access-token');
