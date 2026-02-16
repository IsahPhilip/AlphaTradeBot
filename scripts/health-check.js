'use strict';

const http = require('http');

const port = process.env.PORT || 3000;

const request = http.request(
  {
    hostname: '127.0.0.1',
    port,
    path: '/health',
    method: 'GET',
    timeout: 3000
  },
  (response) => {
    let body = '';
    response.on('data', (chunk) => {
      body += chunk;
    });
    response.on('end', () => {
      console.log(`Health status code: ${response.statusCode}`);
      console.log(body);
      process.exit(response.statusCode === 200 ? 0 : 1);
    });
  }
);

request.on('error', (error) => {
  console.error('Health check request failed:', error.message);
  process.exit(1);
});

request.on('timeout', () => {
  request.destroy(new Error('Request timed out'));
});

request.end();
