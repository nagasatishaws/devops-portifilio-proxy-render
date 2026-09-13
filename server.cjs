const express = require("express");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");
const https = require("https");

const app = express();

const PORT = process.env.PORT || 10000;

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION || "us-east-005";
const ENDPOINT =
  process.env.S3_ENDPOINT ||
  "https://s3.us-east-005.backblazeb2.com";

const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

const b2Agent = new https.Agent({
  keepAlive: true,
  lookup: (hostname, options, callback) => {
    const address = "149.137.141.9";

    if (options && options.all) {
      callback(null, [{ address, family: 4 }]);
    } else {
      callback(null, address, 4);
    }
  }
});


if (!BUCKET || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  throw new Error(
    "Missing S3_BUCKET, S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY"
  );
}

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,

  requestHandler: new NodeHttpHandler({
    connectionTimeout: 10000,
    socketTimeout: 30000,
    httpsAgent: b2Agent,
  }),

  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY
  }
});

async function sendObject(res, key) {
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key
    })
  );

  if (result.ContentType) {
    res.set("Content-Type", result.ContentType);
  }

  if (key === "index.html") {
    res.set("Cache-Control", "no-cache");
  } else if (key.startsWith("assets/")) {
    res.set(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );
  }

  result.Body.pipe(res);
}

app.get("*", async (req, res) => {
  let key = decodeURIComponent(req.path.replace(/^\/+/, ""));

  if (!key) {
    key = "index.html";
  }

  if (key.split("/").includes("..")) {
    return res.status(400).send("Bad request");
  }

  try {
    await sendObject(res, key);
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;

    const notFound =
      status === 404 ||
      err?.name === "NoSuchKey" ||
      err?.Code === "NoSuchKey";

    if (notFound && !/\.[^/]+$/.test(key)) {
      try {
        await sendObject(res, "index.html");
        return;
      } catch (fallbackError) {
        console.error("B2 index.html error:", fallbackError);
      }
    }

    console.error("B2 object error:", err);
    res.status(notFound ? 404 : 502).send("File not found");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Frontend B2 proxy listening on " + PORT);
});
