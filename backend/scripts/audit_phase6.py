"""Read-only bounded audit. Writes a new audit artifact, never existing scientific outputs/cubes."""
import hashlib
import importlib.metadata
import json
import sys
from pathlib import Path
import httpx
import numpy as np
import pandas as pd
import xarray as xr

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from app import config
from audit.reference import seasonal_reference
from pipeline.grid import grid_trend


def main():
    output=ROOT/'backend'/'notes'/'PHASE_6_AUDIT_RESULTS.json'
    if output.exists():
        raise SystemExit('Audit artifact already exists. Preserve it; choose a new explicitly named output for a later audit.')
    protected=['backend/app/service.py','backend/app/bridge.py','backend/app/catalog.py',
               'data-pipeline/pipeline/trends.py','data-pipeline/pipeline/grid.py',
               'data-pipeline/pipeline/contradictions.py','data-pipeline/pipeline/units.py',
               'data-pipeline/pipeline/giovanni_adapter.py']
    hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in protected}
    before={p.name:{'bytes':p.stat().st_size,'mtime_ns':p.stat().st_mtime_ns} for p in config.CUBE_DIR.glob('cube_*.nc')}
    results={'date':'2026-11-14','statistical_approval':'pending','protected_code_sha256':hashes,
             'versions':{p:importlib.metadata.version(p) for p in ['pymannkendall','scipy','numpy','xarray']},'products':[]}
    with httpx.Client(base_url='http://127.0.0.1:8000',timeout=60,trust_env=False) as c:
        variables={v['id']:v for v in c.get('/api/v1/variables').raise_for_status().json()['variables']}
        for identifier,region,pipeline in [('imerg_precip','mekong_delta','precip'),('gldas_soil_moisture_0_10cm','mekong_delta','soil_moisture'),('merra2_air_temperature_2m','hanoi','t2m')]:
            selected={'variable_id':identifier,'region':{'type':'preset','id':region},'start':'2001-01','end':'2024-12'}
            series=c.post('/api/v1/series',json=selected).raise_for_status().json()
            trend=c.post('/api/v1/trends',json=selected).raise_for_status().json()
            times=pd.DatetimeIndex([p['t']+'-01' for p in series['points']])
            assert len(times)==288 and times.equals(pd.date_range('2001-01-01','2024-12-01',freq='MS'))
            vals=[p['value'] for p in series['points'] if p['value'] is not None]
            assert series['source']['product']==variables[identifier]['source']['product'] and series['units']==variables[identifier]['units']
            with xr.open_dataarray(config.CUBE_DIR/f'cube_{pipeline}.nc') as da:
                metadata={'units':str(da.attrs.get('units','missing')),'dataset':str(da.attrs.get('dataset','missing')),'time_count':len(da.time)}
            results['products'].append({'variable_id':identifier,'region':region,'units':series['units'],'source':series['source'],
                'cube_metadata':metadata,'valid_months':len(vals),'regional_min':min(vals),'regional_max':max(vals),'monthly_cadence':True,
                'slope_per_decade':trend['slope_per_decade'],'raw_p':trend['p_value'],'adjusted_p':trend['p_value_autocorr_adjusted'],
                'significant':trend['significant'],'alpha':trend['alpha'],'ci_method':trend['ci_method'],'ci':trend['slope_ci']})
            if identifier=='imerg_precip':
                assert abs(trend['slope_per_decade']-3.163604736328125)<1e-10
                assert abs(trend['p_value']-0.11031644898805326)<1e-10
                assert trend['significant'] is False and trend['n']==288
    x=np.repeat(np.arange(12)//3,12).astype(float)
    da=xr.DataArray(x[:,None,None],dims=['time','lat','lon'],coords={'time':pd.date_range('2001-01-01',periods=144,freq='MS'),'lat':[10.5],'lon':[105.5]})
    current=grid_trend(da)
    results['synthetic_tie_comparison']={'current_grid_p':float(current.p_value.item()),'tie_corrected_reference':seasonal_reference(x),
        'current_grid_reference':seasonal_reference(x,tie_correction=False),'approval':'not implemented'}
    after={p.name:{'bytes':p.stat().st_size,'mtime_ns':p.stat().st_mtime_ns} for p in config.CUBE_DIR.glob('cube_*.nc')}
    assert before==after
    assert hashes=={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in protected}
    results['cube_metadata_unchanged']=True
    output.write_text(json.dumps(results,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps(results,indent=2))


if __name__=='__main__':main()
