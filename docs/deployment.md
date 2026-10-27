# Vercel deployment

1. ใช้โค้ด Next.js ของโครงการนี้บน production branch ไม่ใช่ commit เริ่มต้นที่มีเฉพาะ README
2. Import GitHub repository โดยเลือก framework **Next.js**, root `./`, Node.js **24.x**
3. สร้าง/เชื่อม PostgreSQL แบบ managed เช่น Neon ผ่าน Storage แผนฟรี ใช้ pooled URL สำหรับ runtime
4. ตั้ง Environment Variables เฉพาะโปรเจกต์นี้และ production:

| ตัวแปร          | ค่า                                                                     |
| --------------- | ----------------------------------------------------------------------- |
| DATABASE_URL    | PostgreSQL connection string จาก provider; ใช้ TLS ตาม URL ของ provider |
| AUTH_SECRET     | สุ่มใหม่อย่างน้อย 32 ตัวอักษร อย่าใช้ secret ของเครื่องทดลอง            |
| AUTH_TRUST_HOST | true                                                                    |
| DEPLOY_MIGRATE  | true เพื่อสร้าง schema ก่อน build ใน production                         |
| SEED_DEMO       | true เฉพาะการเริ่มระบบพร้อมข้อมูลตัวอย่าง                               |
| SEED_PASSWORD   | รหัสบัญชีตัวอย่างสุ่มใหม่ อย่างน้อย 12 ตัวอักษร                         |

`vercel.json` ใช้ `pnpm deploy:build` ซึ่งรัน migration แบบ idempotent และ optional seed เฉพาะ
`VERCEL_ENV=production` เมื่อเปิด flag เท่านั้น ไม่อ่าน `.env` จาก source repository
Seed ไม่ทับข้อมูลเมื่อมีบริษัทอยู่แล้ว หลังเริ่มระบบสำเร็จสามารถลบ SEED_PASSWORD และตั้ง SEED_DEMO=false
โดยไม่กระทบการเข้าสู่ระบบของบัญชีที่สร้างไว้แล้ว (รหัสถูกเก็บเป็น bcrypt hash ในฐานข้อมูล)

AUTH_URL ไม่จำเป็นบน Vercel เมื่อใช้ host detection; ถ้าตั้งให้ใช้ URL HTTPS ของโดเมนจริง ห้าม localhost
Google/Microsoft callbacks ต้องเปลี่ยนเป็นโดเมนจริงและตั้งค่า provider ก่อนเปิดปุ่ม login
AI/LINE ไม่ได้เปิดอัตโนมัติ ต้องตั้ง key และ account ของบริการเหล่านั้นแยกต่างหาก

Region ของ functions ตั้งเป็น Singapore (`sin1`); ให้เลือกฐานข้อมูลใกล้กันถ้าแผนรองรับ
Connection pool จำกัด 3 ต่อ instance พร้อม connect/idle timeout ห้ามปิด TLS certificate verification
ไม่มีการ fallback ไปฐานข้อมูลไฟล์เมื่อออนไลน์ เพื่อไม่ให้ข้อมูลหายตาม lifecycle ของ function

## ตรวจหลัง deploy

- Deployment เป็น Ready และหน้า /login โหลดผ่าน HTTPS
- เข้าด้วย admin@bloom.demo + รหัส SEED_PASSWORD ของ deployment นี้
- /dashboard มีบริษัทตัวอย่าง พนักงานและหลักสูตร; สลับบริษัทแล้วข้อมูลแยกจากกัน
- ลงเวลา/เรียนบทเรียนแล้ว reload เพื่อตรวจ persistence
- ทดสอบออกจากระบบและเข้าสู่ระบบใหม่

Preview deployments จะไม่รัน migration/seed โดยอัตโนมัติ ควรใช้ฐานข้อมูล preview แยก production
ยังไม่ควรใส่ข้อมูลพนักงานจริงจนกว่าจะกำหนดการสำรอง กู้คืน สิทธิ์ และนโยบายข้อมูลขององค์กรครบ
