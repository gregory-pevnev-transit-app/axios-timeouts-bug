# Axios timeouts bug

Goal: Explaining why `ECONNRESET` error sometimes spuriously occurs when using Axios and how to reproduce the error.

### Debugging

**HTTP-Agent**: In order to see more information regarding socket-level operations and events, the `http.globalAgent` object (which is used for making all HTTP-based requests in Node.js - be it via a library of directly) is patched with extra console-logs (see `agent-patch.js`).

**HTTP-Server**: In order to reproduce the specific cases, a custom server is used (`server.js`). It does nothing but respond to all requests with the same static JSON data, which is sent over 2 TCP-Segments / IP-Packets (streaming the response):
1. Sending HTTP headers and a part of the JSON payload in the HTTP body with compression after **200ms**.
2. Sending the remaining JSON payload with compression and closing the response after **300ms**.

## Background (Socket-Timeouts)

When opening sockets in Node.js (HTTP, HTTPS or just TCP/IP), it is possible to set timeouts on them, which causes the sockets to emit events during periods of inactivity (no data is being sent or received on the corresponding socket): https://nodejs.org/docs/latest-v20.x/api/net.html#socketsettimeouttimeout-callback.

This is a purely advisory feature, which only emits corresponding events and does not cause sockets to be closed / reset. It does not even interact with the keep-alive feature of Node.js sockets, which is enabled by default since v19. In other words, even if a timeout occurs on a socket, only an event is going to be emitted, with the socket still usable not only for the current request, but also for subsequent ones (if it is kept alive).

You can check that by running `timeouts.js`, which performs 3 requests to a the server which takes a long time to respond, having set the Socket timeout to **100ms**.

```
Request #1
OPENED SOCKET SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SOCKET TIMEOUT
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SOCKET TIMEOUT
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SETTING SOCKET TIMEOUT 0
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SETTING SOCKET TIMEOUT 100
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
{ data: 'custom-data' }
Request #2
SOCKET TIMEOUT
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SOCKET TIMEOUT
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SETTING SOCKET TIMEOUT 0
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SETTING SOCKET TIMEOUT 100
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
{ data: 'custom-data' }
Request #3
SOCKET TIMEOUT
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SOCKET TIMEOUT
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SETTING SOCKET TIMEOUT 0
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
SETTING SOCKET TIMEOUT 100
SOCKET(http://localhost/)@2024-05-06T21:06:23.261Z
{ data: 'custom-data' }
```

As you can see, despite the timeouts, all request completes successfully and the same socket is even reused for subsequent requests as well (the keep-alive is enabled, just like the default for v19+). So socket-timeouts are not dangerous on their own.

## Axios Bug

When creating a custom Axios client, you can set a request-timeout, which is supposed to abort HTTP requests if they fail to resolve within the specified period of time. This is useful for avoiding unnecessary waiting when servers are down. When requests time out, they are supposed to fail with axios-specific error `ECONNABORTED`.

```js
axios.create({
  timeout: 5000, // Waiting for requests to resolve within 5s
});
```

The problem is that axios also sets the same timeout for the socket when making the request (set through `http.request`): https://github.com/axios/axios/blob/d1d359da347704e8b28d768e61515a3e96c5b072/lib/adapters/http.js#L640. This wouldn't be a problem on its own, if it did not cause a mismatch between axios-timeouts, which operate on HTTP-level, and socket-timeouts, which operate on TCP/IP level:
* Axios-Timeouts (HTTP-Level): Timeout on waiting for an HTTP-Response to be **initiated** for an HTTP-Request. In other words, as long as HTTP-Headers are received (at least a single TCP-Segment / IP-Packet), the request is considered to be resolved, even if it takes longer for the rest of the response to arrive. This logic is implemented entirely in the Axios client itself via `setTimeout` and has nothing to do with the Node.js HTTP stack.
* Socket-Timeouts (TCP/IP-Level): Timeouts on waiting for any **traffic** on the socket. In other words, if there is a certain amount of time between TCP-Segments / IP-Packets, a timeout-even is sent out. It does not matter if there was prior received data with headers or payload.
Axios does not differentiate between the two, which causes unexpected behaviour, where an invalid `ECONNRESET` error can be thrown, mistakenly declaring that a connection was reset (`TCP RST`).

This can occur in the following way:
1. Axios makes a request to a server with a timeout of 500ms, which sets both the HTTP-Timeout and the Socket-Timeout.
2. Server initiates a reply by sending HTTP-Headers and some data within 500ms, which prevents the request from timing out. From here on out, axios considers that the timeout cannot occur
3. At some point, there is a delay on the server for whatever internal reasons, because of that, the data is not being sent for 500ms.
4. This causes the Socket-Timeout to occur and publish the corresponding event.
5. The event is handled by axios, which immediately terminates the socket / connection. **However, this is where the bug occurs**.
6. Axios does not seem to anticipate the case where the socket / connection is closed midway through the response. After all, it does not consider timeouts possible at this point. Because of that, it mistakengly assumes that the socket was terminated from the server-side, therefore due to an `RST` and throws an incorrect `ECONNRESET` error.

This can be reproduced by running `client.js` which performs 2 requests to the server using 2 axios-clients:
1. A client with the `timeout` set to 150ms. Upon the request, axios CORRECTLY throws `ECONNABORT`, since it takes 200ms for the server to start sending data.
2. A client with the `timeout` set to 250ms. Upon the request, axios INCORRECTLY throws `ECONNRESET`, since while it only takes 200ms for the HTTP-Headers to be sent to the client (passing HTTP-Timeout), it takes 300ms for the rest of the response to be sent afterwards, which causes a Socket-Timeout to occur midway.

## Solution

Unfortunately, I don't see any solution other than simply stopping configuring axios `timeout` until the bug is resolved. 
