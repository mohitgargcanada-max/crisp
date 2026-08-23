"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

function frame(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function parseFrames(buffer) {
  const messages = [];
  let remaining = buffer;
  while (true) {
    const headerEnd = remaining.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = remaining.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (remaining.length < bodyEnd) break;
    messages.push(JSON.parse(remaining.slice(bodyStart, bodyEnd)));
    remaining = remaining.slice(bodyEnd);
  }
  return messages;
}

const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  stdio: ["pipe", "pipe", "inherit"],
});

let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});

child.stdin.write(frame({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05" },
}));
child.stdin.write(frame({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
}));
child.stdin.write(frame({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "compress_log",
    arguments: {
      log: "running tests\nERROR test_auth.py:42 AssertionError: token expired\nERROR test_auth.py:42 AssertionError: token expired\nExit code: 1",
    },
  },
}));

setTimeout(() => {
  child.kill();
  const messages = parseFrames(stdout);
  const hasTools = messages.some((message) => message.id === 2 && message.result?.tools?.length >= 6);
  const hasFailure = messages.some((message) => message.id === 3 && /"status": "fail"/.test(message.result?.content?.[0]?.text || ""));
  if (!hasTools || !hasFailure) {
    console.error(stdout);
    process.exit(1);
  }
  console.log("smoke ok");
}, 500);
