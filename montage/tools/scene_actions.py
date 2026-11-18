#!/usr/bin/env python3
"""Per-scene sharpness and motion: where each action starts, peaks and ends.
Usage: python3 scene_actions.py clip1.mp4 clip2.mp4 ...  (names without .mp4 also work)"""
import cv2,numpy as np,sys,subprocess
def scenes(p):
    out=subprocess.run(["ffmpeg","-nostats","-i",p,"-vf","scale=202:-2,select='gt(scene,0.3)',showinfo","-an","-f","null","-"],capture_output=True,text=True).stderr
    import re; return [float(x) for x in re.findall(r"pts_time:([\d.]+)",out)]
for name in sys.argv[1:]:
    p=name if name.endswith(".mp4") else f"{name}.mp4"; cap=cv2.VideoCapture(p); fps=cap.get(5); n=int(cap.get(7)); d=n/fps
    cuts=[0]+scenes(p)+[d]
    mot=[];sharp=[];prev=None;i=0;step=max(1,int(round(fps/10)))
    while True:
        ok,f=cap.read()
        if not ok:break
        if i%step==0:
            g=cv2.cvtColor(cv2.resize(f,(144,256)),cv2.COLOR_BGR2GRAY).astype(np.float32)
            mot.append((i/fps, 0 if prev is None else float(np.mean(np.abs(g-prev)))))
            sharp.append(cv2.Laplacian(cv2.cvtColor(cv2.resize(f,(360,640)),cv2.COLOR_BGR2GRAY),cv2.CV_64F).var())
            prev=g
        i+=1
    mot=np.array(mot); sh=np.array(sharp)
    print(f"== {name} {d:.1f}s {cap.get(3):.0f}x{cap.get(4):.0f}")
    for a,b in zip(cuts[:-1],cuts[1:]):
        m=(mot[:,0]>=a+0.15)&(mot[:,0]<b)
        if m.sum()<2: continue
        tt,mm=mot[m,0],mot[m,1]; th=max(1.5,0.5*mm.max())
        act=tt[mm>=th]
        print(f"  scene {a:5.2f}-{b:5.2f} ({b-a:4.2f}s) sharp={sh[m].mean():6.0f} motion avg={mm.mean():4.1f} peak={mm.max():4.1f}@{tt[mm.argmax()]:.2f} active {act.min():.2f}-{act.max():.2f}")
