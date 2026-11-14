<!-- Slide number: 1 -->
NASA SPACE APPS CHALLENGE 2026  ·  BE AN EARTH SYSTEM TREND DETECTIVE!
![Terra mascot beside a globe coloured by real MERRA-2 temperature trends, from the app landing page](Terra mascot and trend globe)
Discover Earth's Changing Story
TERRA-SCOPE AI
Earth Intelligence: From Observation to Prediction
Explore NASA Earth data, test whether a change is real, and ask an AI detective that only speaks with verified numbers.
Real screenshot from the Terra-scope landing page: globe coloured by MERRA-2 temperature trends
Team Terra-scope AI   Tâm · ??ng · Long · Phú · H?ng
1

### Notes:
Hook (25 s). Every month NASA satellites and models add more measurements of our planet. But for most people a simple question is still hard to answer: is this place really changing, or is it just noise? We are Team Terra-scope AI: Tâm, ??ng, Long, Phú and H?ng. Our project helps anyone discover Earth's changing story, from observation to a tested trend and, carefully, to an outlook.

<!-- Slide number: 2 -->
Earth's data is open. Its story is hard to read
![preencoded.png](problem icon 1 icon)
![preencoded.png](problem icon 2 icon)
![preencoded.png](problem icon 3 icon)
Too many variables
Huge, scattered files
Real, or just chance?
Hundreds of NASA products. Choosing the right one is often harder than the analysis.
Gridded archives across data centres, in formats built for experts.
Seasons and noise hide trends. A rising line is not proof.
OUR MISSION
Turn NASA observations into tested, explainable trends anyone can investigate.
1
Pick a variable
2
Pick a place
3
Pick a period
4
Time series
5
Test the trend
The five steps the challenge asks for, in one guided app
2

### Notes:
Problem and mission (25 s). The data is open, but three things stop people: too many variables, huge scattered files, and the question of whether a change is real or just chance. The challenge asks for five steps: choose a variable, a place and a period, build a time series, and test its significance. Terra-scope does all five in one guided app.

<!-- Slide number: 3 -->
Explore any place on Earth, then test the trend
MEKONG DELTA, VIETNAM · AIR TEMPERATURE
![Explore page trend map: MERRA-2 air temperature change per decade on a 0.5 degree grid, 2001 to 2025](global trend map)
+0.19 °C
per decade, 2001 to 2025 (MERRA-2)
? Clear trend · p < 0.001
![Monthly temperature anomalies for the Mekong Delta with a Theil-Sen trend line](anomaly chart)
Air temperature trend per decade, MERRA-2, 2001 to 2025. Orange = rising, blue = falling, striped = could be chance after FDR.
Values
Trend
Time-lapse
3D globe
°C / °F
Seasons removed, Seasonal Mann-Kendall test, Sen slope. Every map cell is tested and corrected for false discoveries (FDR).
5 NASA variables: GPM IMERG rainfall · GLDAS soil moisture, temperature, evapotranspiration · MERRA-2 air temperature
3

### Notes:
Explore (30 s). Pick a variable and a place, anywhere on Earth. The map shows values, the trend per decade, a month-by-month time-lapse, or a 3D globe. Across 259,200 grid cells, 55 percent of places warmed significantly and 8 percent cooled; striped cells could be chance, because we correct for testing so many places at once. Zoom into the Mekong Delta: plus 0.19 degrees per decade since 2001, a clear trend with p below 0.001, using the Seasonal Mann-Kendall test and Sen slope, the methods the challenge recommends.

<!-- Slide number: 4 -->
Ask questions. Hunt contradictions. Trust the evidence
AI Detective (Gemini)
Contradiction Hunter
![preencoded.png](detective icon icon)
![preencoded.png](hunter icon icon)
![Real Gemini AI Mode answer: Mekong Delta air temperature rose about 0.187 degrees per decade, p below 0.001](detective answer)
SAHEL
WISCONSIN
?0.21
+0.21
vs
°C per decade, MERRA-2, 2001 to 2025: opposite directions
![Contradiction Hunter verdict: Not settled yet, comparable, going opposite ways, only one passes the test](hunt verdict)
Honest verdict: not settled yet
The gap test gives p 0.022, but its bootstrap interval [?0.87, +0.12] includes zero, so no difference is claimed. Also compares NASA datasets and time periods.
Plain-language answers
Every number comes from the statistics engine. The backend checks each cited number, retries once, and falls back to a safe template if it does not match.
4

### Notes:
Detective and Hunter (30 s). Ask Terra a question in plain words. Gemini writes the answer, but every number must come from our statistics engine, and the backend checks each one before you see it. The Contradiction Hunter puts two places, two NASA datasets or two periods side by side. The Sahel cooled while Wisconsin warmed, yet the direct test of the gap is not conclusive, so Terra-scope says 'not settled yet' instead of overclaiming.

<!-- Slide number: 5 -->
From trends to an experimental outlook

### Chart: Backtest skill, Satellite mode

| Category | Air temperature (MERRA-2) | Soil moisture (GLDAS) |
| --- | --- | --- |
| 1 mo | 0.37 | 0.38 |
| 3 mo | 0.18 | 0.13 |
| 6 mo | 0.03 | 0.01 |
| 12 mo | -0.02 | -0.01 |

![Forecast page: Mekong Delta air temperature outlook with seasonal norm and 80 percent range, confidence low](forecast result)
Mekong Delta, MERRA-2 air temperature, Outlook mode: 64% chance of an above-normal December 2026 (33% with no signal). Confidence: low.
Tested 2020 to 2024 on grid cells the model never saw. 0 = no better than the seasonal normal.
Satellite mode
NASA data to Dec 2024 + 9 NOAA climate indices · up to 12 months
Outlook mode
NOAA indices to Jun 2026 + warming trend · up to 18 months
Experimental, and labelled that way
Useful 1 to 3 months ahead; weak beyond. Seasonal odds, not weather, kept apart from historical trends.
5

### Notes:
Forecast (30 s). We also asked: what might come next? Our forecast engine learns from NASA data plus nine NOAA climate indices such as El Niño. It gives odds of an above, near or below normal month, with an 80 percent range and a confidence label. We publish its measured skill: good one to three months ahead, close to zero by six to twelve months, and weak in Outlook mode. So it is clearly marked experimental and kept separate from the historical trends.

<!-- Slide number: 6 -->
Designed for curious minds and scientists
![Explorer report preview for a Mekong Delta finding](report screenshot)
![Scientist mode result with analysis metadata and statistical estimates](scientist screenshot)
![Mode selection screen: Explore Earth or Scientific Analysis](mode screenshot)
Two modes, same verdicts
Full method on demand
Reports you can share
Explorer speaks plain language; Scientist adds p-values, intervals and provenance. Switching never changes the evidence.
Product version, grid, sample size, adjusted p-value and warnings, shown in Scientist mode.
Explorer and Scientist PDF reports, plus saved cases anyone can reopen.
Guided tutorials
Built-in glossary
PDF reports
Open in NASA Giovanni
![preencoded.png](tag icon Guided tutorials icon)
![preencoded.png](tag icon Built-in glossary icon)
![preencoded.png](tag icon PDF reports icon)
![preencoded.png](tag icon Open in NASA Giovanni icon)
6

### Notes:
Designed for everyone (25 s). Students and the public choose Explorer: plain words, a glossary and guided tutorials. Researchers choose Scientist: product versions, sample sizes, adjusted p-values and warnings. Both see the same numbers and the same verdicts. Any finding becomes a shareable PDF report, in Explorer or Scientist style, and a saved case anyone can reopen and recompute. One click opens the same series in NASA Giovanni to check it.

<!-- Slide number: 7 -->
Every claim, checked. Every change, explained
WHO IT HELPS
48 PASS · 0 FAIL
Students and teachers
learn the scientific method on real NASA data
![preencoded.png](impact icon 1 icon)
independent re-computation of our statistics (1 inconclusive)
Communities and journalists
check if a local change is real before sharing it
![preencoded.png](impact icon 2 icon)
0.9996
correlation with a NASA Giovanni series (Mekong soil moisture, 293 months)
Researchers
a fast, reproducible first look with full provenance
![preencoded.png](impact icon 3 icon)
259,200
Terra-scope AI · Tâm · ??ng · Long · Phú · H?ng
github.com/QuangTam1101/terra-scope-ai
Repository is private now and will be public at submission. Built on NASA open data; not endorsed by NASA. Code written with AI assistance (see README).
grid cells tested per global map, with false-discovery control
7

### Notes:
Impact and close (25 s). Trust is the core of Terra-scope. An independent re-computation of our statistics passed 48 checks with zero failures, and our values match NASA Giovanni with a correlation of 0.9996. We help students learn science on real data, help communities check a local change before sharing it, and give researchers a reproducible first look. Terra-scope AI: discover Earth's changing story, with evidence. Thank you.
