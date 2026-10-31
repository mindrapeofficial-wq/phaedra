#!/usr/bin/env node
import {replyToConversation} from '../src/postzen.mjs';
const get=(flag)=>{const i=process.argv.indexOf('--'+flag);return i<0?undefined:process.argv[i+1]};
try {
  const response=await replyToConversation({conversationId:get('conversation'),message:get('message'),requestId:get('request-id'),approved:process.argv.includes('--approve-send')});
  console.log(JSON.stringify({success:response.success??true,data:response.data},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}