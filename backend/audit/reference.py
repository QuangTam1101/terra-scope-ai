"""Isolated Phase 6 reference formulas. Not imported by production statistics."""
import math
import numpy as np
from scipy.stats import norm


def seasonal_reference(values, period=12, tie_correction=True):
    """Sum within-season pair scores and independent-season variances; pooled seasonal Sen slopes.

    Missing observations keep their original year index. Normal two-sided approximation uses
    continuity correction. Cross-season dependence is not modeled; this is not a new policy.
    """
    values = np.asarray(values, dtype=float)
    scores, variances, slopes = [], [], []
    for month in range(period):
        seasonal = values[month::period]
        times = np.flatnonzero(np.isfinite(seasonal))
        y = seasonal[times]
        n = len(y)
        scores.append(sum(np.sign(y[j]-y[i]) for i in range(n) for j in range(i+1,n)))
        counts = np.unique(y,return_counts=True)[1]
        ties = sum(int(c)*(int(c)-1)*(2*int(c)+5) for c in counts) if tie_correction else 0
        variances.append((n*(n-1)*(2*n+5)-ties)/18)
        slopes.extend((y[j]-y[i])/(times[j]-times[i]) for i in range(n) for j in range(i+1,n))
    score, variance = float(sum(scores)), float(sum(variances))
    z = (score-math.copysign(1,score))/math.sqrt(variance) if score and variance > 0 else 0.0
    return {'s':score,'var_s':variance,'z':z,'p':float(2*norm.sf(abs(z))),
            'slope_per_decade':float(np.median(slopes)*10) if slopes else None}
