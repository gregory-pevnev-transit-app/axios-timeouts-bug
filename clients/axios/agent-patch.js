const http = require("http");

// Extending the HTTP-Agent and its Sockets used for ALL HTTP calls to log out extra information regarding timeouts
// IMPORTANT: TCP-LEVEL TIMEOUTS - TIMING OUT WHEN NOT RECEIVING TCP-SEGMENTS / IP-PACKETS (NOT HTTP LEVEL)
const httpAgentCreateConnection = http.globalAgent.createConnection.bind(http.globalAgent);
http.globalAgent.createConnection = function (...params) {
  const info = params[0];
  const socketInfo = `SOCKET(${info.protocol}//${info.hostname}${info.pathname})@${new Date().toISOString()}`;

  const socket = httpAgentCreateConnection(...params);

  const socketSetTimeout = socket.setTimeout.bind(socket);
  socket.setTimeout = function (timeoutInMs) {
    console.log("SETTING SOCKET TIMEOUT", timeoutInMs);
    console.log(socketInfo);
    return socketSetTimeout(timeoutInMs);
  };

  socket.on("timeout", () => {
    console.log("SOCKET TIMEOUT");
    console.log(socketInfo);
  });

  socket.on("end", () => {
    console.log("SOCKET END");
    console.log(socketInfo);
  });

  socket.on("close", () => {
    console.log("SOCKET CLOSE");
    console.log(socketInfo);
  });

  console.log("OPENED SOCKET", socketInfo);
  return socket;
};
