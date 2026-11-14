"""Seven bounded HTTP checks. Gemini mode requires explicit billable-call authorization."""
import argparse
import json
import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['gemini', 'template'], required=True)
    parser.add_argument('--approve-billable', action='store_true')
    parser.add_argument('--base-url', default='http://localhost:5173')
    args = parser.parse_args()
    if args.mode == 'gemini' and not args.approve_billable:
        parser.error('Gemini checks require --approve-billable; up to seven chat requests, no retries.')
    with httpx.Client(base_url=args.base_url, timeout=50, trust_env=False) as client:
        status = client.get('/api/v1/llm/status').raise_for_status().json()
        assert status['provider'] == args.mode, 'Running provider differs from requested mode'
        context, history, original = {}, [], None
        questions = [
            'Analyze precipitation trends in the Mekong Delta from January 2001 to December 2024.',
            'What does that p-value mean?',
            'Is the trend statistically significant?',
            "Why is the slope positive if it isn't significant?",
            'Plot the time series.',
            'Compare it with Hanoi.',
            'Which dataset was used?',
        ]
        for index, question in enumerate(questions):
            r = client.post('/api/v1/chat', json={'message': question, 'use_tools': True, 'context': context, 'history': history}).raise_for_status().json()
            assert r['mode'] == ('llm' if args.mode == 'gemini' else 'template'), json.dumps({'step': index+1, 'warnings':r['warnings']})
            context = r['resolved_context']
            assert context['variable_id'] == 'imerg_precip' and context['dataset_id'] == 'GPM_3IMERGM'
            assert context['region']['id'] == 'mekong_delta' and context['start'] == '2001-01' and context['end'] == '2024-12'
            if index == 0:
                original = r['evidence'][0]['trend']
                direct = client.post('/api/v1/trends', json={k:context[k] for k in ['variable_id','region','start','end']}).raise_for_status().json()
                for key in ['slope_per_decade','p_value','significant','quality']:
                    assert original[key] == direct[key]
                assert abs(original['slope_per_decade']-3.163604736328125)<1e-10
                assert abs(original['p_value']-0.11031644898805326)<1e-10
                assert original['significant'] is False and original['quality']['n_months']==288
                assert any(t['tool']=='analyze_trend' and t['ok'] for t in r['tool_results'])
            if index in [1,2,3]:
                assert r['evidence'][0]['trend'] == original
            if index == 1:
                assert 'raw seasonal p-value' in r['answer'] and '95% OLS interval' not in r['answer']
                assert 'not the probability' in r['answer']
            if index == 4:
                assert any(t['tool']=='get_time_series' and len(t['data']['points'])==288 for t in r['tool_results'])
            if index == 5:
                assert any(t['tool']=='compare_regions' and t['data']['b']['region']['id']=='hanoi' for t in r['tool_results'])
            if index == 6:
                assert any(t['tool']=='get_dataset_provenance' for t in r['tool_results'])
            print(json.dumps({'step':index+1,'mode':r['mode'],'tools':[t['tool'] for t in r.get('tool_results',[])],'passed':True}), flush=True)
            history += [{'role':'user','content':question},{'role':'assistant','content':r['answer'][:2000]}]
        print(json.dumps({'status':'passed','provider':status['provider'],'model':status['model'],'steps':7,'via':args.base_url}),flush=True)


if __name__ == '__main__':
    main()
