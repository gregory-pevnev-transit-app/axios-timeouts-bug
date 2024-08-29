require("./agent-patch"); // Extra debug information

const axios = require("axios").default;

const REQUEST_TIMEOUT = 150; // Causes HTTP-Level / Request-Level timeouts -> ECONNABORTED (CORRECT)
const SOCKET_TIMEOUT = 250; // Causes TCP-Level / Socket-Level timeouts -> ECONNRESET (INCORRECT)

const clientWithRequestTimeout = axios.create({
  timeout: REQUEST_TIMEOUT,
});

const clientWithSocketTimeout = axios.create({
  timeout: SOCKET_TIMEOUT,
});

async function performRequest(axiosClient) {
  const start = Date.now();
  try {
    const { data } = await axiosClient.get("http://localhost:9999");
    console.log(data);
  } catch (error) {
    console.log(error);
  } finally {
    console.log("Time:", Date.now() - start);
  }
}

async function main() {
  console.log("Using client with Request-Timeout")
  await performRequest(clientWithRequestTimeout);

  console.log("Using client with Socket-Timeout");
  await performRequest(clientWithSocketTimeout);
}
void main();
