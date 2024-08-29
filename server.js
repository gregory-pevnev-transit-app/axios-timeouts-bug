const { Readable } = require("stream");
const http = require("http");
const zlib = require("zlib");

const RESPONSE_DATA = { data: "custom-data" };

// Timing:
//  Initial: 200ms before the first packet is sent
//  Afterwards: 300ms before other packets are sent
const DATA1_TIMEOUT = 200;
const DATA2_TIMEOUT = 500;

async function getGZipBuffer(data) {
  return new Promise(resolve => {
    const dataStream = Readable.from(JSON.stringify(data))
      .pipe(zlib.createGzip());
    
    const chunks = []

    dataStream.on("data", chunk => {
      chunks.push(chunk);
    });

    dataStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

async function getSplitData(data) {
  const dataBuffer = await getGZipBuffer(data);

  const middle = dataBuffer.length / 2;
  
  const chunkBuffer1 = dataBuffer.subarray(0, middle);
  const chunkBuffer2 = dataBuffer.subarray(middle);

  return [chunkBuffer1, chunkBuffer2];
}

const server = http.createServer(async (req, res) => {
  // SUPER-IMPORTANT: STREAM
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Transfer-Encoding", "chunked");

  const [data1, data2] = await getSplitData(RESPONSE_DATA);

  setTimeout(() => {
    res.write(data1);
  }, DATA1_TIMEOUT);

  setTimeout(() => {
    res.write(data2);
    res.end();
  }, DATA2_TIMEOUT);
});

// 1s
server.keepAliveTimeout = 1 * 1000;

server.listen(9999);
