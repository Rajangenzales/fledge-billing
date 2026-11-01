import type { PaymentAdjustmentEvent, PaymentAdjustmentRepository, PaymentAdjustmentTotals } from "@fledge/application";
import { PaymentAdjustmentError } from "@fledge/application";
import type { SchemaDatabase } from "./connection.js";
import type { Migration } from "./migrate.js";

export const paymentAdjustments: Migration = {
  version: 11, name: "payment-refund-reversal-events",
  up(db) {
    db.exec(`CREATE TABLE payment_adjustment_event (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES business(id), customer_id TEXT NOT NULL REFERENCES customer(id),
      receipt_id TEXT NOT NULL REFERENCES customer_receipt(id), event_type TEXT NOT NULL CHECK (event_type IN ('refund','reverse_receipt','reverse_refund')),
      original_event_id TEXT, amount TEXT NOT NULL, payment_date TEXT,
      method TEXT CHECK (method IS NULL OR method IN ('cash','upi','bank_transfer','card','cheque','other')),
      reason TEXT NOT NULL, idempotency_key TEXT NOT NULL, recorded_at TEXT NOT NULL, UNIQUE (business_id,idempotency_key),
      CHECK ((event_type='refund' AND original_event_id IS NULL AND amount <> '0' AND payment_date IS NOT NULL AND method IS NOT NULL)
      OR (event_type='reverse_receipt' AND original_event_id IS NULL AND amount <> '0' AND payment_date IS NULL AND method IS NULL)
      OR (event_type='reverse_refund' AND original_event_id IS NOT NULL AND amount <> '0' AND payment_date IS NULL AND method IS NULL))
    )`);
    db.exec("CREATE UNIQUE INDEX payment_adjustment_receipt_reverse_once_idx ON payment_adjustment_event (receipt_id) WHERE event_type = 'reverse_receipt'");
    db.exec("CREATE UNIQUE INDEX payment_adjustment_refund_reverse_once_idx ON payment_adjustment_event (original_event_id) WHERE event_type = 'reverse_refund'");
    db.exec("CREATE INDEX payment_adjustment_customer_idx ON payment_adjustment_event (business_id,customer_id,receipt_id,recorded_at)");
  },
};
export function createPaymentAdjustmentRepository(db: SchemaDatabase): PaymentAdjustmentRepository {
  return {
    async getBusinessId() { const rows=db.prepare("SELECT id FROM business").all(); if(rows.length>1)throw new PaymentAdjustmentError("More than one business profile is stored."); return typeof rows[0]?.id==="string"?rows[0].id as string:null; },
    async customerExists(customerId,businessId) { return Boolean(db.prepare("SELECT id FROM customer WHERE id=? AND business_id=?").get(customerId,businessId)); },
    async recordRefund(event) { return transaction(db,()=>{
      const prior=byKey(db,event.businessId,event.idempotencyKey);
      if(prior){if(prior.eventType!=="refund"||prior.receiptId!==event.receiptId||prior.amount!==event.amount||prior.paymentDate!==event.paymentDate||prior.method!==event.method||prior.reason!==event.reason)throw new PaymentAdjustmentError("This refund request key was already used for different details.");return prior;}
      const receipt=receiptFor(db,event.businessId,event.receiptId);if(!receipt)throw new PaymentAdjustmentError("That receipt was not found for this business.");
      if(event.customerId&&event.customerId!==receipt.customerId)throw new PaymentAdjustmentError("The receipt customer does not match.");
      if(receiptReversed(db,event.businessId,event.receiptId))throw new PaymentAdjustmentError("A reversed receipt cannot be refunded.");
      if(activeAllocation(db,event.businessId,event.receiptId)>0n)throw new PaymentAdjustmentError("Release the receipt's active invoice allocations before recording a refund.");
      const refundable=paise(receipt.amount)-netRefunded(db,event.businessId,event.receiptId);if(paise(event.amount)>refundable)throw new PaymentAdjustmentError("The refund exceeds the receipt's remaining refundable amount.");
      const saved={...event,customerId:receipt.customerId};insert(db,saved);return saved;
    });},
    async reverseReceipt(event) { return transaction(db,()=>{
      const prior=byKey(db,event.businessId,event.idempotencyKey);
      if(prior){if(prior.eventType!=="reverse_receipt"||prior.receiptId!==event.receiptId||prior.reason!==event.reason)throw new PaymentAdjustmentError("This receipt-reversal key was already used for different details.");return prior;}
      const receipt=receiptFor(db,event.businessId,event.receiptId);if(!receipt)throw new PaymentAdjustmentError("That receipt was not found for this business.");
      if(activeAllocation(db,event.businessId,event.receiptId)>0n)throw new PaymentAdjustmentError("Release the receipt's active invoice allocations before reversing it.");
      if(netRefunded(db,event.businessId,event.receiptId)>0n)throw new PaymentAdjustmentError("Reverse or resolve the receipt's refunds before reversing the receipt.");
      if(receiptReversed(db,event.businessId,event.receiptId))throw new PaymentAdjustmentError("That receipt has already been reversed.");
      const saved={...event,customerId:receipt.customerId,amount:receipt.amount};insert(db,saved);return saved;
    });},
    async reverseRefund(event) { return transaction(db,()=>{
      const prior=byKey(db,event.businessId,event.idempotencyKey);
      if(prior){if(prior.eventType!=="reverse_refund"||prior.originalEventId!==event.originalEventId||prior.reason!==event.reason)throw new PaymentAdjustmentError("This refund-reversal key was already used for different details.");return prior;}
      const original=db.prepare("SELECT * FROM payment_adjustment_event WHERE id=? AND business_id=? AND event_type='refund'").get(event.originalEventId,event.businessId);
      if(!original)throw new PaymentAdjustmentError("That original refund was not found for this business.");
      if(db.prepare("SELECT id FROM payment_adjustment_event WHERE original_event_id=? AND event_type='reverse_refund'").get(event.originalEventId))throw new PaymentAdjustmentError("That refund entry has already been reversed.");
      const saved:PaymentAdjustmentEvent={...event,customerId:text(original.customer_id),receiptId:text(original.receipt_id),amount:text(original.amount)};insert(db,saved);return saved;
    });},
    async list(receiptId) { const businessId=await this.getBusinessId();if(!businessId)return[];return db.prepare("SELECT * FROM payment_adjustment_event WHERE business_id=? AND receipt_id=? ORDER BY recorded_at,id").all(businessId,receiptId).map(toEvent); },
    async totals(customerId): Promise<PaymentAdjustmentTotals> {
      const businessId=await this.getBusinessId();if(!businessId)return{refundedAmount:"0",reversedReceiptAmount:"0"};
      const rows=db.prepare("SELECT * FROM payment_adjustment_event WHERE business_id=? AND customer_id=?").all(businessId,customerId).map(toEvent);
      let refunds=0n,reversed=0n;
      for(const event of rows){if(event.eventType==="refund"&&!rows.some(x=>x.eventType==="reverse_refund"&&x.originalEventId===event.id))refunds+=paise(event.amount);if(event.eventType==="reverse_receipt")reversed+=paise(event.amount);}
      return{refundedAmount:formatPaise(refunds),reversedReceiptAmount:formatPaise(reversed)};
    },
  };
}
function receiptFor(db:SchemaDatabase,b:string,r:string):{customerId:string;amount:string}|null{const x=db.prepare("SELECT customer_id,amount FROM customer_receipt WHERE id=? AND business_id=?").get(r,b);return x?{customerId:text(x.customer_id),amount:text(x.amount)}:null;}
function activeAllocation(db:SchemaDatabase,b:string,r:string):bigint{return db.prepare("SELECT event_type,amount FROM payment_allocation_event WHERE business_id=? AND receipt_id=?").all(b,r).reduce((n,x)=>n+(x.event_type==="allocate"?paise(text(x.amount)):-paise(text(x.amount))),0n);}
function receiptReversed(db:SchemaDatabase,b:string,r:string):boolean{return Boolean(db.prepare("SELECT id FROM payment_adjustment_event WHERE business_id=? AND receipt_id=? AND event_type='reverse_receipt'").get(b,r));}
function netRefunded(db:SchemaDatabase,b:string,r:string):bigint{const rows=db.prepare("SELECT id,event_type,original_event_id,amount FROM payment_adjustment_event WHERE business_id=? AND receipt_id=?").all(b,r);let n=0n;for(const x of rows)if(x.event_type==="refund"&&!db.prepare("SELECT id FROM payment_adjustment_event WHERE original_event_id=? AND event_type='reverse_refund'").get(text(x.id)))n+=paise(text(x.amount));return n;}
function insert(db:SchemaDatabase,e:PaymentAdjustmentEvent):void{db.prepare("INSERT INTO payment_adjustment_event(id,business_id,customer_id,receipt_id,event_type,original_event_id,amount,payment_date,method,reason,idempotency_key,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(e.id,e.businessId,e.customerId,e.receiptId,e.eventType,e.originalEventId,e.amount,e.paymentDate,e.method,e.reason,e.idempotencyKey,e.recordedAt);}
function byKey(db:SchemaDatabase,b:string,k:string):PaymentAdjustmentEvent|null{const x=db.prepare("SELECT * FROM payment_adjustment_event WHERE business_id=? AND idempotency_key=?").get(b,k);return x?toEvent(x):null;}
function toEvent(r:Record<string,unknown>):PaymentAdjustmentEvent{const t=r.event_type,m=r.method;if(t!=="refund"&&t!=="reverse_receipt"&&t!=="reverse_refund")throw new PaymentAdjustmentError("A saved payment adjustment is invalid.");if(m!=null&&!["cash","upi","bank_transfer","card","cheque","other"].includes(String(m)))throw new PaymentAdjustmentError("A saved refund method is invalid.");return{id:text(r.id),businessId:text(r.business_id),customerId:text(r.customer_id),receiptId:text(r.receipt_id),eventType:t,originalEventId:nullableText(r.original_event_id),amount:text(r.amount),paymentDate:nullableText(r.payment_date),method:m==null?null:m as PaymentAdjustmentEvent["method"],reason:text(r.reason),idempotencyKey:text(r.idempotency_key),recordedAt:text(r.recorded_at)};}
function paise(v:string):bigint{if(!/^\d+(?:\.\d{1,2})?$/.test(v))throw new PaymentAdjustmentError("A saved financial amount is invalid.");const[w,f=""]=v.split(".");return BigInt(w!)*100n+BigInt(f.padEnd(2,"0"));}
function formatPaise(v:bigint):string{const w=v/100n,f=(v%100n).toString().padStart(2,"0");return f==="00"?w.toString():`${w}.${f}`;}
function text(v:unknown):string{if(typeof v!=="string"||!v.length)throw new PaymentAdjustmentError("A saved payment adjustment field is invalid.");return v;}
function nullableText(v:unknown):string|null{if(v==null)return null;if(typeof v!=="string")throw new PaymentAdjustmentError("A saved payment adjustment field is invalid.");return v;}
function transaction<T>(db:SchemaDatabase,work:()=>T):T{db.exec("BEGIN IMMEDIATE");try{const r=work();db.exec("COMMIT");return r;}catch(e){try{db.exec("ROLLBACK");}catch{/* already ended */}throw e;}}
