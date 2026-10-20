# Remove the ruled table lines from a scanned OGE form page so Tesseract reads the cells cleanly.
# Usage: python3 unline.py page.png [page2.png ...]   (rewrites the files in place)
import sys
from PIL import Image
import numpy as np
def runs_mask(b, minlen):
    # b: 2D bool; returns mask of horizontal runs >= minlen
    h,w=b.shape
    m=np.zeros_like(b)
    pad=np.zeros((h,1),bool)
    x=np.concatenate([pad,b,pad],axis=1).astype(np.int8)
    d=np.diff(x,axis=1)
    for y in range(h):
        st=np.where(d[y]==1)[0]; en=np.where(d[y]==-1)[0]
        for s,e in zip(st,en):
            if e-s>=minlen: m[y,s:e]=True
    return m
def clean(path):
  im=np.array(Image.open(path).convert('L'))
  b=im<150
  # tolerate skew: OR with neighbours
  bh=b.copy(); bh[1:]|=b[:-1]; bh[:-1]|=b[1:]
  mh=runs_mask(bh,200)
  bv=b.copy(); bv[:,1:]|=b[:,:-1]; bv[:,:-1]|=b[:,1:]
  mv=runs_mask(bv.T,100).T
  m=mh|mv
  # grow mask by 2px
  g=m.copy()
  for k in (1,2):
      g[k:]|=m[:-k]; g[:-k]|=m[k:]; g[:,k:]|=m[:,:-k]; g[:,:-k]|=m[:,k:]
  out=im.copy(); out[g]=255
  Image.fromarray(out).save(path)

for f in sys.argv[1:]:
  clean(f)
