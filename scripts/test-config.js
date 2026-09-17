import http from 'http';

http.get('http://localhost:3000/api/config', (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Body:', data);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
