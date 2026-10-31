const BASE_URL = 'https://api.postzen.dev';
const ACCOUNT_ID_RE = /^[a-z0-9]{32}$/;
const POST_ID_RE = /^[a-zA-Z0-9_-]{8,100}$/;
const DEFAULT_ACCOUNT_ID = 'j9728s2139w1qrqdte0fynrjf98hbg4j';
export const INSTAGRAM_ACCOUNT_ID = DEFAULT_ACCOUNT_ID;

function safeId(value, label='ID') {
  if (typeof value !== 'string' || !POST_ID_RE.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function safeAccount(accountId) {
  if (!ACCOUNT_ID_RE.test(accountId || '')) throw new Error('Invalid PostZen account ID.');
  return accountId;
}
function redact(text) {
  return String(text).replace(/pzn_(?:live|test)_[a-f0-9]{64}/gi, '[REDACTED]');
}

/**
 * PostZen HTTP client. Supports only the explicit API paths supplied by calling methods.
 * API key is never saved to disk and never printed. `fetchFn` allows offline tests.
 */
export async function postzenRequest(path, {
  method='GET', body, requestId, apiKey=process.env.POSTZEN_API_KEY,
  fetchFn=fetch,
}={}) {
  if (!apiKey) throw new Error('POSTZEN_API_KEY is not configured.');
  if (!/^\/v1\/[a-z0-9/_-]+(?:\?[a-z0-9%=&._-]+)?$/i.test(path)) throw new Error('Invalid API path.');
  if (!['GET','POST'].includes(method)) throw new Error('Unsupported API method.');
  const headers={Authorization:`Bearer ${apiKey}`};
  if (body !== undefined) headers['Content-Type']='application/json';
  if (requestId) headers[method==='POST'?'Idempotency-Key':'x-request-id'] = String(requestId);
  const options={method,headers,signal:AbortSignal.timeout(20000)};
  if (body !== undefined) options.body=JSON.stringify(body);
  const response=await fetchFn(BASE_URL+path,options);
  const raw=await response.text();
  let json;
  try { json=JSON.parse(raw); } catch { throw new Error(`PostZen returned non-JSON response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`PostZen HTTP ${response.status}: ${redact(json.code || json.error || json.message || 'Unknown error')}`);
  return json;
}

export function validateDraft({accountId,content,imageUrl}) {
  safeAccount(accountId);
  if (typeof content !== 'string' || content.length > 2200) throw new Error('Instagram caption must contain 2,200 characters or fewer.');
  let image;
  try { image=new URL(imageUrl); } catch { throw new Error('Image URL must be valid.'); }
  if (image.protocol!=='https:') throw new Error('Image URL must use HTTPS.');
  return {accountId,content,imageUrl:image.toString()};
}

export function buildDraft({accountId,content,imageUrl}) {
  const v=validateDraft({accountId,content,imageUrl});
  return {content:v.content,isDraft:true,mediaItems:[{url:v.imageUrl}],platforms:[{platform:'instagram',accountId:v.accountId,settings:{postType:'feed'}}]};
}

/** Retains the legacy x-request-id convention supported by PostZen post creation. */
export async function createInstagramDraft({accountId,content,imageUrl,requestId,apiKey=process.env.POSTZEN_API_KEY,fetchFn=fetch}) {
  if (!apiKey) throw new Error('POSTZEN_API_KEY is not configured.');
  const body=buildDraft({accountId,content,imageUrl});
  const headers={Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'};
  if(requestId)headers['x-request-id']=requestId;
  const response=await fetchFn(`${BASE_URL}/v1/posts`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const raw=await response.text();
  let json;
  try{json=JSON.parse(raw);}catch{throw new Error(`PostZen returned invalid JSON (HTTP ${response.status}).`);}
  if(!response.ok)throw new Error(`PostZen HTTP ${response.status}: ${redact(json.error||json.message||'Unknown error')}`);
  const post=json.post||json.existingPost;
  if(!post?._id||post.status!=='draft')throw new Error('PostZen did not confirm a saved draft.');
  const platform=(post.platforms||[]).find(x=>x.platform==='instagram');
  if(platform && (typeof platform.accountId==='string'?platform.accountId:platform.accountId?._id)!==accountId)throw new Error('PostZen returned another Instagram account.');
  return {id:post._id,status:post.status,account:accountId,message:json.message||'Draft saved'};
}

export async function listConnectedAccounts({apiKey,fetchFn}={}) {
  const data=await postzenRequest('/v1/accounts?platform=instagram',{apiKey,fetchFn});
  return (data.accounts||[]).map(a=>({id:a._id,platform:a.platform,username:a.username,status:a.status}));
}
export async function listPosts({accountId=DEFAULT_ACCOUNT_ID,limit=20,apiKey,fetchFn}={}) {
  safeAccount(accountId);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('limit must be 1..100.');
  const data=await postzenRequest(`/v1/posts?accountId=${accountId}&limit=${limit}`,{apiKey,fetchFn});
  return data.posts||[];
}
export async function getPost({postId,apiKey,fetchFn}) {
  const data=await postzenRequest(`/v1/posts/${safeId(postId,'post ID')}`,{apiKey,fetchFn});
  return data.post;
}
export async function listCommentAutomations({accountId=DEFAULT_ACCOUNT_ID,apiKey,fetchFn}={}) {
  safeAccount(accountId);
  const data=await postzenRequest(`/v1/comment-automations?accountId=${accountId}`,{apiKey,fetchFn});
  return data.automations||[];
}
export async function listConversations({accountId=DEFAULT_ACCOUNT_ID,limit=10,apiKey,fetchFn}={}) {
  safeAccount(accountId);
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('limit must be 1..100.');
  const data=await postzenRequest(`/v1/inbox/conversations?accountId=${accountId}&limit=${limit}`,{apiKey,fetchFn});
  return data.conversations||[];
}
export async function listPostComments({accountId=DEFAULT_ACCOUNT_ID,postId,limit=25,apiKey,fetchFn}={}) {
  safeAccount(accountId);safeId(postId,'post ID');
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('limit must be 1..100.');
  const data=await postzenRequest(`/v1/inbox/comments/${postId}?accountId=${accountId}&limit=${limit}`,{apiKey,fetchFn});
  return data.comments||[];
}

export function buildOptInRule({accountId=DEFAULT_ACCOUNT_ID,trigger='comment',name,keyword='INFO',dmMessage,commentReply}) {
  safeAccount(accountId);
  if(!['comment','story_reply'].includes(trigger)) throw new Error('Unsupported automation trigger.');
  if(typeof name!=='string'||name.length<4||name.length>100)throw new Error('Name required.');
  if(!/^[\p{L}\p{N} -]{2,24}$/u.test(keyword))throw new Error('Keyword must be 2-24 letters/digits.');
  if(typeof dmMessage!=='string'||!dmMessage.trim()||dmMessage.length>1000)throw new Error('DM text required, maximum 1,000 characters.');
  const body={accountId,name,trigger,keywords:[keyword],matchMode:'exact',typoTolerance:false,dmMessage,isActive:true};
  if(trigger==='comment' && commentReply)body.commentReply=commentReply;
  return body;
}
export async function createOptInRule({body,approved=false,apiKey,fetchFn}={}) {
  if(!approved)throw new Error('Explicit approval required before activating an outward-facing automation.');
  const safe=buildOptInRule(body);
  const data=await postzenRequest('/v1/comment-automations',{method:'POST',body:safe,apiKey,fetchFn});
  if(!data.automation?.id||data.automation?.isActive!==true)throw new Error('PostZen did not confirm an active automation.');
  return {id:data.automation.id,active:true,trigger:data.automation.trigger,keywords:data.automation.keywords};
}

export async function replyToComment({accountId=DEFAULT_ACCOUNT_ID,postId,commentId,message,approved=false,apiKey,fetchFn}={}) {
  if(!approved)throw new Error('Explicit approval required to send a public reply.');
  safeAccount(accountId);safeId(postId,'post ID');safeId(commentId,'comment ID');
  if(typeof message!=='string'||!message.trim()||message.length>2200)throw new Error('Invalid reply message.');
  return postzenRequest(`/v1/inbox/comments/${postId}`,{method:'POST',body:{accountId,commentId,message},apiKey,fetchFn});
}
export async function replyToConversation({accountId=DEFAULT_ACCOUNT_ID,conversationId,message,requestId,approved=false,apiKey,fetchFn}={}) {
  if(!approved)throw new Error('Explicit approval required to send a DM.');
  safeAccount(accountId);safeId(conversationId,'conversation ID');
  if(typeof message!=='string'||!message.trim()||message.length>1000)throw new Error('Invalid DM text.');
  if(!requestId)throw new Error('Idempotency key required for DM reply.');
  return postzenRequest(`/v1/inbox/conversations/${conversationId}/messages`,{method:'POST',body:{accountId,message},requestId,apiKey,fetchFn});
}