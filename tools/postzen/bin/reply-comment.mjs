#!/usr/bin/env node
import {replyToComment} from '../src/postzen.mjs';
const get=(flag)=>{const i=process.argv.indexOf('--'+flag);return i<0?undefined:process.argv[i+1]};
try {
  const response=await replyToComment({postId:get('post'),commentId:get('comment'),message:get('message'),approved:process.argv.includes('--approve-send')});
  console.log(JSON.stringify({success:response.success??true,data:response.data},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}