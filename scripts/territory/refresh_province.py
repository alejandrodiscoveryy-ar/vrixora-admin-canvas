#!/usr/bin/env python3
"""Worker seguro para importacion provincial OSM; solo se ejecuta en GitHub Actions.
No habilita carreras. Descarga PBF de Cuba y valida poligono ISO3166-2.
"""
import collections
import hashlib
import json
import math
import os
import re
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

import osmium
import requests

SOURCE = "https://download.geofabrik.de/central-america/cuba-latest.osm.pbf"
KEYS = ('amenity', 'shop', 'tourism', 'leisure', 'healthcare', 'office', 'public_transport', 'railway')
CAT = {
    'restaurant':'restaurante','fast_food':'comida rapida','cafe':'cafeteria',
    'bar':'bar','hospital':'hospital','clinic':'clinica','doctors':'consultorio',
    'pharmacy':'farmacia','school':'escuela','university':'universidad',
    'college':'centro educativo','fuel':'gasolinera','bank':'banco',
    'bus_station':'terminal de omnibus','parking':'parqueo','marketplace':'mercado',
    'police':'policia','supermarket':'supermercado','hotel':'hotel',
    'hostel':'hostal','guest_house':'alojamiento','museum':'museo',
    'attraction':'atraccion','park':'parque','stadium':'estadio',
    'playground':'parque infantil','cinema':'cine','theatre':'teatro',
}

def normalize(s):
    s=unicodedata.normalize('NFD',str(s).lower())
    s=''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub('[^a-z0-9]+',' ',s).strip()

def category(tags):
    for key in KEYS:
        value=tags.get(key,'')
        if value:
            if key=='public_transport': return 'transporte'
            if key=='railway': return 'estacion'
            return CAT.get(value,normalize(value))
    return 'lugar'

def candidate(tags):
    return bool(tags.get('name')) and any(tags.get(k) for k in KEYS)

def prepare_geometry(geojson):
    coords=geojson.get('coordinates',[])
    if geojson.get('type')=='Polygon': polygons=[coords]
    elif geojson.get('type')=='MultiPolygon': polygons=coords
    else: raise RuntimeError('Limite invalido')
    result=[]
    for polygon in polygons:
        rings=[]
        for raw in polygon:
            if len(raw)<4: continue
            pts=[(float(p[0]),float(p[1])) for p in raw]
            xs=[p[0] for p in pts];ys=[p[1] for p in pts]
            rings.append((pts,(min(xs),min(ys),max(xs),max(ys))))
        if rings: result.append(rings)
    if not result:raise RuntimeError('Limite administrativo vacio')
    return result

def in_ring(lon,lat,ring):
    pts,bbox=ring
    if lon < bbox[0] or lon > bbox[2] or lat < bbox[1] or lat > bbox[3]:return False
    inside=False
    x1,y1=pts[-1]
    for x2,y2 in pts:
        if (y1 > lat) != (y2 > lat):
            hit=x1+(lat-y1)*(x2-x1)/(y2-y1)
            if lon < hit: inside=not inside
        x1,y1=x2,y2
    return inside

def in_region(lon,lat,rings):
    for polygon in rings:
        if in_ring(lon,lat,polygon[0]) and not any(in_ring(lon,lat,hole) for hole in polygon[1:]):
            return True
    return False

def rough_center(geom):
    polys=geom['coordinates']
    if geom['type']=='MultiPolygon': ring=max((p[0] for p in polys if p),key=len)
    else:ring=polys[0]
    pts=ring[:-1] if len(ring)>2 and ring[0]==ring[-1] else ring
    return sum(x for x,y in pts)/len(pts),sum(y for x,y in pts)/len(pts)

class Areas(osmium.SimpleHandler):
    def __init__(self,code):
        super().__init__()
        self.code=code
        self.geo=osmium.geom.GeoJSONFactory()
        self.boundary=None
        self.relations=[]
    def area(self,a):
        tags=dict(a.tags)
        if tags.get('ISO3166-2')==self.code and tags.get('admin_level')=='4':
            if self.boundary is None:
                self.boundary=prepare_geometry(json.loads(self.geo.create_multipolygon(a)))
        if a.from_way() or not candidate(tags):return
        try:
            lon,lat=rough_center(json.loads(self.geo.create_multipolygon(a)))
            self.relations.append(('relation',int(a.orig_id()),tags,lat,lon))
        except Exception:pass

class POI(osmium.SimpleHandler):
    def __init__(self,bbox):
        super().__init__()
        self.bbox=bbox
        self.records=[]
    def inside_bbox(self,lon,lat):
        x0,y0,x1,y1=self.bbox
        return x0<=lon<=x1 and y0<=lat<=y1
    def node(self,n):
        tags=dict(n.tags)
        if not candidate(tags):return
        try:
            lon,lat=n.location.lon,n.location.lat
            if self.inside_bbox(lon,lat):self.records.append(('node',int(n.id),tags,lat,lon))
        except Exception:pass
    def way(self,w):
        tags=dict(w.tags)
        if not candidate(tags):return
        try:
            locations=[(r.location.lat,r.location.lon) for r in w.nodes if r.location.valid()]
            if not locations:return
            lat=sum(a for a,b in locations)/len(locations)
            lon=sum(b for a,b in locations)/len(locations)
            if self.inside_bbox(lon,lat):self.records.append(('way',int(w.id),tags,lat,lon))
        except Exception:pass

def build_record(typ,osm_id,tags,lat,lon):
    name=tags.get('name','').strip()
    if len(name)<2 or len(name)>180 or not math.isfinite(lat) or not math.isfinite(lon):return None
    aliases=[]
    for key in ('alt_name','old_name','short_name','loc_name','name:es','official_name','brand'):
        aliases.extend(x.strip() for x in tags.get(key,'').split(';') if x.strip())
    aliases=list(dict.fromkeys(x for x in aliases if x!=name and len(x)<=180))[:20]
    district=tags.get('addr:suburb') or tags.get('addr:district') or None
    address=' '.join(filter(None,(tags.get('addr:street',''),tags.get('addr:housenumber','')))) or None
    cat=category(tags)
    terms=normalize(' '.join([name,cat]+aliases+[district or '',address or '']+[tags.get(k,'') for k in KEYS]))
    if not terms:return None
    return {'source_id':f'osm:{typ}:{osm_id}','name':name,'category':cat,
            'municipality':district,'address':address,'aliases':aliases,
            'lat':round(lat,9),'lon':round(lon,9),'search_terms':terms}

def extract(pbf,code):
    print('ETAPA=VALIDAR_LIMITE_'+code,flush=True)
    boundary=Areas(code)
    boundary.apply_file(str(pbf),locations=True)
    if boundary.boundary is None:raise RuntimeError('BOUNDARY_NOT_FOUND_'+code)
    # Caja delimitadora obtenida del poligono real, no de una provincia inventada.
    boxes=[ring[0][1] for ring in boundary.boundary if ring]
    bbox=(min(b[0] for b in boxes),min(b[1] for b in boxes),
          max(b[2] for b in boxes),max(b[3] for b in boxes))
    print('LIMITE_VALIDADO='+code,flush=True)
    pois=POI(bbox)
    pois.apply_file(str(pbf),locations=True)
    seen=set();rows=[];counter=collections.Counter()
    for typ,oid,tags,lat,lon in pois.records+boundary.relations:
        source=f'osm:{typ}:{oid}'
        if source in seen or not in_region(lon,lat,boundary.boundary):continue
        row=build_record(typ,oid,tags,lat,lon)
        if not row:continue
        seen.add(source);rows.append(row);counter[row['category']]+=1
    return rows,counter

def check(response,action):
    if response.status_code<200 or response.status_code>=300:
        raise RuntimeError(f'{action} HTTP_{response.status_code}: {response.text[:350]}')
    return response.json() if response.content else None

def api(session,base,key,path,payload,timeout=80,params=None):
    url=base.rstrip('/')+'/rest/v1/'+path
    headers={'apikey':key,'Content-Type':'application/json',
             'Prefer':'return=representation' if '/rpc/' in path else 'resolution=merge-duplicates,return=minimal'}
    if not key.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + key
    err=None
    for attempt in range(3):
        try:
            reply=session.post(url,headers=headers,json=payload,params=params,timeout=(20,timeout))
            if reply.status_code in (429,500,502,503,504):
                raise requests.RequestException('Transitorio HTTP_'+str(reply.status_code))
            return check(reply,path)
        except requests.RequestException as exc:
            err=exc;time.sleep(2*(attempt+1))
    raise RuntimeError(f'API_UNAVAILABLE_{path}: {err}')

def download_verified(session,pbf):
    md5_url=SOURCE+'.md5'
    resp=session.get(md5_url,timeout=(20,60));resp.raise_for_status()
    match=re.search(r'\b([0-9a-fA-F]{32})\b',resp.text)
    if not match:raise RuntimeError('SOURCE_MD5_MISSING')
    expected=match.group(1).lower()
    digest=hashlib.md5()
    with session.get(SOURCE,stream=True,timeout=(20,120)) as reply:
        reply.raise_for_status()
        with pbf.open('wb') as f:
            for chunk in reply.iter_content(chunk_size=1024*1024):
                if chunk:f.write(chunk);digest.update(chunk)
    found=digest.hexdigest()
    if found != expected:raise RuntimeError('SOURCE_MD5_MISMATCH')
    print('PBF_VALIDADO_MD5='+found,flush=True)
    return found

def main():
    base=os.environ['SUPABASE_URL'].rstrip('/')
    key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
    session=requests.Session()
    jobs=api(session,base,key,'rpc/marketplace_poi_claim_refresh',{})
    if not jobs:
        print('NO_JOB_PENDING',flush=True)
        return
    if not isinstance(jobs,list) or len(jobs)!=1:
        raise RuntimeError('JOB_CLAIM_INVALID')
    job=jobs[0]
    jid=str(job['job_id']);code=str(job['province_code'])
    if not re.fullmatch(r'[0-9a-fA-F-]{36}',jid) or not re.fullmatch(r'CU-[0-9]{2}',code):
        raise RuntimeError('JOB_INVALID')
    print('JOB='+jid+' PROVINCIA='+code,flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix='tuktuk-poi-') as dirname:
            pbf=Path(dirname)/'cuba-latest.osm.pbf'
            md5=download_verified(session,pbf)
            rows,cat=extract(pbf,code)
            min_rows=30 if code=='CU-99' else 100
            if not (min_rows<=len(rows)<=300000):
                raise RuntimeError('POI_COUNT_INVALID_'+str(len(rows)))
            print('POI_VALIDOS='+str(len(rows)),flush=True)
            print('TOP_CATEGORIAS='+str(cat.most_common(8)),flush=True)
            for start in range(0,len(rows),400):
                payload=[dict(item,job_id=jid) for item in rows[start:start+400]]
                api(session,base,key,'marketplace_poi_stage',payload,params={'on_conflict':'job_id,source_id'})
                if start%4000==0:print('CARGADOS='+str(min(start+400,len(rows))),flush=True)
            result=api(session,base,key,'rpc/marketplace_poi_finalize_refresh',
                       {'target_job_id':jid,'target_expected_count':len(rows),'target_source_md5':md5},timeout=120)
            print('RESULTADO=PROVINCIA_ACTUALIZADA',flush=True)
            print('PROVINCIA='+code+' LUGARES='+str(result),flush=True)
            print('CARRERAS=NO_ACTIVADAS',flush=True)
    except Exception as exc:
        print('ERROR_IMPORTACION='+str(exc)[:450],file=sys.stderr,flush=True)
        try:
            api(session,base,key,'rpc/marketplace_poi_mark_failed',
                {'target_job_id':jid,'target_error':str(exc)[:450]})
        except Exception as mark_exc:
            print('ERROR_REGISTRANDO_FALLO='+str(mark_exc)[:250],file=sys.stderr)
        raise

if __name__=='__main__':main()
