import crypto from 'node:crypto';

export function verifyLemonSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected=crypto.createHmac('sha256',secret).update(rawBody).digest('hex');
  const a=Buffer.from(expected,'utf8');
  const b=Buffer.from(String(signature),'utf8');
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

export function checkoutUrl(baseUrl, custom={}) {
  if(!baseUrl) return '';
  const url=new URL(baseUrl);
  for(const [key,value] of Object.entries(custom)) {
    if(value!==undefined&&value!==null&&String(value)!=='') url.searchParams.set(`checkout[custom][${key}]`,String(value));
  }
  return url.href;
}

export function normalizeLemonEvent(payload={}) {
  const meta=payload.meta||{};
  const data=payload.data||{};
  const attributes=data.attributes||{};
  return {
    eventName:String(meta.event_name||''),
    eventId:String(data.id||meta.webhook_id||''),
    objectType:String(data.type||''),
    custom:meta.custom_data||{},
    attributes,
    testMode:Boolean(meta.test_mode||attributes.test_mode),
    amountCents:Number(attributes.total||attributes.subtotal||0),
    currency:String(attributes.currency||attributes.currency_code||'USD'),
    customerEmail:String(attributes.user_email||attributes.customer_email||''),
    status:String(attributes.status||''),
    createdAt:String(attributes.created_at||new Date().toISOString())
  };
}
