# Integration adapters

ทุกตัวเชื่อมแปลงข้อมูลเข้า contract กลาง แยกโค้ดใน `src/lib/integrations/adapters.ts`
ไม่ส่ง credential ไป browser หรือเก็บใน Git API key เครื่องลงเวลาเก็บเฉพาะ SHA-256 และแสดงครั้งเดียว

## เครื่องลงเวลา

Admin ไป ตั้งค่าและการเชื่อมต่อ → สร้าง API key ระบุ company UUID จากแถว integrations หรือบริษัทในฐานข้อมูล
ใช้ HTTPS เมื่อออกนอก localhost แนะนำ adapter gateway ในเครือข่ายเดียวกับเครื่องสแกน

```http
POST /api/integrations/attendance
Content-Type: application/json
X-Company-ID: <company UUID>
X-API-Key: <key ของบริษัท>
X-Device-Format: generic
```

```json
{
  "employee_code": "EMP-004",
  "event_id": "device-01:event-0001",
  "type": "in",
  "timestamp": "2026-10-27T09:00:00+07:00"
}
```

ประเภท `out` ต้องมีเวลาเข้าที่ยังไม่ออกใน 24 ชั่วโมงก่อนหน้า Timestamp ต้องไม่เก่ากว่า 31 วัน
และไม่เกินปัจจุบันมากกว่า 5 นาที ให้ gateway ส่งตามลำดับเวลาและใช้ event_id ที่ไม่ซ้ำต่อบริษัท
ตอบ `200 {ok:true,duplicate:true}` เมื่อ retry เหตุการณ์เดิม, `401` เมื่อ key ผิด,
`404` เมื่อไม่พบพนักงาน, `409` เมื่อสถานะเข้า/ออกไม่สัมพันธ์กัน

ตัวอย่างโปรโตคอล **DemoScan v1 (สมมติ)** ตั้ง `X-Device-Format: demoscan-v1`:

```json
{
  "badge": "EMP-004",
  "serial": "device-01:0002",
  "direction": "exit",
  "occurred_at": "2026-10-27T18:00:00+07:00"
}
```

การเพิ่มยี่ห้อจริง: implement `AttendanceAdapter.parse()` validate ด้วย Zod เพิ่มใน registry แล้วเขียน fixture test
ถ้าอุปกรณ์ส่งเฉพาะ local time ต้องกำหนด timezone ใน adapter อย่างชัดเจน ไม่เดา timezone จาก server
การลงเวลาผ่าน API เป็นข้อมูลที่ gateway รับรอง ไม่มีการรับหรือเก็บข้อมูล biometric ใน MVP

## Google / Microsoft OAuth

ตั้ง env ใน `.env` แล้ว restart server:

- Google: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
  - callback `http://localhost:3000/api/auth/callback/google`
- Microsoft: `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`
  - issuer `https://login.microsoftonline.com/<tenant-id>/v2.0`
  - callback `http://localhost:3000/api/auth/callback/microsoft-entra-id`

ให้ HR สร้าง user โดยใช้อีเมลบัญชีองค์กรก่อน Google ต้องเป็น verified email
Microsoft ต้องใช้ issuer ของ tenant ที่ตั้งใจให้เข้าใช้ ไม่ใช้ issuer ที่ไม่เชื่อถือ
Membership เป็นข้อมูลในระบบเรา ไม่ได้ให้สิทธิ์ตาม domain การมีบัญชี provider อย่างเดียวเข้าใช้ไม่ได้
สำหรับ production เปลี่ยน AUTH_URL และ callback เป็น URL HTTPS จริง

## LINE Messaging API

ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` บน server และ recipient user/group ID ใน Settings ของแต่ละบริษัท
ให้ผู้รับเพิ่มเพื่อน/เชิญ bot แล้ว admin กดส่งสรุปผ่าน LINE ใช้ endpoint `https://api.line.me/v2/bot/message/push`
ส่งเฉพาะจำนวนคำขอรออนุมัติ ไม่มีชื่อหรือเหตุผลการลา ไม่ใช้ LINE Notify ซึ่งเป็นคนละบริการ
MVP ใช้ bot ส่วนกลางเดียวสำหรับหลายบริษัท recipient แยกตามบริษัท
หากต้องการ bot แยกบริษัท ให้เพิ่ม secret reference ต่อ tenant ใน secret manager และเลือก credential ใน adapter

## ระบบบัญชี

```
GET /api/export?type=ot&from=2026-10-01&to=2026-10-31&format=generic
GET /api/export?type=ot&from=2026-10-01&to=2026-10-31&format=demoledger-v1
```

type รองรับ `employees`, `attendance`, `ot` (เฉพาะที่อนุมัติ) ต้องมีสิทธิ์ admin/HR
format `generic` ใช้ชื่อคอลัมน์กลาง ส่วน `demoledger-v1` เป็น schema ตัวอย่าง เช่น code → employee_number,
hours → approved_ot_hours ทั้งคู่เป็น UTF-8 BOM พร้อมป้องกัน spreadsheet formula injection
UI เลือกได้ทั้ง CSV มาตรฐานและ DemoLedger v1 เพื่อทดลองเปลี่ยน adapter

ยังไม่คำนวณ journal หรือยอดเงิน เพราะ payroll ไม่อยู่ใน scope การเชื่อม API จริงในอนาคตควรมี
`AccountingProvider.send(batch)` กับ outbox/job queue, idempotency key, per-company credential reference,
สถานะ sync และ retry แยกจาก transaction ของการอนุมัติ ไม่เรียก API ช้าใน transaction

## ผู้ช่วย AI

ตั้ง `OPENAI_API_KEY` และ `OPENAI_MODEL` เป็น model ที่บัญชีเปิดใช้ได้ จากนั้น restart
ใช้ OpenAI Responses API พร้อม `store:false` และ timeout 30 วินาที
ส่งเฉพาะคำถามและข้อความบทเรียนที่เผยแพร่/ได้รับมอบหมาย ไม่ส่งพนักงาน เงินเดือน หรือเฉลย
ข้อความที่ส่งยังผ่านการประมวลผลโดยผู้ให้บริการ จึงต้องใช้เนื้อหาที่องค์กรอนุญาตให้ส่งออก

หากไม่ตั้งค่า ใช้ค้นข้อความไทยตรงตัวพร้อมแหล่งข้อมูล ไม่ได้เรียก AI
เป็น retrieval แบบ lexical สำหรับ MVP; เมื่อข้อมูลมากขึ้นเปลี่ยน retriever เป็น full-text/vector โดยยังบังคับ tenant/enrollment filter

เอกสารทางการสำหรับพัฒนาต่อ:

- https://authjs.dev/getting-started/providers/google
- https://authjs.dev/getting-started/providers/microsoft-entra-id
- https://developers.line.biz/en/reference/messaging-api/#send-push-message
- https://developers.openai.com/api/docs/guides/text
