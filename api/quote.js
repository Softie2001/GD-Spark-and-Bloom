import {configured,body,method,onError,fail} from '../lib/server.js';
import {quote} from '../lib/shop.js';
export default async function handler(req,res){if(method(req,res,['POST']))return;if(!configured())return fail(res,503,'Store setup in progress');try{res.setHeader('Cache-Control','no-store');const result=await quote(body(req));return res.status(200).json(result)}catch(err){return onError(res,err)}}
