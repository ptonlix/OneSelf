/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registers tests synchronously */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectLanIPv4,
  localOrigin,
  localOriginOk,
  originOk,
  originOkFor,
  portOk,
  profileOk,
  secretOk,
} from "./validate.ts";

test("originOk accepts https host and host:port", () => {
  assert.equal(originOk("https://oneself.example.com"), true);
  assert.equal(originOk("https://oneself.example.com:8443"), true);
  assert.equal(originOk("https://host.tailnet.ts.net"), true);
});

test("originOk rejects localhost, paths, dots, http by default", () => {
  assert.equal(originOk("https://localhost"), false);
  assert.equal(originOk("https://localhost:443"), false);
  assert.equal(originOk("https://127.0.0.1"), false);
  assert.equal(originOk("https://oneself.example.com/pcp"), false);
  assert.equal(originOk("https://.evil"), false);
  assert.equal(originOk("https://a..b"), false);
  assert.equal(originOk("http://oneself.example.com"), false);
  assert.equal(originOk("http://oneself.example.com", true), true);
});

test("secretOk and profileOk", () => {
  assert.equal(secretOk("change-me"), false);
  assert.equal(secretOk("good-secret"), true);
  assert.equal(profileOk("cloudflared"), true);
  assert.equal(profileOk("cloudflared,caddy"), false);
  assert.equal(profileOk("local"), true);
  assert.equal(profileOk(""), false);
});

test("local ingress requires http://host:HOST_PORT", () => {
  assert.equal(localOriginOk("http://192.168.1.10:3000"), true);
  assert.equal(localOriginOk("http://127.0.0.1:3000"), true);
  assert.equal(localOriginOk("http://localhost:3000/"), true);
  assert.equal(localOriginOk("http://192.168.1.10:3000", "3000"), true);
  assert.equal(localOriginOk("http://192.168.1.10:3001", "3001"), true);
  // https 是公网入口的地址，本机入口不能用
  assert.equal(localOriginOk("https://oneself.example.com"), false);
  assert.equal(localOriginOk("https://192.168.1.10:3000", "3000"), false);
  // 必须带端口，且与 HOST_PORT 一致
  assert.equal(localOriginOk("http://192.168.1.10"), false);
  assert.equal(localOriginOk("http://192.168.1.10:3000", "3001"), false);
  assert.equal(localOriginOk("http://192.168.1.10:03000", "3000"), false);
  assert.equal(localOriginOk("http://192.168.1.10:3000/admin"), false);
  assert.equal(localOriginOk("http://192.168.1.10:99999"), false);
  assert.equal(localOriginOk("192.168.1.10:3000"), false);
  assert.equal(originOkFor("local", "http://10.0.0.5:3000", false, "3000"), true);
  assert.equal(originOkFor("local", "http://10.0.0.5:3000", false, "3001"), false);
  assert.equal(originOkFor("local", "https://oneself.example.com"), false);
  assert.equal(originOkFor("cloudflared", "http://10.0.0.5:3000"), false);
  assert.equal(originOkFor("caddy", "https://oneself.example.com"), true);
});

test("portOk", () => {
  assert.equal(portOk("3000"), true);
  assert.equal(portOk("65535"), true);
  assert.equal(portOk("0"), false);
  assert.equal(portOk("03000"), false);
  assert.equal(portOk("65536"), false);
  assert.equal(portOk("30a"), false);
  assert.equal(portOk(""), false);
  assert.equal(originOk("https://oneself.example.com:08443"), false);
});

const nic = (address: string, internal = false) => ({
  address,
  netmask: "255.255.255.0",
  family: "IPv4" as const,
  mac: "00:00:00:00:00:00",
  internal,
  cidr: null,
});

test("detectLanIPv4 prefers a physical NIC over docker bridges", () => {
  assert.equal(
    detectLanIPv4({
      lo: [nic("127.0.0.1", true)],
      docker0: [nic("172.17.0.1")],
      eth0: [nic("10.0.0.13")],
    }),
    "10.0.0.13",
  );
  assert.equal(localOrigin("3000", "10.0.0.13"), "http://10.0.0.13:3000");
});

test("detectLanIPv4 skips Windows / macOS virtual adapters", () => {
  assert.equal(
    detectLanIPv4({
      "vEthernet (WSL)": [nic("172.28.80.1")],
      "vEthernet (Default Switch)": [nic("172.20.0.1")],
      "VirtualBox Host-Only Network": [nic("192.168.56.1")],
      "VMware Network Adapter VMnet8": [nic("192.168.200.1")],
      "Loopback Pseudo-Interface 1": [nic("127.0.0.1", true)],
      以太网: [nic("192.168.1.20")],
    }),
    "192.168.1.20",
  );
  assert.equal(
    detectLanIPv4({
      bridge100: [nic("192.168.64.1")],
      bridge0: [nic("192.168.2.1")],
      utun3: [nic("100.64.0.2")],
      en0: [nic("192.168.31.8")],
    }),
    "192.168.31.8",
  );
  assert.equal(detectLanIPv4({ "Local Area Connection": [nic("10.1.2.3")] }), "10.1.2.3");
  assert.equal(detectLanIPv4({ Ethernet: [nic("169.254.3.4"), nic("10.9.8.7")] }), "10.9.8.7");
});

test("detectLanIPv4 falls back to loopback instead of a virtual NIC", () => {
  assert.equal(detectLanIPv4({ docker0: [nic("172.17.0.1")] }), "127.0.0.1");
  assert.equal(detectLanIPv4({ "vEthernet (WSL)": [nic("172.28.80.1")] }), "127.0.0.1");
  assert.equal(detectLanIPv4({ bridge100: [nic("192.168.64.1")] }), "127.0.0.1");
  assert.equal(detectLanIPv4({ lo: [nic("127.0.0.1", true)] }), "127.0.0.1");
});
