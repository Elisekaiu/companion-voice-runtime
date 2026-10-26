#!/usr/bin/env python3
import os,time,json,wave,tempfile,traceback
from pathlib import Path

import torch
from funasr import AutoModel

ROOT=Path(os.environ.get("EMOTION_SHADOW_DIR","./data/emotion-shadow")).resolve()
INBOX=ROOT/"inbox"
RESULTS=ROOT/"results"
LOG=ROOT/"shadow-results.jsonl"
HEARTBEAT=ROOT/"worker-heartbeat.json"
MODEL_ID=os.environ.get("EMOTION_SHADOW_MODEL","iic/emotion2vec_plus_base")
THREADS=max(1,int(os.environ.get("EMOTION_SHADOW_THREADS","2")))

for p in (INBOX,RESULTS):
    p.mkdir(parents=True,exist_ok=True)

torch.set_num_threads(THREADS)
torch.set_num_interop_threads(1)

def heartbeat(state="ready"):
    tmp=HEARTBEAT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"state":state,"model":MODEL_ID,"pid":os.getpid(),"at":time.time()}))
    tmp.replace(HEARTBEAT)

model=AutoModel(model=MODEL_ID,hub="hf",device="cpu",disable_update=True,disable_pbar=True,disable_log=True)
heartbeat("ready")
print(json.dumps({"type":"ready","model":MODEL_ID,"root":str(ROOT),"at":time.time()}),flush=True)

def normalize_result(raw):
    item=(raw or [{}])[0] if isinstance(raw,list) else (raw or {})
    labels=list(item.get("labels") or [])
    scores=[float(x) for x in (item.get("scores") or [])]
    pairs=[{"label":str(label),"score":round(score,6)} for label,score in zip(labels,scores)]
    pairs.sort(key=lambda x:x["score"],reverse=True)
    return {"top":pairs[:3]}

def process(meta_path):
    meta=json.loads(meta_path.read_text())
    pcm_path=INBOX/str(meta["pcmFile"])
    if not pcm_path.exists():
        if time.time()-meta_path.stat().st_mtime>30:
            meta_path.unlink(missing_ok=True)
        return

    raw=pcm_path.read_bytes()
    if len(raw)<3200:
        raise ValueError("audio_too_short")
    sample_rate=int(meta.get("sampleRate") or 16000)
    started=time.perf_counter()

    fd,wav_name=tempfile.mkstemp(prefix="emotion-shadow-",suffix=".wav")
    os.close(fd)
    try:
        with wave.open(wav_name,"wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(raw)

        result=model.generate(
            wav_name,
            granularity="utterance",
            extract_embedding=False,
            disable_pbar=True,
            disable_log=True
        )
        elapsed=round((time.perf_counter()-started)*1000,1)
        out={
            "callId":str(meta.get("callId") or ""),
            "utteranceId":str(meta.get("utteranceId") or ""),
            "model":MODEL_ID,
            "durationMs":round(len(raw)/2/sample_rate*1000,1),
            "inferenceMs":elapsed,
            "at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
            **normalize_result(result)
        }

        target=RESULTS/(out["callId"]+"__"+out["utteranceId"]+".json")
        tmp=target.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(out,ensure_ascii=False))
        tmp.replace(target)

        with LOG.open("a") as f:
            f.write(json.dumps(out,ensure_ascii=False)+"\n")

        print(json.dumps({
            "type":"result",
            "callId":out["callId"],
            "utteranceId":out["utteranceId"],
            "top":out["top"],
            "inferenceMs":elapsed
        },ensure_ascii=False),flush=True)
    finally:
        try: os.unlink(wav_name)
        except: pass
        pcm_path.unlink(missing_ok=True)
        meta_path.unlink(missing_ok=True)

last_heartbeat=0.0
while True:
    now=time.time()
    if now-last_heartbeat>=2:
        heartbeat("ready")
        last_heartbeat=now

    jobs=sorted(INBOX.glob("*.json"),key=lambda p:p.stat().st_mtime)
    if not jobs:
        time.sleep(0.2)
        continue

    for job in jobs:
        try:
            process(job)
        except Exception as error:
            print(json.dumps({
                "type":"error",
                "job":job.name,
                "error":str(error),
                "trace":traceback.format_exc(limit=2)
            },ensure_ascii=False),flush=True)
            try:
                meta=json.loads(job.read_text())
                (INBOX/str(meta.get("pcmFile") or "")).unlink(missing_ok=True)
            except: pass
            job.unlink(missing_ok=True)
