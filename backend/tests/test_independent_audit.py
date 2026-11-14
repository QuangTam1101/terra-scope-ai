"""Read-only characterization against independent formulas, not approval of proposed corrections."""
import numpy as np
import pandas as pd
import pymannkendall as mk
import pytest
import xarray as xr
from scipy.stats import false_discovery_control
from app import bridge, service
from audit.reference import seasonal_reference
from pipeline.trends import bh_fdr, trend_one
from pipeline.grid import grid_trend, region_series


def cube(x):
    return xr.DataArray(np.asarray(x).reshape(-1,1,1), dims=['time','lat','lon'], coords={'time':pd.date_range('2001-01-01',periods=len(x),freq='MS'),'lat':[10.5],'lon':[105.5]})


@pytest.mark.parametrize('kind',['up','down','noise','missing','ties'])
def test_seasonal_package_against_independent_pair_formula(kind):
    rng=np.random.default_rng(61)
    x=rng.normal(0,1,144)+np.tile(np.arange(12)*3,12)
    if kind in ['up','down','missing']: x += np.repeat(np.arange(12),12)*(.4 if kind!='down' else -.4)
    if kind=='missing': x[[2,5,18,71,88]]=np.nan
    if kind=='ties': x=np.repeat(np.arange(12)//3,12).astype(float)
    ref=seasonal_reference(x); actual=mk.seasonal_test(x,period=12)
    assert actual.s==ref['s'] and actual.var_s==pytest.approx(ref['var_s'],abs=1e-12)
    assert actual.p==pytest.approx(ref['p'],abs=1e-12)
    assert actual.z==pytest.approx(ref['z'],abs=1e-12)
    assert actual.slope*10==pytest.approx(ref['slope_per_decade'],abs=1e-12)


def test_grid_matches_reference_without_ties():
    x=np.random.default_rng(62).normal(size=144)+np.repeat(np.arange(12)*.2,12)
    ref=seasonal_reference(x);g=grid_trend(cube(x))
    assert g.p_value.item()==pytest.approx(ref['p'],abs=1e-12)
    assert g.slope_per_decade.item()==pytest.approx(ref['slope_per_decade'],abs=1e-12)


def test_characterize_grid_tie_difference_without_changing_algorithm():
    x=np.repeat(np.arange(12)//3,12).astype(float)
    corrected=seasonal_reference(x); current_reference=seasonal_reference(x,tie_correction=False)
    g=grid_trend(cube(x))
    assert g.p_value.item()==pytest.approx(current_reference['p'],abs=1e-12)
    assert g.p_value.item()>corrected['p']


def test_characterize_sparse_grid_regional_completeness_difference():
    x=np.full(144,np.nan);x[::12]=np.arange(12)
    s=pd.Series(x,index=pd.date_range('2001-01-01',periods=144,freq='MS'))
    assert service._insufficient(s)
    assert np.isfinite(grid_trend(cube(x)).p_value.item())


def test_constant_and_short_series_characterization():
    constant=np.ones(144)
    assert seasonal_reference(constant)['p']==1
    assert grid_trend(cube(constant)).p_value.item()==1
    assert np.isnan(grid_trend(cube(np.arange(108))).p_value.item())


def test_bh_matches_independent_scipy_and_preserves_missing_mask():
    p=np.array([.03,np.nan,.001,.9,.03,.12])
    actual=bh_fdr(p)
    np.testing.assert_allclose(actual[np.isfinite(p)],false_discovery_control(p[np.isfinite(p)],method='bh'),atol=1e-15)
    assert np.isnan(actual[1])


def test_serial_dependence_adjustment_is_a_separate_diagnostic():
    rng=np.random.default_rng(63);x=np.zeros(144)
    for i in range(1,len(x)):x[i]=.8*x[i-1]+rng.normal()
    s=pd.Series(x,index=pd.date_range('2001-01-01',periods=144,freq='MS'))
    r=trend_one(s)
    assert r['p_value']==pytest.approx(seasonal_reference(x)['p'],abs=1e-12)
    assert np.isfinite(r['hr_p_value']) and not np.isclose(r['p_value'],r['hr_p_value'],atol=0,rtol=1e-5)


def test_spatial_cosine_weighting_and_missing_cell_renormalization():
    a=xr.DataArray([[[1.,3.],[5.,np.nan]]],dims=['time','lat','lon'],coords={'time':[pd.Timestamp('2001-01-01')],'lat':[0.,60.],'lon':[1.,2.]})
    s,f=region_series(a,(0.,-1.,3.,61.))
    assert s.iloc[0]==pytest.approx((1+3+.5*5)/(1+1+.5))
    assert f.iloc[0]==.75


def test_sen_scaling_respects_missing_year_positions():
    x=np.tile(np.arange(12)*10.,12)+np.repeat(np.arange(12)*2.,12)
    x[12:24]=np.nan
    assert seasonal_reference(x)['slope_per_decade']==20
    assert mk.seasonal_test(x).slope*10==20


@pytest.mark.parametrize('identifier,unit,value,expected',[
    ('GPM_3IMERGM_07_precipitation','mm/hr',1.,[696.,672.]),
    ('GLDAS_NOAH025_M_2_1_SoilMoi0_10cm_inst','kg m-2',10.,[.1,.1]),
    ('M2IMNXASM_5_12_4_T2M','K',273.15,[0.,0.]),
    ('GLDAS_NOAH025_M_2_1_Evap_tavg','kg m-2 s-1',1.,[86400.,86400.])])
def test_unit_conversions_against_dimensionally_known_inputs(identifier,unit,value,expected):
    from pipeline.units import convert_units
    actual,_=convert_units(identifier,pd.Series([value,value]),pd.Series(['2000-02-01','2001-02-01']),unit)
    np.testing.assert_allclose(actual,expected,atol=1e-10)


def test_ols_anomaly_interval_against_independent_least_squares():
    from scipy.stats import t as student
    s=pd.Series(np.random.default_rng(66).normal(size=144)+np.arange(144)*.01,index=pd.date_range('2001-01-01',periods=144,freq='MS'))
    result=trend_one(s)
    y=(s-s.groupby(s.index.month).transform('mean')).to_numpy()
    x=((s.index-s.index[0]).days/365.25).to_numpy()
    dx=x-x.mean();slope=np.dot(dx,y-y.mean())/np.dot(dx,dx)
    residual=y-(y.mean()+slope*dx)
    se=np.sqrt(np.dot(residual,residual)/(len(x)-2)/np.dot(dx,dx))
    assert result['ols_slope_per_decade']==pytest.approx(slope*10,abs=1e-12)
    assert result['ols_ci95_per_decade']==pytest.approx(student.ppf(.975,len(x)-2)*se*10,abs=1e-12)


def test_sen_difference_is_not_generally_difference_of_sen_estimates():
    from pipeline.contradictions import _sen
    rng=np.random.default_rng(67);a=rng.normal(size=48);b=rng.normal(size=48)
    assert not np.isclose(_sen(a-b),_sen(a)-_sen(b),atol=1e-10)


@pytest.mark.parametrize('kind',['constant','short','all_missing'])
def test_regional_degenerate_inputs_are_characterized(kind):
    import warnings
    x=np.ones(144) if kind=='constant' else np.arange(24,dtype=float) if kind=='short' else np.full(144,np.nan)
    s=pd.Series(x,index=pd.date_range('2001-01-01',periods=len(x),freq='MS'))
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        if kind=='all_missing':
            with pytest.raises(ZeroDivisionError):trend_one(s)
        else:
            r=trend_one(s)
            assert r['insufficient_data']==(kind=='short')
            if kind=='constant':assert r['p_value']==1 and r['slope_per_decade']==0
