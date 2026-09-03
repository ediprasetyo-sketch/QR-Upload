const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8080);
const STORAGE_DIR = process.env.STORAGE_DIR || "/data/uploads";
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 100);
const APP_VERSION = require("./package.json").version;
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:8080";
const JOB_API_KEY = process.env.JOB_API_KEY || "";

fs.mkdirSync(STORAGE_DIR, { recursive: true });

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function send(res, code, type, data) { res.writeHead(code, {"Content-Type": type, "Cache-Control": "no-store"}); res.end(data); }
function json(res, code, data) { send(res, code, "application/json; charset=utf-8", JSON.stringify(data)); }
function requireApiKey(req, res) {
  if (!JOB_API_KEY) return json(res, 503, {ok:false,error:"JOB_API_KEY belum dikonfigurasi"}), false;
  if (req.headers["x-api-key"] !== JOB_API_KEY) return json(res, 401, {ok:false,error:"Unauthorized"}), false;
  return true;
}
function jobDir(jobId) { return path.join(STORAGE_DIR, jobId); }
function jobMetaPath(jobId) { return path.join(jobDir(jobId), "job.json"); }
function loadJob(jobId) { if (!/^RP-[A-F0-9]{10}$/.test(jobId)) return null; try { return JSON.parse(fs.readFileSync(jobMetaPath(jobId), "utf8")); } catch { return null; } }
function saveJob(job) { fs.writeFileSync(jobMetaPath(job.jobId), JSON.stringify(job, null, 2)); }
function listJobs(status) {
  const rows=[];
  for (const name of fs.readdirSync(STORAGE_DIR,{withFileTypes:true})) {
    if (!name.isDirectory() || !/^RP-[A-F0-9]{10}$/.test(name.name)) continue;
    const job=loadJob(name.name); if (job && (!status || job.status===status)) rows.push(job);
  }
  return rows.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
}

function page() {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>REVO PRINT SHOP</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f4f7fb;font-family:Arial,sans-serif;color:#14213d;display:flex;align-items:center;justify-content:center;padding:18px}.card{width:min(560px,100%);background:#fff;border-radius:20px;padding:26px;box-shadow:0 12px 35px rgba(0,0,0,.08)}
.header{display:flex;align-items:center;gap:14px;margin-bottom:20px}.brand-icon{width:44px;height:44px;border-radius:11px;background:#123f7a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:25px;flex:none}.header h1{margin:0;font-size:24px;color:#123b72}.sub{margin:4px 0 0;color:#667085;font-size:13px}
.ready{border:1px solid #9bd8bd;background:#f1fbf6;border-radius:11px;padding:12px 14px;margin-bottom:15px}.ready-title{display:flex;align-items:center;color:#087f43;font-weight:700;font-size:14px}.ready-icon{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#159447;color:#fff;align-items:center;justify-content:center;margin-right:8px;font-weight:700}.ready-text{margin:4px 0 0 30px;color:#667085;font-size:12px}
.step-box{border:1px solid #d3ddea;border-radius:12px;padding:14px;margin-bottom:14px}.step-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#14213d;margin-bottom:10px}.step-no{width:22px;height:22px;border-radius:50%;background:#123f7a;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px}.pick-area{border:2px dashed #67d39c;border-radius:12px;padding:18px 12px;text-align:center;background:#fbfffd;cursor:pointer}.pick-area:hover{background:#f5fff9}.upload-icon{width:38px;height:38px;margin:0 auto 8px;border-radius:50%;background:#e4f8ed;color:#159447;display:flex;align-items:center;justify-content:center;font-size:23px}.pick-title{font-size:16px;font-weight:700}.pick-help{margin-top:5px;color:#667085;font-size:12px;line-height:1.45}.pick-button{display:inline-block;margin-top:12px;padding:9px 22px;border:1px solid #123f7a;border-radius:7px;background:#fff;color:#123f7a;font-weight:700;font-size:13px;cursor:pointer}.pick-button:hover{background:#f4f7fb}.file-name{margin-top:8px;color:#667085;font-size:11px;min-height:15px}
#file{display:none}.send-btn{width:100%;padding:12px;border:0;border-radius:7px;background:#159447;color:#fff;font-size:15px;font-weight:700;cursor:pointer}.send-btn:hover{background:#107a3a}.send-btn:disabled{opacity:.6;cursor:not-allowed}.result{margin-top:12px}.ok{background:#effaf4;padding:11px;border-radius:9px;border:1px solid #b7e4c7;color:#087f43;font-size:12px}.err{background:#fff5f5;padding:11px;border-radius:9px;border:1px solid #f3b6b6;color:#a33;font-size:12px}
.private{margin-top:14px;border:1px solid #d9eadf;background:#f7fcf9;border-radius:10px;padding:12px 14px}.private-title{color:#087f43;font-weight:700;font-size:13px}.private-text{margin-top:4px;color:#667085;font-size:11px}.footer{margin-top:16px;text-align:center;color:#98a2b3;font-size:10px}@media(max-width:520px){body{padding:10px}.card{padding:20px 15px;border-radius:16px}.header h1{font-size:22px}}
</style></head>
<body><div class="card">
<div class="header"><div class="brand-icon">↑</div><div><h1>REVO PRINT SHOP</h1><p class="sub">Kirim file PDF langsung dari HP setelah scan QR.</p></div></div>
<div class="ready"><div class="ready-title"><span class="ready-icon">✓</span>Siap menerima PDF dari HP</div><div class="ready-text">Pilih satu file PDF dari HP, lalu tekan Kirim PDF.</div></div>
<div class="step-box"><div class="step-title"><span class="step-no">1</span>Pilih file PDF</div>
<div class="pick-area" id="pickArea"><div class="upload-icon">↑</div><div class="pick-title">Pilih PDF untuk dikirim</div><div class="pick-help">Format PDF saja. File akan dikirim langsung ke server REVO PRINT SHOP.</div><label class="pick-button" for="file" id="pickButton">Pilih File PDF</label><input id="file" type="file" accept=".pdf,application/pdf"><div id="fileName" class="file-name"></div></div></div>
<div class="step-box"><div class="step-title"><span class="step-no">2</span>Kirim file</div><button id="upload" class="send-btn" type="button">Kirim PDF</button></div>
<div id="result" class="result"></div>
<div class="private"><div class="private-title">🔒 Aman &amp; Privat</div><div class="private-text">File PDF dikirim langsung ke server REVO PRINT SHOP dan tidak diproses oleh halaman ini.</div></div>
<div class="footer">Powered by Revo Print Shop · QR Upload Service</div></div>
<script>
const input=document.getElementById('file'),btn=document.getElementById('upload'),pickArea=document.getElementById('pickArea'),pickButton=document.getElementById('pickButton'),fileName=document.getElementById('fileName'),result=document.getElementById('result');
function openPicker(){if(!btn.disabled) input.click()}
pickArea.addEventListener('click',e=>{if(e.target!==pickButton)openPicker()});
pickButton.addEventListener('click',e=>e.stopPropagation());
input.addEventListener('change',()=>{const f=input.files[0];fileName.textContent=f?f.name:'';result.innerHTML=''});
btn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const file=input.files[0];if(!file){result.innerHTML='<div class="err">Pilih file PDF terlebih dahulu.</div>';return}if(!file.name.toLowerCase().endsWith('.pdf')){result.innerHTML='<div class="err">File harus berformat PDF.</div>';return}btn.disabled=true;btn.textContent='Mengupload...';result.innerHTML='';try{const r=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},body:file});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Upload gagal.');result.innerHTML='<div class="ok"><b>Upload berhasil</b><br>File: '+escapeClient(file.name)+'</div>';input.value='';fileName.textContent='';}catch(e){result.innerHTML='<div class="err">'+escapeClient(e.message)+'</div>'}finally{btn.disabled=false;btn.textContent='Kirim PDF'}});
function escapeClient(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
</script></body></html>`;
}

const server=http.createServer((req,res)=>{
  const u=new URL(req.url,"http://localhost");
  if(req.method==="GET"&&u.pathname==="/")return send(res,200,"text/html; charset=utf-8",page());
  if(req.method==="GET"&&u.pathname==="/health")return json(res,200,{ok:true,service:"revo-qr-upload",version:APP_VERSION,queue:true});
  if(req.method==="GET"&&u.pathname==="/qr.png"){const p=path.join(__dirname,"qr.png");if(!fs.existsSync(p))return send(res,404,"text/plain","QR not found");res.writeHead(200,{"Content-Type":"image/png","Cache-Control":"no-store"});return fs.createReadStream(p).pipe(res)}
  if(req.method==="POST"&&u.pathname==="/api/upload"){
    const raw=req.headers["x-file-name"]||"upload.pdf";let filename;try{filename=path.basename(decodeURIComponent(String(raw)))}catch{filename=path.basename(String(raw))}filename=filename.replace(/[\\/:*?"<>|]/g,"_");if(!filename.toLowerCase().endsWith(".pdf"))filename+=".pdf";
    const maxBytes=MAX_FILE_MB>0?MAX_FILE_MB*1024*1024:0,declaredLength=Number(req.headers["content-length"]||0);if(maxBytes>0&&declaredLength>maxBytes)return json(res,413,{ok:false,error:"File terlalu besar",maxFileMB:MAX_FILE_MB});
    const tempName=".upload-"+process.pid+"-"+Date.now()+"-"+Math.random().toString(16).slice(2)+".tmp",tempPath=path.join(STORAGE_DIR,tempName),out=fs.createWriteStream(tempPath,{flags:"wx"});let total=0,tooLarge=false,firstChunk=Buffer.alloc(0);
    req.on("data",chunk=>{total+=chunk.length;if(firstChunk.length<5)firstChunk=Buffer.concat([firstChunk,chunk.subarray(0,5-firstChunk.length)]);if(maxBytes>0&&total>maxBytes){tooLarge=true;req.destroy();return}out.write(chunk)});
    req.on("error",()=>{out.destroy();try{fs.unlinkSync(tempPath)}catch{}});
    req.on("end",()=>out.end(()=>{if(tooLarge||(maxBytes>0&&total>maxBytes)){try{fs.unlinkSync(tempPath)}catch{};return json(res,413,{ok:false,error:"File terlalu besar",maxFileMB:MAX_FILE_MB})}if(total<5||firstChunk.toString("ascii")!=="%PDF-"){try{fs.unlinkSync(tempPath)}catch{};return json(res,400,{ok:false,error:"File bukan PDF yang valid"})}const id="RP-"+crypto.randomBytes(5).toString("hex").toUpperCase(),dir=jobDir(id);fs.mkdirSync(dir,{recursive:true});const outPath=path.join(dir,filename);try{fs.renameSync(tempPath,outPath)}catch{try{fs.copyFileSync(tempPath,outPath)}catch{}try{fs.unlinkSync(tempPath)}catch{}}const now=new Date().toISOString(),job={jobId:id,filename,size:total,createdAt:now,status:"uploaded"};saveJob(job);return json(res,201,{ok:true,job})}));return;
  }
  if(u.pathname==="/api/jobs"&&req.method==="GET"){if(!requireApiKey(req,res))return;const status=u.searchParams.get("status")||"";return json(res,200,{ok:true,jobs:listJobs(status).map(j=>({...j}))})}
  const jobMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})$/),fileMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})\/file$/),claimMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})\/claim$/),statusMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})\/status$/);
  if(req.method==="GET"&&jobMatch){if(!requireApiKey(req,res))return;const job=loadJob(jobMatch[1]);if(!job)return json(res,404,{ok:false,error:"Job tidak ditemukan"});return json(res,200,{ok:true,job})}
  if(req.method==="GET"&&fileMatch){if(!requireApiKey(req,res))return;const job=loadJob(fileMatch[1]);if(!job)return json(res,404,{ok:false,error:"Job tidak ditemukan"});const files=fs.readdirSync(jobDir(job.jobId)).filter(n=>n.toLowerCase().endsWith(".pdf"));if(!files.length)return json(res,404,{ok:false,error:"PDF job tidak ditemukan"});const p=path.join(jobDir(job.jobId),files[0]);res.writeHead(200,{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${files[0].replace(/"/g,"")}"`,"Cache-Control":"no-store"});return fs.createReadStream(p).pipe(res)}
  if(req.method==="DELETE"&&jobMatch){if(!requireApiKey(req,res))return;const job=loadJob(jobMatch[1]);if(!job)return json(res,404,{ok:false,error:"Job tidak ditemukan"});if(job.status!=="uploaded"&&job.status!=="processing")return json(res,409,{ok:false,error:`Job tidak bisa dihapus karena status=${job.status}`,job});try{fs.rmSync(jobDir(job.jobId),{recursive:true,force:true})}catch(err){return json(res,500,{ok:false,error:"Gagal menghapus job",detail:String(err.message||err)})}return json(res,200,{ok:true,jobId:job.jobId,deleted:true})}
  if(req.method==="POST"&&claimMatch){if(!requireApiKey(req,res))return;const job=loadJob(claimMatch[1]);if(!job)return json(res,404,{ok:false,error:"Job tidak ditemukan"});if(job.status!=="uploaded")return json(res,409,{ok:false,error:`Job tidak bisa diambil karena status=${job.status}`,job});let body="";req.on("data",c=>body+=c);req.on("end",()=>{let data={};try{data=body?JSON.parse(body):{}}catch{}job.status="processing";job.claimedBy=String(data.workerId||"quick-print").slice(0,100);job.claimedAt=new Date().toISOString();saveJob(job);json(res,200,{ok:true,job})});return}
  if(req.method==="POST"&&statusMatch){if(!requireApiKey(req,res))return;const job=loadJob(statusMatch[1]);if(!job)return json(res,404,{ok:false,error:"Job tidak ditemukan"});let body="";req.on("data",c=>body+=c);req.on("end",()=>{let data={};try{data=body?JSON.parse(body):{}}catch{}const allowed=["uploaded","processing","printed","error"];if(!allowed.includes(data.status))return json(res,400,{ok:false,error:"Status tidak valid"});job.status=data.status;if(data.message!==undefined)job.message=String(data.message).slice(0,500);job.updatedAt=new Date().toISOString();saveJob(job);json(res,200,{ok:true,job})});return}
  send(res,404,"text/plain","Not Found");
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Revo QR Upload v${APP_VERSION} listening on :${PORT}`));