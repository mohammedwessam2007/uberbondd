"""Independent stdlib HTMLParser cross-check, separate from UberBond's JS extractor."""
import sys,json,re,hashlib
from html.parser import HTMLParser
class Page(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.scripts=[];self.anchors=[];self.current=None;self.href=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='script' and a.get('type','').lower()=='application/ld+json':self.current=[]
  if tag=='a':self.href=[a.get('href',''),[]]
 def handle_data(self,data):
  if self.current is not None:self.current.append(data)
  if self.href is not None:self.href[1].append(data)
 def handle_endtag(self,tag):
  if tag=='script' and self.current is not None:self.scripts.append(''.join(self.current));self.current=None
  if tag=='a' and self.href is not None:self.anchors.append((self.href[0],''.join(self.href[1]).strip()));self.href=None
inp=json.load(sys.stdin);source=inp['html'];page=Page();page.feed(source)
errors=[]
for text in page.scripts:
 try:json.loads(text)
 except json.JSONDecodeError as exc:errors.append({'message':exc.msg,'position':exc.pos})
print(json.dumps({'parser':'PYTHON_STDLIB_HTMLPARSER_INDEPENDENT','rawSourceSha256':hashlib.sha256(source.encode()).hexdigest(),'jsonLdScripts':len(page.scripts),'jsonLdParseFailures':len(errors),'jsonErrors':errors[:5],'telAnchors':[{'href':href,'text':text[:120]} for href,text in page.anchors if href.startswith('tel:')][:30]}))
