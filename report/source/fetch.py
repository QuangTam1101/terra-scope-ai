import json, sys, requests
B="http://localhost:8000/api/v1"; out=sys.argv[1]
P=lambda p,b: requests.post(B+p,json=b,timeout=600).json()
md={"type":"preset","id":"mekong_delta"}
d={}
d["md_t2m_series"]=P("/series",{"variable_id":"merra2_air_temperature_2m","region":md,"start":"2001-01","end":"2025-12"})
d["md_t2m_trend"]=P("/trends",{"variable_id":"merra2_air_temperature_2m","region":md,"start":"2001-01","end":"2025-12"})
d["md_pr_series"]=P("/series",{"variable_id":"imerg_precip","region":md,"start":"2001-01","end":"2024-12"})
d["md_pr_trend"]=P("/trends",{"variable_id":"imerg_precip","region":md,"start":"2001-01","end":"2024-12"})
json.dump(d,open(out+"/api.json","w"))
for k,v in d.items(): print(k, list(v.keys())[:12])
print(json.dumps(d["md_t2m_trend"])[:1500])
