const http = require("http");

// Customization: Lower timeouts (The rest of options are the default ones)
// Reference: https://github.com/nodejs/node/blob/v20.x/lib/https.js#L355
http.globalAgent = new http.Agent({
  keepAlive: true,
  scheduling: 'lifo',
  timeout: 100,
});
require("./agent-patch"); // Extra debug information

const axios = require("axios").default;

const client = axios.create({});

async function main() {
  console.log("Request #1");
  const { data: data1 } = await client.get("http://localhost:9999");
  console.log(data1);
  
  console.log("Request #2");
  const { data: data2 } = await client.get("http://localhost:9999");
  console.log(data2);

  console.log("Request #3");
  const { data: data3 } = await client.get("http://localhost:9999");
  console.log(data3);
}
void main();
