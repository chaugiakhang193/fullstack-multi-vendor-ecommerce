async function runTests() {
  const cases = [
    {
      name: '1. Phân trang cơ bản (Page 1, Limit 2)',
      url: 'http://localhost:8080/api/v1/products?page=1&limit=2',
    },
    {
      name: '2. Phân trang cơ bản (Page 2, Limit 2)',
      url: 'http://localhost:8080/api/v1/products?page=2&limit=2',
    },
    {
      name: '3. Sắp xếp theo giá tăng dần (Price ASC)',
      url: 'http://localhost:8080/api/v1/products?page=1&limit=2&sort=price&order=ASC',
    },
    {
      name: '4. Sắp xếp theo giá giảm dần (Price DESC)',
      url: 'http://localhost:8080/api/v1/products?page=1&limit=2&sort=price&order=DESC',
    },
    {
      name: '5. Lọc theo khoảng giá (min_price = 100000, max_price = 200000)',
      url: 'http://localhost:8080/api/v1/products?page=1&limit=2&min_price=100000&max_price=200000',
    },
  ];

  console.log('====== BẮT ĐẦU KIỂM THỬ QUERY PAGINATION & FILTERS ======\n');

  for (const tc of cases) {
    console.log(`👉 Running: ${tc.name}`);
    console.log(`   URL: ${tc.url}`);
    try {
      const response = await fetch(tc.url);
      const json = await response.json();

      if (!response.ok) {
        console.error(`   ❌ Failed with status ${response.status}:`, json);
        continue;
      }

      console.log(
        `   ✅ Success! Status: ${json.statusCode || response.status}`,
      );
      console.log(
        `   📊 Meta:`,
        JSON.stringify(json.data?.meta || json.meta, null, 2),
      );

      const items = json.data?.items || json.items || [];
      console.log(`   📦 Items returned: ${items.length}`);
      if (items.length > 0) {
        items.forEach((item: any, i: number) => {
          console.log(
            `      [Item ${i + 1}] Name: "${item.name}", Price: ${item.price}`,
          );
        });
      }
    } catch (error: any) {
      console.error(`   ❌ Request error:`, error.message);
    }
    console.log('\n------------------------------------------------------\n');
  }
}

runTests();
