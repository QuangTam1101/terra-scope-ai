"""EXPERIMENTAL ONLY. No production module imports this file.

Whole-calendar-year residual moving-block bootstrap for a seasonal Sen estimator.
This implementation is a benchmark candidate, not an approved inferential policy.
"""
import math
import time
import warnings
import numpy as np
import pandas as pd
import pymannkendall as mk
from scipy.stats import norm, false_discovery_control


def calendar_matrix(series):
    if not isinstance(series.index, pd.DatetimeIndex) or not len(series):
        raise ValueError('A nonempty monthly DatetimeIndex is required')
    if series.index.has_duplicates or not series.index.is_monotonic_increasing:
        raise ValueError('Calendar index must be unique and ordered')
    if not np.all(series.index.day == 1) or not np.all(series.index == series.index.normalize()):
        raise ValueError('Observations must be at month start')
    index=pd.date_range(f'{series.index[0].year}-01-01', f'{series.index[-1].year}-12-01',freq='MS')
    x=series.reindex(index).to_numpy(dtype=float)
    if np.isinf(x).any() or len(x)>288:
        raise ValueError('At most 288 months, finite observations or NaN only')
    return x.reshape(-1,12)


def completeness(x):
    finite=np.isfinite(x)
    return {'current_grid_eligible':bool(np.any(finite,axis=1).sum()>=10),
            'shadow_eligible':bool(np.any(finite,axis=1).sum()>=10 and finite.mean()>=.7 and np.all(finite.sum(axis=0)>=10)),
            'valid_fraction':float(finite.mean()),'valid_per_season':finite.sum(axis=0).tolist()}


def slopes(x):
    x=np.asarray(x,dtype=float)
    i,j=np.triu_indices(x.shape[-2],1)
    d=(x[...,j,:]-x[...,i,:])/(j-i)[:,None]
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        return np.nanmedian(d,axis=(-2,-1))  # per year, not per month


def seasonal_test(x,ties=True):
    x=np.asarray(x,dtype=float)
    if x.ndim!=2 or x.shape[1]!=12:raise ValueError('Expected years x calendar months')
    i,j=np.triu_indices(len(x),1)
    score=float(np.nansum(np.sign(x[j]-x[i])))
    n=np.isfinite(x).sum(axis=0)
    variance=float(np.sum(n*(n-1)*(2*n+5))/18)
    if ties:
        correction=0
        for col in x.T:
            counts=np.unique(col[np.isfinite(col)],return_counts=True)[1]
            correction+=sum(int(c)*(int(c)-1)*(2*int(c)+5) for c in counts)
        variance-=correction/18
    z=(score-math.copysign(1,score))/math.sqrt(variance) if score and variance>0 else 0.
    return {'s':score,'variance':variance,'p':float(2*norm.sf(abs(z))),'slope_per_year':float(slopes(x))}


def hr_diagnostic(x):
    """Separate nonseasonal anomaly test, NOT corrected Seasonal MK. Gaps compress in installed HR."""
    if np.isfinite(x).sum()<3:return None
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        anomalies=x-np.nanmean(x,axis=0)
        try:
            p=float(mk.hamed_rao_modification_test(anomalies.ravel()).p)
            return p if np.isfinite(p) and 0<=p<=1 else None
        except (ValueError,ZeroDivisionError,IndexError):return None


def block_bootstrap(x,block_years,draws,seed,deadline=None):
    """x: years x 12 or cells x years x 12. Same year blocks across all cells.

    Detrend seasonal Sen, center each calendar-month residual, resample contiguous
    complete year vectors (including NaN masks). Basic CI targets seasonal Sen.
    Null p uses absolute resampled residual slope and a plus-one finite-MC correction.
    Assumes residual stationarity / adequate blocks; it is not an exact randomization test.
    """
    x=np.asarray(x,dtype=float)
    if x.ndim==2:x=x[None,...]
    if x.ndim!=3 or x.shape[-1]!=12 or x.shape[-2]>24 or len(x)>9:raise ValueError('Bounded calendar matrix required')
    cells,years,_=x.shape
    if not (1<=block_years<=3 and block_years<=years and 39<=draws<=1999):raise ValueError('Unsupported bootstrap budget')
    estimate=np.asarray(slopes(x))
    t=np.arange(years)[None,:,None]
    residual=x-estimate[:,None,None]*t
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        residual=residual-np.nanmedian(residual,axis=1,keepdims=True)
    rng=np.random.default_rng(seed)
    noise=np.empty((draws,cells))
    # Precompute indexes so changing batch size cannot change the Monte Carlo experiment.
    starts=rng.integers(0,years-block_years+1,size=(draws,math.ceil(years/block_years)))
    indexes=(starts[:,:,None]+np.arange(block_years)).reshape(draws,-1)[:,:years]
    for start in range(0,draws,16):
        if deadline and time.monotonic()>deadline:raise TimeoutError('Shadow benchmark deadline reached')
        selected=np.take(residual,indexes[start:start+16],axis=1).transpose(1,0,2,3)
        noise[start:start+16]=slopes(selected)
    valid=np.isfinite(noise).sum(axis=0)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        quantiles=np.nanquantile(noise,[.025,.975],axis=0)
    # Bootstrap slope* = estimate + residual slope*, by affine equivariance.
    lo,hi=estimate-quantiles[1],estimate-quantiles[0]
    p=(1+np.sum(np.abs(noise)>=np.abs(estimate)[None,:],axis=0))/(valid+1)
    p=np.where(valid==draws,p,np.nan)
    return {'p':p,'lo_per_year':lo,'hi_per_year':hi,'slope_per_year':estimate,'valid_draws':valid,
            'block_years':block_years,'draws':draws}


def adjust(p,method):
    if method not in {'bh','by'}:raise ValueError('Only BH/BY are evaluated')
    p=np.asarray(p,dtype=float);out=np.full_like(p,np.nan);valid=np.isfinite(p)
    if np.any((p[valid]<0)|(p[valid]>1)):raise ValueError('Invalid probability')
    if valid.any():out[valid]=false_discovery_control(p[valid],method=method)
    return out
