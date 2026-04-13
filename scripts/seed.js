const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Sample data generators
const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Barbara', 'David', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa', 'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Hall', 'Allen'];
const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations', 'IT', 'Customer Support', 'Product', 'Design'];
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Seattle', 'Denver', 'Boston', 'Portland', 'Miami', 'Atlanta', 'Detroit', 'Minneapolis', 'Cleveland'];
const statuses = ['Active', 'On Leave', 'Remote', 'In Office', 'Part-time'];

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

async function main() {
  console.log('🌱 Starting seed...');

  const user = await prisma.user.findFirst();
  
  if (!user) {
    console.error('❌ No user found! Please create a user first.');
    return;
  }

  console.log(`👤 Using user: ${user.email}`);
  console.log('📊 Creating Employee Directory table...');
  
  const table = await prisma.agoraTable.create({
    data: {
      name: 'Employee Directory',
      slug: 'employee-directory',
      icon: '👥',
      description: 'Sample employee directory with 100 records',
      createdById: user.id,
    },
  });

  console.log(`✅ Table created: ${table.id}`);
  console.log('📝 Creating columns...');
  
  const columns = await Promise.all([
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Employee Name',
        type: 'text',
        position: 0,
        settings: {},
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Email',
        type: 'email',
        position: 1,
        settings: {},
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Department',
        type: 'select',
        position: 2,
        settings: {
          options: departments.map((dept, idx) => ({
            value: dept.toLowerCase().replace(/\s+/g, '_'),
            label: dept,
            color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'][idx],
          })),
        },
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Annual Salary',
        type: 'currency',
        position: 3,
        settings: {},
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Start Date',
        type: 'date',
        position: 4,
        settings: {},
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Location',
        type: 'text',
        position: 5,
        settings: {},
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Status',
        type: 'select',
        position: 6,
        settings: {
          options: statuses.map((status, idx) => ({
            value: status.toLowerCase().replace(/\s+/g, '_'),
            label: status,
            color: ['#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'][idx],
          })),
        },
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Performance',
        type: 'rating',
        position: 7,
        settings: {},
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Projects Completed',
        type: 'number',
        position: 8,
        settings: {},
      },
    }),
    prisma.agoraColumn.create({
      data: {
        tableId: table.id,
        name: 'Remote Eligible',
        type: 'checkbox',
        position: 9,
        settings: {},
      },
    }),
  ]);

  console.log(`✅ Created ${columns.length} columns`);
  console.log('🎲 Generating 100 employee records...');
  
  const rows = [];
  for (let i = 0; i < 100; i++) {
    const firstName = randomItem(firstNames);
    const lastName = randomItem(lastNames);
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`;
    const department = randomItem(departments);
    const salary = randomNumber(45000, 150000);
    const startDate = randomDate(new Date(2018, 0, 1), new Date(2024, 11, 31));
    const location = randomItem(cities);
    const status = randomItem(statuses);
    const performance = randomNumber(1, 5);
    const projects = randomNumber(0, 50);
    const remoteEligible = Math.random() > 0.3;

    const rowData = {};
    rowData[columns[0].id] = name;
    rowData[columns[1].id] = email;
    rowData[columns[2].id] = department.toLowerCase().replace(/\s+/g, '_');
    rowData[columns[3].id] = salary.toString();
    rowData[columns[4].id] = startDate;
    rowData[columns[5].id] = location;
    rowData[columns[6].id] = status.toLowerCase().replace(/\s+/g, '_');
    rowData[columns[7].id] = performance.toString();
    rowData[columns[8].id] = projects.toString();
    rowData[columns[9].id] = remoteEligible.toString();

    rows.push({
      tableId: table.id,
      data: rowData,
      position: i,
      createdById: user.id,
    });
  }

  await prisma.agoraRow.createMany({
    data: rows,
  });

  console.log(`✅ Created 100 employee records`);
  console.log('');
  console.log('🎉 Seed complete!');
  console.log(`📊 Table ID: ${table.id}`);
  console.log(`🔗 View at: http://localhost:3000/tables/${table.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });