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

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function send(res, code, type, data) {
  res.writeHead(code, {"Content-Type": type, "Cache-Control": "no-store"});
  res.end(data);
}
function json(res, code, data) {
  send(res, code, "application/json; charset=utf-8", JSON.stringify(data));
}
function requireApiKey(req, res) {
  if (!JOB_API_KEY) {
    json(res, 503, {ok:false,error:"JOB_API_KEY belum dikonfigurasi"});
    return false;
  }
  if (req.headers["x-api-key"] !== JOB_API_KEY) {
    json(res, 401, {ok:false,error:"Unauthorized"});
    return false;
  }
  return true;
}
function jobDir(jobId) { return path.join(STORAGE_DIR, jobId); }
function jobMetaPath(jobId) { return path.join(jobDir(jobId), "job.json"); }
function loadJob(jobId) {
  if (!/^RP-[A-F0-9]{10}$/.test(jobId)) return null;
  try { return JSON.parse(fs.readFileSync(jobMetaPath(jobId), "utf8")); } catch { return null; }
}
function saveJob(job) {
  fs.writeFileSync(jobMetaPath(job.jobId), JSON.stringify(job, null, 2));
}
function listJobs(status) {
  const rows = [];
  for (const name of fs.readdirSync(STORAGE_DIR, {withFileTypes:true})) {
    if (!name.isDirectory() || !/^RP-[A-F0-9]{10}$/.test(name.name)) continue;
    const job = loadJob(name.name);
    if (!job) continue;
    if (!status || job.status === status) rows.push(job);
  }
  return rows.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
}

function page() {
  return "\n<!doctype html>\n<html lang=\"id\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>REVO PRINT SHOP</title>\n\n<style>\n*{box-sizing:border-box}\n\nbody{\n  margin:0;\n  min-height:100vh;\n  background:#f4f7fb;\n  font-family:Arial,sans-serif;\n  color:#14213d;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  padding:20px;\n}\n\n.card{\n  width:min(700px,100%);\n  background:#fff;\n  border-radius:22px;\n  padding:32px;\n  box-shadow:0 12px 35px rgba(0,0,0,.08);\n}\n\n.header{\n  display:flex;\n  align-items:center;\n  gap:14px;\n  margin-bottom:20px;\n}\n\n.phone{\n  width:28px;\n  height:42px;\n  border:3px solid #159447;\n  border-radius:6px;\n  position:relative;\n  flex:none;\n}\n\n.phone:after{\n  content:\"\";\n  position:absolute;\n  width:5px;\n  height:5px;\n  border-radius:50%;\n  background:#159447;\n  bottom:3px;\n  left:50%;\n  transform:translateX(-50%);\n}\n\nh1{\n  margin:0;\n  font-size:30px;\n  font-weight:700;\n  color:#123b72;\n}\n\n.sub{\n  margin:4px 0 0;\n  color:#667085;\n  font-size:14px;\n}\n\n.ready{\n  border:1px solid #9bd8bd;\n  background:#f1fbf6;\n  border-radius:10px;\n  padding:14px 16px;\n  margin-bottom:16px;\n}\n\n.ready-title{\n  color:#087f43;\n  font-weight:700;\n  font-size:14px;\n}\n\n.ready-text{\n  margin-top:5px;\n  color:#667085;\n  font-size:12px;\n}\n\n.ready-icon{\n  display:inline-flex;\n  width:22px;\n  height:22px;\n  border:2px solid #159447;\n  border-radius:50%;\n  align-items:center;\n  justify-content:center;\n  margin-right:8px;\n  color:#159447;\n  font-weight:700;\n}\n\n.drop{\n  border:2px dashed #72cfa2;\n  border-radius:12px;\n  padding:18px 12px;\n  text-align:center;\n  cursor:pointer;\n  background:#fff;\n}\n\n.drop:hover{\n  background:#f8fffb;\n}\n\n.upload-icon{\n  width:34px;\n  height:34px;\n  margin:0 auto 7px;\n  border-radius:50%;\n  background:#159447;\n  color:#fff;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  font-size:20px;\n  font-weight:bold;\n}\n\n.drop-title{\n  font-size:16px;\n  font-weight:700;\n  color:#14213d;\n}\n\n.drop-help{\n  margin-top:5px;\n  color:#667085;\n  font-size:12px;\n}\n\n.file-row{\n  margin-top:12px;\n}\n\ninput[type=file]{\n  width:100%;\n  font-size:13px;\n  color:#667085;\n}\n\nbutton{\n  width:100%;\n  margin-top:12px;\n  padding:12px;\n  border:0;\n  border-radius:7px;\n  background:#159447;\n  color:#fff;\n  font-size:15px;\n  font-weight:700;\n  cursor:pointer;\n}\n\nbutton:hover{\n  background:#107a3a;\n}\n\nbutton:disabled{\n  opacity:.6;\n  cursor:not-allowed;\n}\n\n.file-info{\n  margin-top:8px;\n  color:#667085;\n  font-size:11px;\n}\n\n.result{\n  margin-top:12px;\n}\n\n.ok{\n  background:#effaf4;\n  padding:12px;\n  border-radius:9px;\n  border:1px solid #b7e4c7;\n  color:#087f43;\n  font-size:13px;\n}\n\n.err{\n  background:#fff5f5;\n  padding:12px;\n  border-radius:9px;\n  border:1px solid #f3b6b6;\n  color:#a33;\n  font-size:13px;\n}\n\n.private{\n  margin-top:16px;\n  border:1px solid #d9eadf;\n  background:#f7fcf9;\n  border-radius:10px;\n  padding:13px 15px;\n}\n\n.private-title{\n  color:#087f43;\n  font-weight:700;\n  font-size:14px;\n}\n\n.private-text{\n  margin-top:4px;\n  color:#667085;\n  font-size:12px;\n}\n\n.footer{\n  margin-top:18px;\n  text-align:center;\n  color:#98a2b3;\n  font-size:11px;\n}\n\n@media(max-width:520px){\n  body{padding:12px}\n\n  .card{\n    padding:22px 16px;\n    border-radius:16px;\n  }\n\n  h1{font-size:24px}\n}\n</style>\n</head>\n\n<body>\n<div class=\"card\">\n\n  <div class=\"header\">\n    <div class=\"phone\"></div>\n\n    <div>\n      <h1>REVO PRINT SHOP</h1>\n      <p class=\"sub\">Kirim file PDF langsung dari HP setelah scan QR.</p>\n    </div>\n  </div>\n\n  <div class=\"ready\">\n    <div class=\"ready-title\">\n      <span class=\"ready-icon\">✓</span>\n      Siap menerima PDF dari HP\n    </div>\n\n    <div class=\"ready-text\">\n      Scan QR di aplikasi Revo Print Shop untuk mulai mengirim PDF.\n    </div>\n  </div>\n\n  <div class=\"drop\" onclick=\"document.getElementById('file').click()\">\n\n    <div class=\"upload-icon\">↑</div>\n\n    <div class=\"drop-title\">\n      Pilih file PDF\n    </div>\n\n    <div class=\"drop-help\">\n      Ketuk area ini atau pilih file untuk mengirim PDF.\n    </div>\n\n    <div class=\"file-row\">\n      <input\n        id=\"file\"\n        type=\"file\"\n        accept=\".pdf,application/pdf\"\n        onclick=\"event.stopPropagation()\">\n    </div>\n\n    <button id=\"upload\" onclick=\"event.stopPropagation()\">\n      Kirim PDF\n    </button>\n\n    <div class=\"file-info\">\n      File harus berformat PDF.\n    </div>\n\n  </div>\n\n  <div id=\"result\" class=\"result\"></div>\n\n  <div class=\"private\">\n    <div class=\"private-title\">\n      🔒 Aman &amp; Privat\n    </div>\n\n    <div class=\"private-text\">\n      File PDF dikirim langsung ke server REVO PRINT SHOP.\n    </div>\n  </div>\n\n  <div class=\"footer\">\n    Powered by Revo Print Shop · QR Upload Service\n  </div>\n\n</div>\n\n<script>\nconst input = document.getElementById('file');\nconst btn = document.getElementById('upload');\nconst result = document.getElementById('result');\n\nbtn.onclick = async () => {\n  const file = input.files[0];\n\n  if(!file){\n    result.innerHTML =\n      '<div class=\"err\">Pilih file PDF terlebih dahulu.</div>';\n    return;\n  }\n\n  if(!file.name.toLowerCase().endsWith('.pdf')){\n    result.innerHTML =\n      '<div class=\"err\">File harus berformat PDF.</div>';\n    return;\n  }\n\n  btn.disabled = true;\n  btn.textContent = 'Mengupload...';\n  result.innerHTML = '';\n\n  try{\n    const r = await fetch('/api/upload',{\n      method:'POST',\n      headers:{\n        'Content-Type':'application/pdf',\n        'X-File-Name':encodeURIComponent(file.name)\n      },\n      body:file\n    });\n\n    const d = await r.json();\n\n    if(!r.ok || !d.ok){\n      throw new Error(d.error || 'Upload gagal.');\n    }\n\n    result.innerHTML =\n      '<div class=\"ok\">' +\n      '<b>Upload berhasil</b><br>' +\n      'File: ' + escapeClient(file.name) +\n      '</div>';\n\n    input.value = '';\n\n  }catch(e){\n    result.innerHTML =\n      '<div class=\"err\">' +\n      escapeClient(e.message) +\n      '</div>';\n  }finally{\n    btn.disabled = false;\n    btn.textContent = 'Kirim PDF';\n  }\n};\n\nfunction escapeClient(s){\n  return String(s).replace(/[&<>\"']/g,function(c){\n    return {\n      '&':'&amp;',\n      '<':'&lt;',\n      '>':'&gt;',\n      '\"':'&quot;',\n      \"'\":'&#39;'\n    }[c];\n  });\n}\n</script>\n\n</body>\n</html>\n";
}

const server=http.createServer((req,res)=>{
  const u = new URL(req.url, "http://localhost");

  if(req.method==="GET" && u.pathname==="/") return send(res,200,"text/html; charset=utf-8",page());
  if(req.method==="GET" && u.pathname==="/health") return json(res,200,{ok:true,service:"revo-qr-upload",version:APP_VERSION,queue:true});
  if(req.method==="GET" && u.pathname==="/qr.png"){
    const p=path.join(__dirname,"qr.png");
    if(!fs.existsSync(p)) return send(res,404,"text/plain","QR not found");
    res.writeHead(200,{"Content-Type":"image/png","Cache-Control":"no-store"});
    return fs.createReadStream(p).pipe(res);
  }

  // Public upload endpoint.
  if(req.method==="POST" && u.pathname==="/api/upload"){
    const raw=req.headers["x-file-name"]||"upload.pdf";
    let filename;
    try{filename=path.basename(decodeURIComponent(raw));}catch{filename=path.basename(raw);}
    filename=filename.replace(/[^\w.\-() ]/g,"_");
    if(!filename.toLowerCase().endsWith(".pdf")) filename+=".pdf";
    const maxBytes=MAX_FILE_MB>0 ? MAX_FILE_MB*1024*1024 : 0;
    const length=Number(req.headers["content-length"]||0);

    if(maxBytes>0 && length>maxBytes){
      return json(res,413,{
        ok:false,
        error:"File terlalu besar",
        maxFileMB:MAX_FILE_MB
      });
    }

    const chunks=[];
    let total=0;
    let tooLarge=false;

    req.on("data",c=>{
      total+=c.length;

      if(maxBytes>0 && total>maxBytes){
        tooLarge=true;
        return;
      }

      chunks.push(c);
    });

    req.on("end",()=>{
      if(tooLarge){
        return json(res,413,{
          ok:false,
          error:"File terlalu besar",
          maxFileMB:MAX_FILE_MB
        });
      }

      const data=Buffer.concat(chunks);
      if(data.length<5 || data.subarray(0,5).toString()!=="%PDF-")
        return json(res,400,{ok:false,error:"File bukan PDF yang valid"});
      const id="RP-"+crypto.randomBytes(5).toString("hex").toUpperCase();
      const dir=jobDir(id);fs.mkdirSync(dir,{recursive:true});
      const out=path.join(dir,filename);fs.writeFileSync(out,data);
      const now=new Date().toISOString();
      const job={jobId:id,filename,size:data.length,createdAt:now,status:"uploaded"};
      saveJob(job);
      json(res,201,{ok:true,job});
    });
    return;
  }

  // Protected Queue API used by Quick Print PDF.
  if(u.pathname==="/api/jobs" && req.method==="GET"){
    if(!requireApiKey(req,res)) return;
    const status=u.searchParams.get("status") || "";
    const jobs=listJobs(status).map(j=>({...j}));
    return json(res,200,{ok:true,jobs});
  }

  const jobMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})$/);
  const fileMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})\/file$/);
  const claimMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})\/claim$/);
  const statusMatch=u.pathname.match(/^\/api\/jobs\/(RP-[A-F0-9]{10})\/status$/);

  if(req.method==="GET" && jobMatch){
    if(!requireApiKey(req,res)) return;
    const job=loadJob(jobMatch[1]); if(!job) return json(res,404,{ok:false,error:"Job tidak ditemukan"});
    return json(res,200,{ok:true,job});
  }

  if(req.method==="GET" && fileMatch){
    if(!requireApiKey(req,res)) return;
    const job=loadJob(fileMatch[1]); if(!job) return json(res,404,{ok:false,error:"Job tidak ditemukan"});
    const files=fs.readdirSync(jobDir(job.jobId)).filter(n=>n.toLowerCase().endsWith(".pdf"));
    if(!files.length) return json(res,404,{ok:false,error:"PDF job tidak ditemukan"});
    const p=path.join(jobDir(job.jobId),files[0]);
    res.writeHead(200,{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${files[0].replace(/"/g,"")}"`,"Cache-Control":"no-store"});
    return fs.createReadStream(p).pipe(res);
  }

  if(req.method==="DELETE" && jobMatch){
  if(!requireApiKey(req,res)) return;

  const jobId=jobMatch[1];
  const job=loadJob(jobId);

  if(!job){
    return json(res,404,{ok:false,error:"Job tidak ditemukan"});
  }

  if(job.status!=="uploaded" && job.status!=="processing"){
    return json(res,409,{
      ok:false,
      error:`Job tidak bisa dihapus karena status=${job.status}`,
      job
    });
  }

  const dir=jobDir(jobId);

  try{
    fs.rmSync(dir,{recursive:true,force:true});
  }catch(err){
    console.error("[QR Queue] Delete failed:",jobId,err);
    return json(res,500,{
      ok:false,
      error:"Gagal menghapus job",
      detail:String(err.message||err)
    });
  }

  return json(res,200,{
    ok:true,
    jobId,
    deleted:true
  });
}

if(req.method==="POST" && claimMatch){
    if(!requireApiKey(req,res)) return;
    const job=loadJob(claimMatch[1]); if(!job) return json(res,404,{ok:false,error:"Job tidak ditemukan"});
    if(job.status!=="uploaded") return json(res,409,{ok:false,error:`Job tidak bisa diambil karena status=${job.status}`,job});
    let body="";req.on("data",c=>body+=c);req.on("end",()=>{
      let data={};try{data=body?JSON.parse(body):{}}catch{}
      job.status="processing";
      job.claimedBy=String(data.workerId||"quick-print").slice(0,100);
      job.claimedAt=new Date().toISOString();
      saveJob(job);
      json(res,200,{ok:true,job});
    });return;
  }

  if(req.method==="POST" && statusMatch){
    if(!requireApiKey(req,res)) return;
    const job=loadJob(statusMatch[1]); if(!job) return json(res,404,{ok:false,error:"Job tidak ditemukan"});
    let body="";req.on("data",c=>body+=c);req.on("end",()=>{
      let data={};try{data=body?JSON.parse(body):{}}catch{}
      const allowed=["uploaded","processing","printed","error"];
      if(!allowed.includes(data.status)) return json(res,400,{ok:false,error:"Status tidak valid"});
      job.status=data.status;
      if(data.message!==undefined) job.message=String(data.message).slice(0,500);
      job.updatedAt=new Date().toISOString();
      saveJob(job);
      json(res,200,{ok:true,job});
    });return;
  }

  send(res,404,"text/plain","Not Found");
});

server.listen(PORT,"0.0.0.0",()=>console.log(`Revo QR Upload v${APP_VERSION} listening on :${PORT}`));
