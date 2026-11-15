import json, sys, requests
B="http://localhost:8000/api/v1"; out=sys.argv[1]
d={}
for k,bb in [("sahel",[-17,10,30,18]),("wisc",[-92.9,42.5,-86.8,47.1])]:
    d[k]=requests.post(B+"/series",json={"variable_id":"merra2_air_temperature_2m","region":{"type":"bbox","bbox":bb},"start":"2001-01","end":"2025-12"},timeout=600).json()
json.dump(d,open(out+"/sw.json","w"))
s=d["sahel"]; print(s["points"][:2], str(s["climatology"])[:200])
