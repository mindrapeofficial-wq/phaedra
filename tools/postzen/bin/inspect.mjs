#!/usr/bin/env node
import {listConnectedAccounts,listPosts,listCommentAutomations,listConversations,INSTAGRAM_ACCOUNT_ID} from '../src/postzen.mjs';
const accountId=process.env.POSTZEN_INSTAGRAM_ACCOUNT_ID||INSTAGRAM_ACCOUNT_ID;
try {
  const [accounts,posts,rules,conversations]=await Promise.all([
    listConnectedAccounts(),listPosts({accountId,limit:20}),listCommentAutomations({accountId}),listConversations({accountId,limit:10})
  ]);
  const account=accounts.find(a=>a.id===accountId);
  if(!account||account.status!=='connected')throw Error('Instagram account is not connected.');
  // Private message content and participants are intentionally excluded.
  console.log(JSON.stringify({account,posts:posts.map(p=>({id:p._id,status:p.status,content:p.content?.slice(0,75)})),automations:rules.map(a=>({id:a.id,name:a.name,active:a.isActive,trigger:a.trigger,keywords:a.keywords,stats:a.stats})),inboxConversationCountReturned:conversations.length},null,2));
} catch(error){console.error(error.message);process.exitCode=1;}