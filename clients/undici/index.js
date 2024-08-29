const { request } = require("undici");
const zlib = require("zlib");

// WTF, why can't undici DIY?
async function decodeResponse(responseStream) {
  let rawJson = "";

  const readStream = responseStream.pipe(zlib.createGunzip());

  return new Promise(res => {
    readStream.on("data", (c) => rawJson += c.toString("utf8"));

    readStream.on("end", (c) => res(JSON.parse(rawJson)));
  });
}

async function main() {
  const { body } = await request("http://localhost:9999", {
    headers: {
      "Accept-Encoding": "gzip",
    },
    headersTimeout: 210,
    bodyTimeout: 310, // CAN BE DISABLED ENTIRELY
  });

  console.log(await decodeResponse(body));
}
void main();
