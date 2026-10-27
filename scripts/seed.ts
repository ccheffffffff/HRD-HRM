import { hash } from 'bcryptjs';
import { transaction, closeDatabase } from '../src/lib/db';
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set SEED_PASSWORD (at least 12 characters) in .env; or run pnpm setup.');
const passwordHash = await hash(password, 12);
await transaction(async (db) => {
  const existing = await db.query('SELECT id FROM companies LIMIT 1');
  if (existing.rows.length) {
    console.log('Seed skipped: existing company data preserved.');
    return;
  }
  const company = (
    await db.query(
      `INSERT INTO companies(name,slug) VALUES('บริษัท บลูม รีเทล จำกัด','bloom') RETURNING id`,
    )
  ).rows[0].id;
  const other = (
    await db.query(
      `INSERT INTO companies(name,slug) VALUES('บริษัท นอร์ธสตาร์ จำกัด','northstar') RETURNING id`,
    )
  ).rows[0].id;
  const department = (
    await db.query(
      `INSERT INTO departments(company_id,name) VALUES($1,'ปฏิบัติการหน้าร้าน') RETURNING id`,
      [company],
    )
  ).rows[0].id;
  const hrDept = (
    await db.query(
      `INSERT INTO departments(company_id,name) VALUES($1,'บุคคลและพัฒนาองค์กร') RETURNING id`,
      [company],
    )
  ).rows[0].id;
  const position = (
    await db.query(
      `INSERT INTO positions(company_id,name,description) VALUES($1,'พนักงานบริการลูกค้า','ต้อนรับลูกค้า รับคำสั่งซื้อ และดูแลมาตรฐานการบริการ') RETURNING id`,
      [company],
    )
  ).rows[0].id;
  let manager = '';
  const ids: string[] = [];
  const names = [
    ['admin', 'กมลชนก วัฒนกุล', 'admin'],
    ['hr', 'ธนพร ใจดี', 'hr'],
    ['manager', 'ศิริพร พัฒนกิจ', 'manager'],
    ['employee', 'ณัฐวุฒิ สุขสวัสดิ์', 'employee'],
    ['ploy', 'พลอยไพลิน รุ่งเรือง', 'employee'],
    ['narin', 'นรินทร์ ศรีสุข', 'employee'],
  ];
  for (let i = 0; i < names.length; i++) {
    const [key, name, role] = names[i];
    const email = key + '@bloom.demo';
    const user = (
      await db.query(`INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id`, [
        email,
        name,
        passwordHash,
      ])
    ).rows[0].id;
    const employee = (
      await db.query(
        `INSERT INTO employees(company_id,user_id,code,name,email,department_id,position_id,manager_id,start_date,probation_end,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE-$9::int,CURRENT_DATE+60,$10) RETURNING id`,
        [
          company,
          user,
          'EMP-' + String(i + 1).padStart(3, '0'),
          name,
          email,
          i < 2 ? hrDept : department,
          position,
          manager || null,
          i < 3 ? 200 : i * 2,
          i < 3 ? 'active' : 'probation',
        ],
      )
    ).rows[0].id;
    ids.push(employee);
    if (role === 'manager') manager = employee;
    await db.query(
      'INSERT INTO memberships(company_id,user_id,employee_id,role) VALUES($1,$2,$3,$4)',
      [company, user, employee, role],
    );
    if (i === 0)
      await db.query(`INSERT INTO memberships(company_id,user_id,role) VALUES($1,$2,'admin')`, [
        other,
        user,
      ]);
  }
  const shift = (
    await db.query(
      `INSERT INTO shifts(company_id,name,start_time,end_time) VALUES($1,'กะเช้า','09:00','18:00') RETURNING id`,
      [company],
    )
  ).rows[0].id;
  await db.query(
    `INSERT INTO shifts(company_id,name,start_time,end_time) VALUES($1,'กะบ่าย','13:00','22:00')`,
    [company],
  );
  for (const id of ids)
    await db.query(
      'INSERT INTO shift_assignments(company_id,employee_id,shift_id,work_date) VALUES($1,$2,$3,CURRENT_DATE)',
      [company, id, shift],
    );
  for (const [title, category, description, requires] of [
    [
      'ก้าวแรกกับ Bloom',
      'เริ่มงานใหม่',
      'รู้จักทีม กติกาการทำงาน และสิ่งที่ต้องรู้ก่อนเริ่มวันแรก',
      true,
    ],
    [
      'บริการลูกค้าอย่างมั่นใจ',
      'ทักษะการทำงาน',
      'ฝึกการต้อนรับ รับฟัง และจัดการคำร้องเรียนอย่างเป็นขั้นตอน',
      true,
    ],
    [
      'ความปลอดภัยในการทำงาน',
      'ความปลอดภัย',
      'สังเกตความเสี่ยง แจ้งเหตุ และทำงานอย่างปลอดภัย',
      false,
    ],
  ] as const) {
    const course = (
      await db.query(
        `INSERT INTO courses(company_id,title,description,category,position_id,pass_score,auto_assign,requires_signoff,published,duration_minutes) VALUES($1,$2,$3,$4,$5,80,true,$6,true,25) RETURNING id`,
        [company, title, description, category, position, requires],
      )
    ).rows[0].id;
    const contents =
      category === 'เริ่มงานใหม่'
        ? [
            [
              'ยินดีต้อนรับสู่ทีม',
              'text',
              'เริ่มงานวันแรก: พบหัวหน้างาน ตรวจสอบตารางกะ และศึกษาคู่มือประจำตำแหน่ง ก่อนเริ่มงานทุกครั้งให้ลงเวลาเข้าและตรวจสอบพื้นที่ทำงาน หากมีข้อสงสัยให้สอบถามหัวหน้างาน',
            ],
            [
              'การลาและการสื่อสาร',
              'document',
              'เมื่อต้องการลา ให้ยื่นคำขอผ่านเมนู ลา / OT ระบุประเภท วันที่ และเหตุผล แล้วรอการอนุมัติ หากป่วยกะทันหันให้แจ้งหัวหน้างานโดยเร็ว ห้ามส่งข้อมูลส่วนบุคคลของลูกค้าผ่านช่องทางสาธารณะ',
            ],
            [
              'เช็กลิสต์ก่อนเริ่มงาน',
              'text',
              '1. ตรวจสอบตารางกะ 2. ลงเวลาเข้า 3. เตรียมอุปกรณ์และพื้นที่ 4. ทบทวนงานกับหัวหน้า เมื่อเลิกงานให้ส่งมอบงานและลงเวลาออก เอกสารนี้เป็นตัวอย่าง ต้องปรับตามนโยบายของบริษัทก่อนใช้งานจริง',
            ],
          ]
        : category === 'ทักษะการทำงาน'
          ? [
              [
                'มาตรฐานการต้อนรับ',
                'text',
                'กล่าวทักทายอย่างสุภาพ รับฟังความต้องการ ทวนคำสั่งซื้อเพื่อยืนยันความถูกต้อง และขอบคุณลูกค้าทุกครั้ง ไม่สัญญาสิ่งที่อยู่นอกอำนาจหน้าที่',
              ],
              [
                'รับมือคำร้องเรียน',
                'text',
                'รับฟังโดยไม่โต้เถียง ขอโทษต่อประสบการณ์ที่เกิดขึ้น บันทึกข้อเท็จจริงและแจ้งหัวหน้า หากไม่สามารถแก้ไขได้ให้ส่งต่อผู้รับผิดชอบ ไม่เปิดเผยข้อมูลลูกค้าให้ผู้อื่น',
              ],
            ]
          : [
              [
                'ตรวจสอบความปลอดภัย',
                'text',
                'ตรวจสอบทางหนีไฟให้โล่ง รักษาพื้นให้แห้ง และตรวจอุปกรณ์ก่อนใช้ หากพบความเสี่ยงให้หยุดใช้งานและแจ้งหัวหน้า ห้ามซ่อมอุปกรณ์ไฟฟ้าเองหากไม่ได้รับมอบหมาย',
              ],
              [
                'เมื่อเกิดเหตุฉุกเฉิน',
                'text',
                'แจ้งหัวหน้างานและผู้รับผิดชอบความปลอดภัย ปฏิบัติตามแผนฉุกเฉินของสาขา ไปยังจุดรวมพล และไม่ย้อนกลับเข้าพื้นที่เสี่ยง ตัวอย่างนี้ไม่ใช้แทนแผนฉุกเฉินของสถานที่จริง',
              ],
            ];
    for (let j = 0; j < contents.length; j++)
      await db.query(
        `INSERT INTO lessons(company_id,course_id,title,type,content,sort_order) VALUES($1,$2,$3,$4,$5,$6)`,
        [company, course, ...contents[j], j + 1],
      );
    for (const [prompt, options, correct] of [
      [
        'หากไม่แน่ใจในขั้นตอนการทำงานควรทำอย่างไร?',
        ['เดาและทำต่อ', 'ถามหัวหน้างานและตรวจสอบคู่มือ', 'ให้ลูกค้าตัดสินใจ'],
        1,
      ],
      [
        'ข้อมูลลูกค้าควรถูกจัดการอย่างไร?',
        ['ส่งในกลุ่มสาธารณะ', 'เผยแพร่ได้เสมอ', 'เก็บรักษาและใช้เฉพาะงานที่ได้รับอนุญาต'],
        2,
      ],
      [
        'ก่อนเริ่มงานควรทำอะไร?',
        ['ตรวจตารางกะ ลงเวลา และเตรียมพื้นที่', 'รอให้มีคนเตือน', 'ข้ามการตรวจสอบ'],
        0,
      ],
    ] as const)
      await db.query(
        `INSERT INTO questions(company_id,course_id,prompt,options,correct_index,explanation) VALUES($1,$2,$3,$4,$5,'ทบทวนคู่มือและทำตามขั้นตอนที่บริษัทกำหนด')`,
        [company, course, prompt, JSON.stringify(options), correct],
      );
    for (const id of ids)
      await db.query(`INSERT INTO enrollments(company_id,course_id,employee_id) VALUES($1,$2,$3)`, [
        company,
        course,
        id,
      ]);
  }
  await db.query(
    `INSERT INTO requests(company_id,employee_id,type,start_date,end_date,reason) VALUES($1,$2,'leave',CURRENT_DATE+3,CURRENT_DATE+3,'ธุระครอบครัว')`,
    [company, ids[3]],
  );
  await db.query('INSERT INTO integrations(company_id) VALUES($1),($2)', [company, other]);
  console.log(
    'Seeded 2 companies, 4 roles, 6 employees and 3 sample courses. Demo emails: admin/hr/manager/employee@bloom.demo. Password is SEED_PASSWORD in .env.',
  );
});
await closeDatabase();
