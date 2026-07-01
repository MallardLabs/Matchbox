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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const address = '0x0513542f2cc8a5e83ee20e09ba8505d2def7d75c';
  const url = 'https://rpc-http.mezo.boar.network';

  const startBlock = 8000000;
  const endBlock = 9000000;
  const chunkSize = 9900;

  console.log(`Scanning logs for address ${address} from block ${startBlock} to ${endBlock} in chunks of ${chunkSize} using ${url}...`);

  for (let current = startBlock; current < endBlock; current += chunkSize) {
    const toBlock = Math.min(current + chunkSize - 1, endBlock);
    
    const payload = {
      jsonrpc: '2.0',
      id: current,
      method: 'eth_getLogs',
      params: [{
        address: address,
        fromBlock: '0x' + current.toString(16),
        toBlock: '0x' + toBlock.toString(16)
      }]
    };

    let attempts = 0;
    let response = null;
    while (attempts < 5) {
      try {
        response = await post(url, payload);
        if (response && response.error) {
          const errStr = JSON.stringify(response.error).toLowerCase();
          console.warn(`RPC returned error at range ${current}-${toBlock}, retrying in 5s...`);
          await sleep(5000);
          attempts++;
          continue;
        }
        break;
      } catch (e) {
        console.error(`Request failed at range ${current}-${toBlock}, retrying in 5s...`, e.message);
        await sleep(5000);
        attempts++;
      }
    }

    if (!response || response.error) {
      console.error(`Error in chunk ${current}-${toBlock}:`, response ? response.error : 'No response');
      break;
    }

    const logs = response.result || [];
    if (logs.length > 0) {
      console.log(`Found ${logs.length} logs in block range ${current}-${toBlock}:`);
      for (const log of logs) {
        console.log(`  Tx: ${log.transactionHash}`);
        console.log(`  Block: ${parseInt(log.blockNumber, 16)}`);
        console.log(`  Topics: ${JSON.stringify(log.topics)}`);
        console.log(`  Data: ${log.data}`);
      }
    }

    await sleep(600); // 600ms delay between queries to be extremely friendly
  }
  console.log('Scan completed.');
}

main().catch(console.error);
