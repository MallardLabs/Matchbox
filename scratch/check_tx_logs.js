const https = require('https');

function post(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseBody));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const txHash = '0x01f21701a04b41dc9e8c8a88f5c08f8545e0115c6a903a7f89f3b6c695cd2d6f';
  const url = 'https://rpc-http.mezo.boar.network';

  console.log('Fetching transaction receipt for:', txHash);
  const response = await post(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getTransactionReceipt',
    params: [txHash]
  });

  if (response.error) {
    console.error('RPC Error:', response.error);
    return;
  }

  const receipt = response.result;
  if (!receipt) {
    console.error('Receipt not found');
    return;
  }

  console.log(`Logs in transaction (${receipt.logs.length}):`);
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`Log #${i}:`);
    console.log(`  Address: ${log.address}`);
    console.log(`  Topics: ${JSON.stringify(log.topics)}`);
    console.log(`  Data: ${log.data}`);
  }
}

main().catch(console.error);
