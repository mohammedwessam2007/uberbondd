"""Bounded Qwen-driven memory paging. Tools return source, never natural answers."""
import json
from active_memory_v11 import MemoryFailure,checked
TOOL_SCHEMA=[{'type':'function','function':{'name':name,'description':description,'parameters':{'type':'object','additionalProperties':False,'properties':properties,'required':required}}} for name,description,properties,required in [
 ('topic.search','Search the complete verified source by topic or question stem, without MCQ option contamination.',{'query':{'type':'string','maxLength':1000},'limit':{'type':'integer','minimum':1,'maximum':4}},['query']),
 ('memory.lookup','Read an already-approved capsule with original source spans.',{'chunk_id':{'type':'string','maxLength':32}},['chunk_id']),
 ('memory.expand','Read up to two source-neighbor hops around an approved capsule. This is not medical transitivity.',{'chunk_id':{'type':'string','maxLength':32},'hops':{'type':'integer','minimum':1,'maximum':2}},['chunk_id','hops']),
 ('memory.prove','Check exact source presence and lexical risk flags. Does NOT establish clinical entailment.',{'claim':{'type':'string','maxLength':1000},'source_ids':{'type':'array','minItems':1,'maxItems':4,'items':{'type':'string','maxLength':32}}},['claim','source_ids']),
 ('source.page_in','Read an original digital page already approved by capsule provenance.',{'page':{'type':'integer','minimum':1,'maximum':299}},['page'])]]

def request_tools(call_json,model,messages,session,cancel,max_rounds=2,budget_guard=None):
    """At most two Qwen planning calls, four typed tools total. Planner text is never spoken.

    A call_json adapter is supplied by the authenticated loopback Qwen transport.
    Only explicit tool_calls are executed. No expression/shell/file/path evaluation.
    """
    transcript=list(messages);passages=[];receipts=[];calls=0;prefill=[]
    for round_number in range(min(2,max_rounds)):
        checked(cancel)
        if budget_guard:budget_guard(transcript)
        response=call_json('/v1/chat/completions',dict(model=model,messages=transcript,tools=TOOL_SCHEMA,tool_choice='auto',stream=False,max_tokens=180,temperature=0,chat_template_kwargs={'enable_thinking':False}))
        calls+=1;checked(cancel)
        if not isinstance(response,dict):raise MemoryFailure('INVALID_TOOL_RESPONSE','Qwen planner response must be an object.')
        usage=response.get('usage',{});prefill.append(usage.get('prompt_tokens'))
        message=(response.get('choices') or [{}])[0].get('message',{})
        tools=message.get('tool_calls',[])
        if not tools:break
        if not isinstance(tools,list) or len(tools)>4-session.calls:raise MemoryFailure('TOOL_BUDGET','Qwen requested too many memory operations.')
        safe_calls=[]
        for item in tools:
            if not isinstance(item,dict) or item.get('type')!='function' or not isinstance(item.get('id'),str) or not isinstance(item.get('function'),dict):raise MemoryFailure('INVALID_TOOL_RESPONSE','Invalid Qwen typed tool call.')
            fn=item['function'];name=fn.get('name');arguments=fn.get('arguments')
            if name not in session.TOOLS or not isinstance(arguments,str) or len(arguments)>4096:raise MemoryFailure('INVALID_TOOL_RESPONSE','Unapproved memory tool or oversized arguments.')
            try:args=json.loads(arguments)
            except ValueError as e:raise MemoryFailure('INVALID_TOOL_RESPONSE','Tool arguments must be valid bounded JSON.') from e
            safe_calls.append(dict(id=item['id'],type='function',function=dict(name=name,arguments=json.dumps(args))))
        transcript.append({'role':'assistant','content':None,'tool_calls':safe_calls})
        for item in safe_calls:
            fn=item['function'];result=session.call(dict(tool=fn['name'],arguments=json.loads(fn['arguments']),generation_id=session.generation));checked(cancel)
            tool_result=result['result'];passages.extend(tool_result.get('passages',[]));passages.extend(tool_result.get('verbatim_sources',[]))
            # Page-in content is exact, but converted to a source packet only by
            # the host adapter; raw arbitrary tool strings never become commands.
            transcript.append({'role':'tool','tool_call_id':item['id'],'content':json.dumps(result,ensure_ascii=False)})
            receipts.append({'tool':fn['name'],'generation_id':session.generation,'response_bytes':len(transcript[-1]['content'].encode()),'semantic_entailment_verified':False})
        if session.calls>=session.max_calls:break
    return dict(passages=passages,qwen_planning_calls=calls,prefill_tokens=prefill,tool_receipts=receipts)
