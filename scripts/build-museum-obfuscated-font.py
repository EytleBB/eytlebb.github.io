# Rebuild the small original font from the same 5x7 rows used by museum canvases.
import re, struct, zlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'js/museum-horror-glyphs.js').read_text()
alphabet=re.search(r"PIXEL_ALPHABET = '([^']+)'",source)[1]
patterns=re.findall(r"'([0-9a-f]{14})'",source)
assert len(patterns)==len(alphabet)
pack=lambda fmt,*v:struct.pack('>'+fmt,*v)
pad=lambda b:b+b'\0'*((-len(b))%4)
checksum=lambda b:sum(struct.unpack('>'+'I'*(len(pad(b))//4),pad(b)))&0xffffffff
# One rectangular contour per horizontal run of lit pixels.
def glyph(pattern):
 pts=[]; ends=[]
 for y,row in enumerate(bytes.fromhex(pattern)):
  x=0
  while x<5:
   if not row&(1<<(4-x)): x+=1;continue
   end=x+1
   while end<5 and row&(1<<(4-end)):end+=1
   left,right=x*64,end*64; top,bottom=(7-y)*64,(6-y)*64
   pts += [(left,bottom),(left,top),(right,top),(right,bottom)]
   ends.append(len(pts)-1);x=end
 data=pack('hhhhh',len(ends),0,0,320,448)
 data+=b''.join(pack('H',n) for n in ends)+pack('H',0)+bytes([1]*len(pts))
 px=py=0;xs=[];ys=[]
 for x,y in pts:xs.append(x-px);ys.append(y-py);px=x;py=y
 data+=b''.join(pack('h',v) for v in xs)+b''.join(pack('h',v) for v in ys)
 return pad(data),len(pts),len(ends)
glyphs=[b'',b''];maxpoints=maxcontours=0
for pattern in patterns:
 data,points,contours=glyph(pattern);glyphs.append(data);maxpoints=max(maxpoints,points);maxcontours=max(maxcontours,contours)
count=len(glyphs); offsets=[0]
for data in glyphs:offsets.append(offsets[-1]+len(data))
tables={}
tables['glyf']=b''.join(glyphs)
tables['loca']=b''.join(pack('I',v) for v in offsets)
tables['head']=pack('IIIIHHqqhhhhHHhhh',0x10000,0x10000,0,0x5F0F3CF5,3,512,0,0,0,-64,320,448,0,8,2,1,0)
tables['hhea']=pack('IhhhHhhhhhhhhhhhH',0x10000,448,-64,0,384,0,64,320,1,0,0,0,0,0,0,0,count)
tables['maxp']=pack('IH'+'H'*13,0x10000,count,maxpoints,maxcontours,0,0,2,0,0,0,0,0,0,0,0)
tables['hmtx']=b''.join(pack('Hh',384,0) for _ in range(count))
# Format 4 mapping, one segment per character, and a terminal segment.
mapping=sorted([(32,1)]+[(ord(ch),i+2) for i,ch in enumerate(alphabet)])
n=len(mapping)+1; power=2**(n.bit_length()-1)
sub=pack('HHHHHHH',4,16+8*n,0,n*2,power*2,power.bit_length()-1,n*2-power*2)
sub+=b''.join(pack('H',ch) for ch,_ in mapping)+pack('HH',65535,0)
sub+=b''.join(pack('H',ch) for ch,_ in mapping)+pack('H',65535)
sub+=b''.join(pack('H',(gid-ch)&65535) for ch,gid in mapping)+pack('H',1)+b'\0'*(n*2)
tables['cmap']=pack('HHHHI',0,1,3,1,12)+sub
names={1:'Museum Obfuscated',2:'Regular',4:'Museum Obfuscated',6:'MuseumObfuscated-Regular'}
records=b'';strings=b''
for key,value in names.items():
 data=value.encode('utf-16-be');records+=pack('HHHHHH',3,1,0x409,key,len(data),len(strings));strings+=data
tables['name']=pack('HHH',0,len(names),6+len(records))+records+strings
tables['post']=pack('IIhhIIIII',0x30000,0,0,0,1,0,0,0,0)
# OS/2 version 0 with a fixed-pitch Latin designation and matching metrics.
os2=pack('HhHHH',0,384,400,5,0)+pack('h'*11,256,256,0,0,256,256,0,0,32,160,0)
os2+=bytes([2,0,6,9,0,0,0,0,0,0])+pack('IIII',1,0,0,0)+b'EYTL'
os2+=pack('HHHhhhHH',0x40,32,125,448,-64,0,448,64)
assert len(os2)==78
tables['OS/2']=os2
# The checksum adjustment refers to the equivalent uncompressed sfnt.
keys=sorted(tables);nt=len(keys);power=2**(nt.bit_length()-1)
sfnthead=pack('IHHHH',0x10000,nt,power*16,power.bit_length()-1,nt*16-power*16)
offset=12+16*nt;directory=b'';body=b''
for tag in keys:
 data=tables[tag];directory+=pack('4sIII',tag.encode(),checksum(data),offset,len(data));body+=pad(data);offset+=len(pad(data))
adjust=(0xB1B0AFBA-checksum(sfnthead+directory+body))&0xffffffff
h=tables['head'];tables['head']=h[:8]+pack('I',adjust)+h[12:]
# WOFF v1, all tables independently deflated where it saves bytes.
offset=44+20*nt;directory=b'';body=b''
for tag in keys:
 raw=tables[tag]; compressed=zlib.compress(raw,9); data=compressed if len(compressed)<len(raw) else raw
 # head's table checksum is computed with checksumAdjustment zero.
 original=raw if tag!='head' else raw[:8]+b'\0'*4+raw[12:]
 directory+=pack('4sIIII',tag.encode(),offset,len(data),len(raw),checksum(original));body+=pad(data);offset+=len(pad(data))
woff=pack('4sIIHHIHHIIIII',b'wOFF',0x10000,offset,nt,0,12+16*nt+sum(len(pad(tables[t])) for t in keys),1,0,0,0,0,0,0)+directory+body
path=root/'fonts/museum-obfuscated.woff';path.parent.mkdir(exist_ok=True);path.write_bytes(woff)
print(path,len(woff))
