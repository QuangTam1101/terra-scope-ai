import json, sys, requests
B="http://localhost:8000/api/v1"; out=sys.argv[1]
c=requests.post(B+"/compare",json={"variable_id":"merra2_air_temperature_2m","region_a":{"type":"bbox","bbox":[-17,10,30,18]},"region_b":{"type":"bbox","bbox":[-92.9,42.5,-86.8,47.1]},"start":"2001-01","end":"2025-12"},timeout=600).json()
json.dump(c,open(out+"/compare.json","w"))
def show(o,pre=""):
    for k,v in o.items():
        if isinstance(v,dict): show(v,pre+k+".")
        elif isinstance(v,list): print(pre+k,"list",len(v), str(v[:2])[:150])
        else: print(pre+k,str(v)[:120])
show(c)
g=requests.get(B+"/trends/grid",params={"variable_id":"merra2_air_temperature_2m","start":"2001-01","end":"2025-12"},timeout=900).json()
json.dump(g,open(out+"/grid.json","w"))
print({k:(type(v).__name__, (len(v) if hasattr(v,'__len__') else v)) for k,v in g.items()})
print(str(g.get("columns"))[:300]); print(str(g.get("cells",[])[:3])[:300])
