import { useCallback, useEffect, useRef, useState } from "react";

const API = "http://127.0.0.1:8000";
const SUPPORTED_EXTS = new Set([".jpg",".jpeg",".png",".gif",".webp",".bmp",".tif",".tiff"]);
const HS = 8;
const MIN_PX = 20;

const hexToRgb = (hex) => [
  parseInt(hex.slice(1,3),16),
  parseInt(hex.slice(3,5),16),
  parseInt(hex.slice(5,7),16),
];

const drawLine = (ctx,x1,y1,x2,y2) => {
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
};

const drawHandles = (ctx, rect, L, col) => {
  const rx=rect.x*L.s+L.ox, ry=rect.y*L.s+L.oy, rw=rect.w*L.s, rh=rect.h*L.s;
  const pts=[[rx,ry],[rx+rw/2,ry],[rx+rw,ry],[rx+rw,ry+rh/2],
             [rx+rw,ry+rh],[rx+rw/2,ry+rh],[rx,ry+rh],[rx,ry+rh/2]];
  ctx.strokeStyle="#000"; ctx.lineWidth=1;
  pts.forEach(([hx,hy])=>{
    ctx.fillStyle=col;
    ctx.fillRect(hx-HS/2,hy-HS/2,HS,HS);
    ctx.strokeRect(hx-HS/2,hy-HS/2,HS,HS);
  });
};

const HIT_IDS = ["tl","t","tr","r","br","b","bl","l"];
const hitTest = (px,py,rect,L) => {
  const rx=rect.x*L.s+L.ox, ry=rect.y*L.s+L.oy, rw=rect.w*L.s, rh=rect.h*L.s;
  const ht=HS+5;
  const pts=[[rx,ry],[rx+rw/2,ry],[rx+rw,ry],[rx+rw,ry+rh/2],
             [rx+rw,ry+rh],[rx+rw/2,ry+rh],[rx,ry+rh],[rx,ry+rh/2]];
  for (let i=0;i<pts.length;i++)
    if (Math.abs(px-pts[i][0])<=ht/2 && Math.abs(py-pts[i][1])<=ht/2) return HIT_IDS[i];
  if (px>=rx&&px<=rx+rw&&py>=ry&&py<=ry+rh) return "body";
  return null;
};

const CURSOR_MAP = {
  tl:"nwse-resize",br:"nwse-resize",tr:"nesw-resize",bl:"nesw-resize",
  t:"ns-resize",b:"ns-resize",l:"ew-resize",r:"ew-resize",body:"move",
};

const mkOvr = (nw,nh) => ({
  x:Math.round(nw*.2), y:Math.round(nh*.2),
  w:Math.round(nw*.6), h:Math.round(nh*.6),
  shape:"rectangle", color:"#141414", opacity:220, angle:0,
});

export default function ImageEditor({ image, imagesDir, onClose, onRefresh, onSelectImage, onDirtyChange }) {
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const nativeImg    = useRef(null);
  const drag         = useRef(null);
  const fileInputRef = useRef(null);

  const [isDragOver,  setIsDragOver]  = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [natSize,  setNatSize]  = useState({w:0,h:0});
  const [canvSize, setCanvSize] = useState({w:600,h:400});
  const [cursor,   setCursor]   = useState("default");

  // mode: "resize" | "crop" | "overlay"
  const [mode, setMode] = useState("resize");

  // crop
  const [cropR,       setCropR]       = useState(null);
  const [cropEnabled, setCropEnabled] = useState(false);

  // overlays
  const [overlays, setOverlays] = useState([]);
  const [selOvr,   setSelOvr]   = useState(null);

  // resize
  const [resW,    setResW]    = useState("");
  const [resH,    setResH]    = useState("");
  const [keepAsp, setKeepAsp] = useState(true);

  // save
  const [saveName,     setSaveName]     = useState("");
  const [fmt,          setFmt]          = useState("jpg");
  const [outDir,       setOutDir]       = useState("");
  const [isSaving,     setIsSaving]     = useState(false);
  const [saveMsg,      setSaveMsg]      = useState(null);
  const [isPickingOut, setIsPickingOut] = useState(false);
  // dirty
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = useCallback(() => { setIsDirty(true); onDirtyChange?.(true); }, [onDirtyChange]);
  const clearDirty = useCallback(() => { setIsDirty(false); onDirtyChange?.(false); }, [onDirtyChange]);

  // ── Layout ───────────────────────────────────────────────────────────────────
  const getLayout = useCallback((cw,ch,nw,nh) => {
    if (!nw||!nh) return {s:1,ox:0,oy:0};
    const pad = 14; // отступ, чтобы ручки не уходили за край
    const s = Math.min((cw-pad*2)/nw, (ch-pad*2)/nh);
    return {s, ox:(cw-nw*s)/2, oy:(ch-nh*s)/2};
  },[]);

  // ── Draw ─────────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = nativeImg.current;
    if (!canvas||!img?.complete||!img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    const nw=img.naturalWidth, nh=img.naturalHeight;
    const {w:cw,h:ch} = canvSize;
    const L = getLayout(cw,ch,nw,nh);

    ctx.clearRect(0,0,cw,ch);
    ctx.drawImage(img,L.ox,L.oy,nw*L.s,nh*L.s);

    // crop overlay
    if (mode==="crop" && cropR) {
      const {x,y,w,h}=cropR;
      ctx.fillStyle="rgba(0,0,0,0.55)";
      ctx.fillRect(L.ox,          L.oy,           nw*L.s, y*L.s);
      ctx.fillRect(L.ox,          L.oy+(y+h)*L.s, nw*L.s, (nh-y-h)*L.s);
      ctx.fillRect(L.ox,          L.oy+y*L.s,     x*L.s,  h*L.s);
      ctx.fillRect(L.ox+(x+w)*L.s,L.oy+y*L.s,   (nw-x-w)*L.s, h*L.s);
      const rx=x*L.s+L.ox,ry=y*L.s+L.oy,rw=w*L.s,rh=h*L.s;
      ctx.strokeStyle="#fff"; ctx.lineWidth=1; ctx.setLineDash([]);
      ctx.strokeRect(rx,ry,rw,rh);
      ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=0.5;
      [1,2].forEach(i=>{
        drawLine(ctx,rx+rw*i/3,ry,rx+rw*i/3,ry+rh);
        drawLine(ctx,rx,ry+rh*i/3,rx+rw,ry+rh*i/3);
      });
      drawHandles(ctx,cropR,L,"#ffffff");
    }

    // render all overlays
    overlays.forEach((ovr,idx) => {
      const rx=ovr.x*L.s+L.ox, ry=ovr.y*L.s+L.oy, rw=ovr.w*L.s, rh=ovr.h*L.s;
      const cx=rx+rw/2, cy=ry+rh/2;
      const [r,g,b]=hexToRgb(ovr.color);
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(ovr.angle*Math.PI/180);
      ctx.fillStyle=`rgba(${r},${g},${b},${ovr.opacity/255})`;
      ctx.beginPath();
      if (ovr.shape==="ellipse") ctx.ellipse(0,0,rw/2,rh/2,0,0,Math.PI*2);
      else ctx.rect(-rw/2,-rh/2,rw,rh);
      ctx.fill();
      ctx.restore();
      if (mode==="overlay" && idx===selOvr) {
        drawHandles(ctx,ovr,L,"#3b82f6");
        // outline
        ctx.save();
        ctx.translate(cx,cy);
        ctx.rotate(ovr.angle*Math.PI/180);
        ctx.strokeStyle="#3b82f6"; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
        if (ovr.shape==="ellipse") { ctx.beginPath(); ctx.ellipse(0,0,rw/2,rh/2,0,0,Math.PI*2); ctx.stroke(); }
        else ctx.strokeRect(-rw/2,-rh/2,rw,rh);
        ctx.restore();
      }
    });
  }, [mode,cropR,overlays,selOvr,canvSize,getLayout]);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el=containerRef.current; if (!el) return;
    const ro=new ResizeObserver(entries=>{
      const {width,height}=entries[0].contentRect;
      setCanvSize({w:Math.max(1,Math.floor(width)),h:Math.max(1,Math.floor(height))});
    });
    ro.observe(el); return ()=>ro.disconnect();
  },[]);

  useEffect(()=>{draw();},[draw]);

  useEffect(()=>{
    if (!image) return;
    const img=new window.Image();
    img.onload=()=>{
      nativeImg.current=img;
      const nw=img.naturalWidth, nh=img.naturalHeight;
      setNatSize({w:nw,h:nh});
      setCropR({x:0,y:0,w:nw,h:nh});
      setCropEnabled(false);
      setOverlays([]);
      setSelOvr(null);
      setResW(String(nw)); setResH(String(nh));
      setSaveName(image.filename.replace(/\.[^/.]+$/,""));
      setMode("resize"); setSaveMsg(null);
      clearDirty();
    };
    img.src=image.url;
  },[image, clearDirty]);

  useEffect(() => {
    if (!imagesDir || outDir) return;
    const id = setTimeout(() => setOutDir(imagesDir), 0);
    return () => clearTimeout(id);
  }, [imagesDir, outDir]);

  // Delete key removes selected overlay
  useEffect(()=>{
    const handler=(e)=>{
      // не удалять при фокусе на input/select
      const tag = document.activeElement?.tagName;
      if (tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return;
      if (e.key==="Delete"&&mode==="overlay"&&selOvr!==null) {
        const next = overlays.filter((_,i)=>i!==selOvr);
        setOverlays(next);
        setSelOvr(next.length>0 ? Math.min(selOvr, next.length-1) : null);
        markDirty();
      }
    };
    window.addEventListener("keydown",handler);
    return ()=>window.removeEventListener("keydown",handler);
  },[mode, selOvr, overlays, markDirty]);

  // ── Mouse ─────────────────────────────────────────────────────────────────────
  const getPos=(e)=>{
    const r=canvasRef.current.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
  };

  const onMouseDown=(e)=>{
    if (!canvasRef.current) return;
    const L=getLayout(canvSize.w,canvSize.h,natSize.w,natSize.h);
    const p=getPos(e);

    if (mode==="crop"&&cropR) {
      const hit=hitTest(p.x,p.y,cropR,L); if (!hit) return;
      e.preventDefault();
      drag.current={hit,sx:p.x,sy:p.y,sr:{...cropR},L,nw:natSize.w,nh:natSize.h,target:"crop"};
      return;
    }
    if (mode==="overlay") {
      // Try selected first, then others
      let picked=null;
      const tryOrder=[...overlays.keys()].filter(i=>i===selOvr).concat([...overlays.keys()].filter(i=>i!==selOvr));
      for (const i of tryOrder) {
        const hit=hitTest(p.x,p.y,overlays[i],L);
        if (hit) { picked={i,hit}; break; }
      }
      if (!picked) { setSelOvr(null); return; }
      setSelOvr(picked.i);
      e.preventDefault();
      drag.current={hit:picked.hit,sx:p.x,sy:p.y,sr:{...overlays[picked.i]},L,nw:natSize.w,nh:natSize.h,target:"overlay",idx:picked.i};
    }
  };

  const onMouseMove=(e)=>{
    if (!canvasRef.current) return;
    const L=getLayout(canvSize.w,canvSize.h,natSize.w,natSize.h);
    const p=getPos(e);

    if (!drag.current) {
      if (mode==="crop"&&cropR) {
        const hit=hitTest(p.x,p.y,cropR,L);
        setCursor(hit ? (CURSOR_MAP[hit]||"crosshair") : "crosshair");
      } else if (mode==="overlay") {
        let cur="default";
        if (selOvr!==null) { const h=hitTest(p.x,p.y,overlays[selOvr],L); if(h) cur=CURSOR_MAP[h]||"default"; }
        if (cur==="default") { for(const o of overlays){ if(hitTest(p.x,p.y,o,L)){cur="pointer";break;} } }
        setCursor(cur);
      } else { setCursor("default"); }
      return;
    }

    const {hit,sx,sy,sr,nw,nh}=drag.current;
    const dx=(p.x-sx)/L.s, dy=(p.y-sy)/L.s;
    let {x,y,w,h}=sr;
    if (hit==="body") {
      x=Math.max(0,Math.min(nw-w,x+dx));
      y=Math.max(0,Math.min(nh-h,y+dy));
    } else {
      if (hit.includes("l")){const nx=Math.min(x+w-MIN_PX,x+dx);w-=nx-x;x=nx;}
      if (hit.includes("r")) w=Math.max(MIN_PX,w+dx);
      if (hit.includes("t")){const ny=Math.min(y+h-MIN_PX,y+dy);h-=ny-y;y=ny;}
      if (hit.includes("b")) h=Math.max(MIN_PX,h+dy);
      x=Math.max(0,x); y=Math.max(0,y);
      w=Math.min(nw-x,w); h=Math.min(nh-y,h);
    }
    const nr={x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h)};
    if (drag.current.target==="crop") setCropR(nr);
    else setOverlays(prev=>prev.map((o,i)=>i===drag.current.idx?{...o,...nr}:o));
    markDirty();
  };

  const onMouseUp=()=>{drag.current=null;};

  // ── Resize controls ───────────────────────────────────────────────────────────
  const onResW=(v)=>{setResW(v);if(keepAsp&&natSize.w&&v)setResH(String(Math.round(+v*natSize.h/natSize.w)));};
  const onResH=(v)=>{setResH(v);if(keepAsp&&natSize.h&&v)setResW(String(Math.round(+v*natSize.w/natSize.h)));};

  // ── Overlay helpers ───────────────────────────────────────────────────────────
  const updateSelOvr=(updates)=>{
    setOverlays(prev=>prev.map((o,i)=>i===selOvr?{...o,...updates}:o));
    markDirty();
  };

  const addOverlay=()=>{
    const nw=natSize.w||600, nh=natSize.h||400;
    const newOvr=mkOvr(nw,nh);
    setOverlays(prev=>[...prev,newOvr]);
    setSelOvr(overlays.length);
    markDirty();
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handlePickOutDir=async()=>{
    setIsPickingOut(true);
    try {
      const res=await fetch(`${API}/images/pick-folder`);
      const d=await res.json();
      if(d.path) setOutDir(d.path);
    } catch(e){console.error(e);}
    finally{setIsPickingOut(false);}
  };

  const handleSave=async()=>{
    if (!image||!saveName.trim()||!outDir.trim()) return;
    setIsSaving(true); setSaveMsg(null);
    try {
      const isFullCrop=cropR&&cropR.x===0&&cropR.y===0&&cropR.w===natSize.w&&cropR.h===natSize.h;
      const resizeParam=(resW||resH)?{width:resW?+resW:null,height:resH?+resH:null,keep_aspect:keepAsp}:null;
      const cropParam=(cropEnabled&&cropR&&!isFullCrop)?{x:cropR.x,y:cropR.y,width:cropR.w,height:cropR.h}:null;

      if (mode==="overlay"&&overlays.length>0) {
        const body={
          filename:image.filename, custom_name:saveName.trim(),
          output_format:fmt, output_dir:outDir,
          resize:resizeParam, crop:cropParam,
          overlays:overlays.map(o=>({shape:o.shape,x:o.x,y:o.y,width:o.w,height:o.h,color:hexToRgb(o.color),opacity:o.opacity,angle:o.angle})),
        };
        const res=await fetch(`${API}/images/save-quiz-pair`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if (!res.ok){const e=await res.json().catch(()=>({detail:res.statusText}));throw new Error(e.detail);}
        const d=await res.json();
        setSaveMsg({ok:true,text:`"${d.question_file}" и "${d.answer_file}"`});
      } else {
        const body={filename:image.filename,custom_name:saveName.trim(),output_format:fmt,output_dir:outDir,resize:resizeParam,crop:cropParam};
        const res=await fetch(`${API}/images/save-single`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if (!res.ok){const e=await res.json().catch(()=>({detail:res.statusText}));throw new Error(e.detail);}
        const d=await res.json();
        setSaveMsg({ok:true,text:`"${d.file}"`});
      }
      clearDirty();
    } catch(err){
      setSaveMsg({ok:false,text:`Ошибка: ${err.message}`});
    } finally{setIsSaving(false);}
  };

  // ── Upload helpers ────────────────────────────────────────────────────────────
  const uploadFile=async(file)=>{
    const ext="."+file.name.split(".").pop().toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)){alert(`Неподдерживаемый формат: ${ext}`);return null;}
    setIsUploading(true);
    try {
      const fd=new FormData(); fd.append("file",file);
      const res=await fetch(`${API}/images/upload`,{method:"POST",body:fd});
      if (!res.ok){const e=await res.json().catch(()=>({detail:res.statusText}));throw new Error(e.detail);}
      return await res.json();
    } finally{setIsUploading(false);}
  };

  const handleDrop=useCallback(async(e)=>{
    e.preventDefault(); setIsDragOver(false);
    const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/"));
    if (!files.length) return;
    const r=await uploadFile(files[0]);
    if (r){await onRefresh();onSelectImage({filename:r.filename,url:`${API}/images/file/${encodeURIComponent(r.filename)}`});}
  },[onRefresh,onSelectImage]);

  // ── Style helpers ─────────────────────────────────────────────────────────────
  const S={
    section:{padding:"10px 12px",borderBottom:"1px solid #1e293b"},
    label:{fontSize:"11px",color:"#64748b",marginBottom:"3px",display:"block"},
    input:{width:"100%",padding:"5px 8px",borderRadius:"4px",backgroundColor:"#0a0f1a",
           border:"1px solid #334155",color:"#e2e8f0",fontSize:"12px",boxSizing:"border-box"},
    title:{fontSize:"10px",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:"7px"},
  };

  const modeBtn=(id,label,col)=>{
    const active=mode===id;
    const rgb=col==="#10b981"?"16,185,129":col==="#8b5cf6"?"139,92,246":"59,130,246";
    return (
      <button key={id} onClick={()=>setMode(id)} style={{
        padding:"5px 10px",borderRadius:"4px",fontSize:"11px",cursor:"pointer",
        border:`1px solid ${active?col:"#334155"}`,
        backgroundColor:active?`rgba(${rgb},0.15)`:"transparent",
        color:active?col:"#64748b",fontWeight:active?"600":"400",
      }}>{label}</button>
    );
  };

  const togBtn=(active,label,onClick,col="#8b5cf6")=>{
    const rgb=col==="#8b5cf6"?"139,92,246":"59,130,246";
    return (
      <button onClick={onClick} style={{
        flex:1,padding:"5px 8px",borderRadius:"4px",fontSize:"11px",cursor:"pointer",
        border:`1px solid ${active?col:"#334155"}`,
        backgroundColor:active?`rgba(${rgb},0.15)`:"transparent",
        color:active?col:"#64748b",
      }}>{label}</button>
    );
  };

  // ── Drop zone ─────────────────────────────────────────────────────────────────
  if (!image) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",padding:"20px"}}>
      <div
        onDrop={handleDrop}
        onDragOver={(e)=>{e.preventDefault();setIsDragOver(true);}}
        onDragLeave={(e)=>{if(!e.currentTarget.contains(e.relatedTarget))setIsDragOver(false);}}
        onClick={()=>!isUploading&&fileInputRef.current?.click()}
        style={{flex:1,minHeight:"280px",border:`2px dashed ${isDragOver?"#3b82f6":"#334155"}`,
          borderRadius:"12px",display:"flex",flexDirection:"column",justifyContent:"center",
          alignItems:"center",gap:"14px",backgroundColor:isDragOver?"rgba(59,130,246,0.07)":"transparent",
          cursor:isUploading?"wait":"pointer",transition:"all 0.2s"}}
      >
        <div style={{fontSize:"52px",lineHeight:1}}>{isUploading?"⏳":"🖼"}</div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:"14px",fontWeight:"500",color:isDragOver?"#93c5fd":"#94a3b8",marginBottom:"6px"}}>
            {isUploading?"Загрузка...":isDragOver?"Отпустите для загрузки":"Перетащите изображение сюда"}
          </div>
          {!isUploading&&<>
            <div style={{fontSize:"12px",color:"#64748b"}}>или нажмите для выбора файла</div>
            <div style={{fontSize:"11px",color:"#475569",marginTop:"8px"}}>JPEG · PNG · GIF · WebP · BMP</div>
          </>}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{display:"none"}}
          onChange={async(e)=>{
            if(e.target.files?.[0]){
              const r=await uploadFile(e.target.files[0]);
              if(r){await onRefresh();onSelectImage({filename:r.filename,url:`${API}/images/file/${encodeURIComponent(r.filename)}`});}
            }
            e.target.value="";
          }}
        />
      </div>
      <div style={{marginTop:"12px",fontSize:"11px",color:"#475569",textAlign:"center"}}>
        Или выберите изображение из панели слева
      </div>
    </div>
  );

  // ── Editor ────────────────────────────────────────────────────────────────────
  const selO = selOvr!==null ? overlays[selOvr] : null;

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* Header */}
      <div style={{padding:"10px 16px",borderBottom:"1px solid #334155",backgroundColor:"#1e293b",
        display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontSize:"13px",fontWeight:"500",color:"#f1f5f9",overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
          {image.filename}
          {natSize.w>0&&<span style={{marginLeft:"8px",fontSize:"11px",color:isDirty?"#f59e0b":"#64748b"}}>{natSize.w}×{natSize.h}px{isDirty?" · изменено":""}</span>}
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:"#64748b",
          fontSize:"18px",cursor:"pointer",padding:"0 4px",flexShrink:0,lineHeight:1}}>✕</button>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Canvas area — position:relative + canvas position:absolute fixes overflow */}
        <div ref={containerRef}
          onDrop={handleDrop}
          onDragOver={(e)=>{e.preventDefault();setIsDragOver(true);}}
          onDragLeave={(e)=>{if(!e.currentTarget.contains(e.relatedTarget))setIsDragOver(false);}}
          style={{flex:1,position:"relative",overflow:"hidden",backgroundColor:"#070c14",minWidth:0,
            outline:isDragOver?"2px solid #3b82f6":"none"}}
        >
          <canvas ref={canvasRef} width={canvSize.w} height={canvSize.h}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{position:"absolute",top:0,left:0,display:"block",cursor}}
          />
          {isDragOver&&(
            <div style={{position:"absolute",inset:0,backgroundColor:"rgba(59,130,246,0.12)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:"14px",color:"#93c5fd",fontWeight:"500",pointerEvents:"none"}}>
              Отпустите для замены изображения
            </div>
          )}
        </div>

        {/* Controls panel */}
        <div style={{width:"262px",borderLeft:"1px solid #334155",backgroundColor:"#1e293b",
          display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"}}>

          {/* Режим */}
          <div style={S.section}>
            <div style={S.title}>Режим</div>
            <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
              {modeBtn("resize","Размер","#3b82f6")}
              {modeBtn("crop",  "Обрезка","#10b981")}
              {modeBtn("overlay","Фигура","#8b5cf6")}
            </div>
          </div>

          {/* ── Размер ── */}
          {mode==="resize"&&(
            <div style={S.section}>
              <div style={S.title}>Изменить размер</div>
              <div style={{display:"flex",gap:"6px",marginBottom:"6px"}}>
                <div style={{flex:1}}>
                  <label style={S.label}>Ширина</label>
                  <input style={S.input} type="number" value={resW} onChange={e=>{onResW(e.target.value);markDirty();}} min="1"/>
                </div>
                <div style={{flex:1}}>
                  <label style={S.label}>Высота</label>
                  <input style={S.input} type="number" value={resH} onChange={e=>{onResH(e.target.value);markDirty();}} min="1"/>
                </div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"11px",color:"#94a3b8",cursor:"pointer",marginBottom:"8px"}}>
                <input type="checkbox" checked={keepAsp} onChange={e=>setKeepAsp(e.target.checked)}/>
                Сохранять пропорции
              </label>
              <button onClick={()=>setSaveMsg({ok:true,text:`Размер ${resW}×${resH} будет применён при сохранении`})}
                style={{width:"100%",padding:"6px",borderRadius:"4px",border:"1px solid #3b82f6",
                  backgroundColor:"rgba(59,130,246,0.12)",color:"#93c5fd",fontSize:"11px",cursor:"pointer"}}>
                Применить
              </button>
            </div>
          )}

          {/* ── Обрезка ── */}
          {mode==="crop"&&cropR&&(
            <div style={S.section}>
              <div style={S.title}>Область обрезки (px)</div>
              <div style={{marginBottom:"6px",fontSize:"11px",color:"#64748b"}}>
                Тяните прямоугольник или его ручки
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px",marginBottom:"8px"}}>
                {[["X",cropR.x,v=>setCropR(r=>({...r,x:Math.max(0,+v)}))],
                  ["Y",cropR.y,v=>setCropR(r=>({...r,y:Math.max(0,+v)}))],
                  ["Ш",cropR.w,v=>setCropR(r=>({...r,w:Math.max(1,+v)}))],
                  ["В",cropR.h,v=>setCropR(r=>({...r,h:Math.max(1,+v)}))]
                ].map(([lbl,val,setter])=>(
                  <div key={lbl}>
                    <label style={S.label}>{lbl}</label>
                    <input style={S.input} type="number" value={val} onChange={e=>{setter(e.target.value);markDirty();}}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:"6px"}}>
                <button onClick={()=>{setCropEnabled(true);setSaveMsg({ok:true,text:"Обрезка будет применена при сохранении"});}}
                  style={{flex:1,padding:"6px",borderRadius:"4px",border:"none",
                    backgroundColor:"#10b981",color:"#fff",fontSize:"11px",cursor:"pointer",fontWeight:"600"}}>
                  Применить
                </button>
                <button onClick={()=>{setCropR({x:0,y:0,w:natSize.w,h:natSize.h});setCropEnabled(false);}}
                  style={{flex:1,padding:"6px",borderRadius:"4px",border:"1px solid #334155",
                    backgroundColor:"transparent",color:"#64748b",fontSize:"11px",cursor:"pointer"}}>
                  Сбросить
                </button>
              </div>
              {cropEnabled&&<div style={{marginTop:"6px",fontSize:"10px",color:"#34d399"}}>✓ обрезка применена</div>}
            </div>
          )}

          {/* ── Фигуры ── */}
          {mode==="overlay"&&(
            <div style={S.section}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"7px"}}>
                <div style={S.title}>Фигуры ({overlays.length})</div>
                <button onClick={addOverlay}
                  style={{padding:"3px 10px",borderRadius:"4px",border:"1px solid #8b5cf6",
                    backgroundColor:"rgba(139,92,246,0.12)",color:"#c4b5fd",fontSize:"11px",cursor:"pointer"}}>
                  + Добавить
                </button>
              </div>

              {/* Список фигур */}
              {overlays.length===0&&(
                <div style={{fontSize:"11px",color:"#475569",textAlign:"center",padding:"8px 0"}}>
                  Нажмите «+ Добавить»
                </div>
              )}
              {overlays.map((o,i)=>(
                <div key={i} onClick={()=>setSelOvr(i)}
                  style={{display:"flex",alignItems:"center",gap:"6px",padding:"4px 6px",
                    borderRadius:"4px",marginBottom:"3px",cursor:"pointer",
                    backgroundColor:i===selOvr?"rgba(139,92,246,0.15)":"transparent",
                    border:`1px solid ${i===selOvr?"#8b5cf6":"transparent"}`}}>
                  <div style={{width:"14px",height:"14px",flexShrink:0,backgroundColor:o.color,
                    borderRadius:o.shape==="ellipse"?"50%":"2px",opacity:o.opacity/255,border:"1px solid #475569"}}/>
                  <span style={{fontSize:"11px",color:i===selOvr?"#c4b5fd":"#94a3b8",flex:1}}>
                    Фигура {i+1} · {o.shape==="ellipse"?"эллипс":"прям."}
                  </span>
                  <button
                    onClick={(e)=>{
                      e.stopPropagation();
                      const next=overlays.filter((_,j)=>j!==i);
                      setOverlays(next);
                      setSelOvr(next.length>0?Math.min(i,next.length-1):null);
                      markDirty();
                    }}
                    title="Удалить фигуру"
                    style={{background:"transparent",border:"none",cursor:"pointer",
                      color:"#64748b",fontSize:"14px",padding:"0 2px",flexShrink:0,
                      lineHeight:1,opacity:0.7}}
                  >🗑️</button>
                </div>
              ))}

              {/* Параметры выбранной фигуры */}
              {selO&&(
                <div style={{marginTop:"8px",paddingTop:"8px",borderTop:"1px solid #1e293b"}}>
                  <div style={{display:"flex",gap:"4px",marginBottom:"8px"}}>
                    {togBtn(selO.shape==="rectangle","Прямоугольник",()=>updateSelOvr({shape:"rectangle"}))}
                    {togBtn(selO.shape==="ellipse","Эллипс",()=>updateSelOvr({shape:"ellipse"}))}
                  </div>
                  <label style={S.label}>Цвет</label>
                  <input type="color" value={selO.color} onChange={e=>updateSelOvr({color:e.target.value})}
                    style={{width:"100%",height:"30px",borderRadius:"4px",border:"1px solid #334155",
                      backgroundColor:"#0a0f1a",cursor:"pointer",marginBottom:"8px",display:"block"}}/>
                  <label style={S.label}>Непрозрачность: {Math.round(selO.opacity/255*100)}%</label>
                  <input type="range" min="20" max="255" value={selO.opacity}
                    onChange={e=>updateSelOvr({opacity:+e.target.value})} style={{width:"100%",marginBottom:"8px"}}/>
                  <label style={S.label}>Поворот: {selO.angle}°</label>
                  <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                    <input type="range" min="0" max="359" value={selO.angle}
                      onChange={e=>updateSelOvr({angle:+e.target.value})} style={{flex:1}}/>
                    <input type="number" min="0" max="359" value={selO.angle}
                      onChange={e=>updateSelOvr({angle:(+e.target.value+360)%360})}
                      style={{...S.input,width:"52px",padding:"4px 6px",fontSize:"11px",textAlign:"center"}}/>
                  </div>
                </div>
              )}
              {selOvr!==null&&<div style={{marginTop:"6px",fontSize:"10px",color:"#64748b"}}>
                Клавиша Delete удаляет выбранную фигуру
              </div>}
            </div>
          )}

          {/* ── Сохранить ── */}
          <div style={{...S.section,flex:1}}>
            <div style={S.title}>Сохранить</div>
            <label style={S.label}>Название файла</label>
            <input style={{...S.input,marginBottom:"8px"}} value={saveName}
              onChange={e=>setSaveName(e.target.value)} placeholder="Название"/>
            <label style={S.label}>Формат</label>
            <select style={{...S.input,marginBottom:"8px"}} value={fmt} onChange={e=>setFmt(e.target.value)}>
              <option value="jpg">JPEG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
            </select>
            <label style={S.label}>Папка вывода</label>
            <div style={{display:"flex",gap:"5px",marginBottom:"10px"}}>
              <input style={{...S.input,flex:1,fontFamily:"monospace",fontSize:"11px",marginBottom:0}}
                value={outDir} onChange={e=>setOutDir(e.target.value)} placeholder="C:/путь"/>
              <button onClick={handlePickOutDir} disabled={isPickingOut} title="Выбрать папку"
                style={{padding:"5px 8px",borderRadius:"4px",border:"1px solid #334155",
                  backgroundColor:isPickingOut?"#1e293b":"transparent",
                  color:isPickingOut?"#475569":"#94a3b8",
                  fontSize:"13px",cursor:isPickingOut?"wait":"pointer",flexShrink:0}}>📁</button>
            </div>
            {(() => {
              const isQuiz = mode==="overlay";
              const disabled = isSaving||!saveName.trim()||!outDir.trim()||(isQuiz&&overlays.length===0);
              const label = isSaving?"Сохранение...":isQuiz?"Сохранить вопрос и ответ":"Сохранить изображение";
              return (
                <button onClick={handleSave} disabled={disabled}
                  style={{width:"100%",padding:"9px",borderRadius:"4px",border:"none",
                    backgroundColor:disabled?"#1e3a2e":"#10b981",
                    color:disabled?"#475569":"#fff",
                    fontSize:"12px",fontWeight:"600",
                    cursor:disabled?"not-allowed":"pointer"}}>
                  {label}
                </button>
              );
            })()}
            {saveMsg&&(
              <div style={{marginTop:"8px",padding:"8px",borderRadius:"4px",lineHeight:"1.5",
                backgroundColor:saveMsg.ok?"rgba(16,185,129,0.1)":"rgba(239,68,68,0.1)",
                fontSize:"11px",color:saveMsg.ok?"#34d399":"#fca5a5",wordBreak:"break-word"}}>
                {saveMsg.ok?"Сохранено: ":""}{saveMsg.text}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
