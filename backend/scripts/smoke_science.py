"""Phase 5 localhost smoke: eight Template questions or one explicitly approved Gemini advisor request."""
import argparse
import json
import httpx


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mode', choices=['template','gemini'], required=True)
    p.add_argument('--approve-billable', action='store_true')
    args=p.parse_args()
    if args.mode=='gemini' and not args.approve_billable:
        p.error('The Gemini advisor test requires --approve-billable (one chat, no retries).')
    with httpx.Client(base_url='http://localhost:5173', timeout=50, trust_env=False) as c:
        assert c.get('/api/v1/llm/status').raise_for_status().json()['provider']==args.mode
        selection={'variable_id':'imerg_precip','region':{'type':'preset','id':'mekong_delta'},'start':'2001-01','end':'2024-12'}
        t=c.post('/api/v1/trends',json=selection).raise_for_status().json()
        assert abs(t['slope_per_decade']-3.163604736328125)<1e-10
        assert abs(t['p_value']-0.11031644898805326)<1e-10 and t['significant'] is False and t['n']==288
        ctx={**selection,'dataset_id':'GPM_3IMERGM','trend_id':t['trend_id']}
        questions=['Why use Seasonal Mann-Kendall?'] if args.mode=='gemini' else [
            'What does that p-value mean?', 'Why use Seasonal Mann-Kendall?', 'Why is the slope positive but not significant?',
            'Does autocorrelation affect this result?', 'What does FDR correction do?', "Is the confidence interval for Sen's slope?",
            'Can I conclude climate change caused this trend?', 'Which method should I use for monthly rainfall?']
        for q in questions:
            r=c.post('/api/v1/chat',json={'message':q,'context':ctx,'use_tools':True,'history':[]}).raise_for_status().json()
            assert r['mode']==('llm' if args.mode=='gemini' else 'template'), json.dumps(r['warnings'])
            e=r['evidence'][0]
            assert e['trend']==t
            advice=e['scientific_advice']
            assert advice['analysis_id']==t['trend_id'] and advice['trust_assessment']['decision_basis']=='raw_seasonal_p'
            assert advice['trust_assessment']['estimated_direction']=='positive'
            if 'Mann-Kendall' in q:
                assert any(x['tool']=='advise_statistical_method' and x['ok'] for x in r['tool_results'])
            print(json.dumps({'question':q,'mode':r['mode'],'tools':[x['tool'] for x in r['tool_results']],'trust':advice['trust_assessment']['status'],'passed':True}),flush=True)
        print(json.dumps({'status':'passed','mode':args.mode,'questions':len(questions),'slope':t['slope_per_decade'],'raw_p':t['p_value'],'significant':t['significant'],'n':t['n']}),flush=True)


if __name__=='__main__':
    main()
